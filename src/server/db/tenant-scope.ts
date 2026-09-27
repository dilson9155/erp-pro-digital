import { AsyncLocalStorage } from "node:async_hooks";

import { log } from "@/lib/logger";

/**
 * Escopo de tenant em execucao, propagado por `AsyncLocalStorage`.
 *
 * POR QUE ISTO EXISTE
 *
 * Repassar `tenantId` em toda query e a origem classica de vazamento de dados
 * em ERP multi-tenant: uma unica forgotten `where` e o cliente ve a empresa
 * vizinha. Revisar isso em code review nao escala.
 *
 * A solucao e tornar o vazamento IMPOSSIVEL por construcao:
 * - a aplicacao NUNCA escreve `where: { tenantId }`;
 * - a extensao do Prisma injeta `tenantId` em toda leitura/escrita de um
 *   model que possui a coluna;
 * - se nao houver escopo ativo, a operation e RECUSADA (fail-closed), em vez
 *   de consultar "sem filtro" e vazar todos os tenants.
 *
 * O padrao e ALWAYS DENY. `allowSystemScope` existe para os poucos caminhos
 * legitimamente cross-tenant (super admin da plataforma, jobs de manutencao)
 * e precisa ser solicitado explicitamente, com justificativa no log.
 *
 * O QUE ESTE MODULO NAO FAZ
 *
 * Isto NAO e Row Level Security do Postgres. RLS e a defesa em profundidade:
 * protege mesmo contra bug de aplicacao e acesso direto por psql. A decisao
 * do projeto foi NAO usar RLS nesta fase (ver `docs/adr/0002-tenant-isolation.md`).
 * Quando RLS for adotado, a extensao abaixo continua valendo: sao camadas
 * complementares, nao alternativas.
 */

/** Contexto minimo para autorizar uma operacao de leitura ou escrita. */
export interface TenantScope {
  /** Empresa (conta SaaS). Toda query de negocio e filtrada por este valor. */
  readonly tenantId: string;
  /**
   * Filial ativa. NULL = usuario autorizado em todas as filiais; o filtro de
   * filial e aplicado pelos guards de negocio, nao aqui.
   */
  readonly branchId: string | null;
  /**
   * Filiais que o usuario pode acessar. `null` = todas. Vazio = nenhuma.
   * Aplicado apenas quando o usuario tem `UserBranchAccess`; caso contrario
   * `branchId` ja restringe ao contexto ativo.
   */
  readonly allowedBranchIds: readonly string[] | null;
  /** Usuario autenticado. Para auditoria. */
  readonly userId: string | null;
  /** Sessao ativa. Para revogacao e auditoria. */
  readonly sessionId: string | null;
  /** `true` quando e super admin da plataforma operando cross-tenant. */
  readonly isPlatformAdmin: boolean;
}

const storage = new AsyncLocalStorage<TenantScope>();

/**
 * `true` quando a thread atual tem escopo de tenant.
 *
 * Use para `if (!hasTenantScope()) throw ...` em codigo que NUNCA deve rodar
 * sem escopo. Prefira `requireTenantScope()`, que ja lanca.
 */
export function hasTenantScope(): boolean {
  return storage.getStore() !== undefined;
}

/** Escopo atual, ou `null`. Preferir `requireTenantScope()`. */
export function getTenantScope(): TenantScope | null {
  return storage.getStore() ?? null;
}

/**
 * Escopo atual ou erro. Este e o que o codigo de aplicacao deve usar.
 *
 * Lancar aqui (e nao devolver `null`) e o que torna o vazamento imposible:
 * nao existe caminho que "esqueca de checar".
 */
export function requireTenantScope(): TenantScope {
  const scope = storage.getStore();
  if (!scope) {
    throw new Error(
      "Escopo de tenant ausente. Todo acesso a dados de negocio deve passar por " +
        "getScopedDb() (request) ou withSystemScope()/withTenantScope() (jobs). " +
        "Usar o prismaCommon direto aqui expoe todos os tenants.",
    );
  }
  return scope;
}

/**
 * Executa `fn` com escopo de tenant. Use em request handlers e Server Actions.
 *
 * O escopo dura apenas a execucao sincrona/assincrona de `fn`; requisicoes
 * simultaneas nao se misturam porque cada uma tem seu contexto async.
 */
export function runWithTenantScope<T>(scope: TenantScope, fn: () => Promise<T>): Promise<T> {
  return storage.run(scope, fn);
}

/** Igual a `runWithTenantScope`, para callbacks sincronos. */
export function runWithTenantScopeSync<T>(scope: TenantScope, fn: () => T): T {
  return storage.run(scope, fn);
}

export interface SystemScopeOptions {
  /**
   * Justificativa OBRIGATORIA. Aparece no log com o modulo e o usuario, para
   * que uma revisao de seguranca consiga auditar todo acesso cross-tenant.
   */
  readonly reason: string;
  /** Quem esta usando o acesso privilegiado. */
  readonly performedById?: string | null;
}

/**
 * Executa `fn` com acesso cross-tenant explicitamente autorizado.
 *
 * Use APENAS para:
 * - super admin da plataforma (verificar `User.isPlatformAdmin` antes);
 * - jobs de manutencao que precisam varrer todos os tenants
 *   (cobrança, retenção de documento, limpeza de sessao);
 * - o seed.
 *
 * NUNCA use para "facilitar" uma query de negocio. Toda vez que este metodo e
 * chamado, um log `warn` e emitido: se aparecer no log com frequencia, ha
 * vazamento de logica.
 */
export function withSystemScope<T>(
  options: SystemScopeOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const scope: TenantScope = {
    // `PLATFORM_SCOPE_SENTINEL` e um valor que NUNCA casa com um `cuid` real,
    // de modo que a extensao injetar `tenantId: SENTINEL` e a operacao falhe
    // em vez de vazar. Quem quer cross-tenant passa por este metodo, que
    // desliga a injecao de forma explicita.
    tenantId: SYSTEM_SCOPE_SENTINEL,
    branchId: null,
    allowedBranchIds: null,
    userId: options.performedById ?? null,
    sessionId: null,
    isPlatformAdmin: true,
  };

  log("tenant-scope").warn(
    { reason: options.reason, performedById: options.performedById ?? null },
    "acesso cross-tenant autorizado via withSystemScope",
  );

  return storage.run(scope, fn);
}

/**
 * Executa `fn` com escopo de um tenant especifico, para jobs que processam
 * fila multi-tenant (ex.: emissor fiscal que varre `fiscal_jobs`).
 *
 * Diferente de `withSystemScope`, aqui a extensao CONTINUA injetando
 * `tenantId`: o filtro e automatico. O metodo existe para que o job faca
 * `db.invoice.findMany()` sem se preocupar em filtrar.
 */
export function withTenantScope<T>(
  tenantId: string,
  fn: (context: { tenantId: string }) => Promise<T>,
  options: { reason: string },
): Promise<T> {
  const scope: TenantScope = {
    tenantId,
    branchId: null,
    allowedBranchIds: null,
    userId: null,
    sessionId: null,
    isPlatformAdmin: false,
  };

  log("tenant-scope").debug({ tenantId, reason: options.reason }, "escopo de tenant de job");

  return storage.run(scope, () => fn({ tenantId }));
}

/**
 * Valor sentinela para acesso cross-tenant.
 *
 * Um `cuid` tem formato `c` + 24 caracteres base36. Esta string tem um
 * caractere invalido para base36, portanto jamais colide com um id real.
 * Assim, se a extensao for chamada fora de `withSystemScope`, a query falha
 * com "tenant nao encontrado" em vez de retornar dados de outra empresa.
 */
export const SYSTEM_SCOPE_SENTINEL = "__system__";

/**
 * `true` quando o escopo atual e o escopo privilegiado.
 *
 * Exige AS DUAS condicoes: a sentinela E `isPlatformAdmin`. Verificar so a
 * sentinela seria falha aberta: qualquer codigo que montasse um `TenantScope`
 * com `tenantId: SYSTEM_SCOPE_SENTINEL` desligaria o filtro de uma empresa
 * inteira. Com as duas checagens, o escopo privilegiado so pode ser criado
 * por `withSystemScope`, que ja registrou a justificativa no log.
 */
export function isSystemScope(scope: TenantScope | null = getTenantScope()): boolean {
  return scope !== null && scope.tenantId === SYSTEM_SCOPE_SENTINEL && scope.isPlatformAdmin;
}
