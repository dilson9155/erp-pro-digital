import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { log } from "@/lib/logger";
import { getTenantScope, isSystemScope, SYSTEM_SCOPE_SENTINEL, type TenantScope } from "@/server/db/tenant-scope";

/**
 * Extensao do Prisma Client: injecao automatica de `tenantId` (fail-closed).
 *
 * Este e o coracao do isolamento multi-tenant. Ver `docs/adr/0002-tenant-isolation.md`.
 *
 * COMO FUNCIONA
 *
 * 1. `TENANT_SCOPED_MODELS` lista os models com a coluna `tenantId`. Ela e
 *    conferida contra `prisma/schema.prisma` E contra o catalogo do Postgres
 *    por `npm run db:verify-tenant`, que falha se houver divergencia. O
 *    caminho inseguro (esquecer um model novo) e barrado no CI.
 *
 * 2. Em leitura/escrita desses models, a extensao INJETA `tenantId` no filtro.
 *
 * 3. Sem escopo ativo, a operacao e RECUSADA. Nao "executa sem filtro": e
 *    exatamente o que vazaria os dados de todas as empresas.
 *
 * 4. Nos models que herdam o escopo do pai (`PARENT_SCOPED_MODELS`, ex.:
 *    `SaleItem`), o filtro automatico nao se aplica. Ler exige que o filtro ja
 *    traga o pai; escrever direto e bloqueado.
 *
 * POR QUE `AND` EM UPDATE/DELETE/UPSERT
 *
 * `update`, `delete` e `upsert` aceitam apenas uma chave unica real, e
 * `tenantId` nao faz parte de nenhuma delas. Filtrar por `id` sozinho
 * permitiria sobrescrever a linha de outra empresa por adivinhacao de id
 * (ids sao `cuid`, sequenciais no tempo e vazam em qualquer resposta de API).
 * Por isso o filtro vira `{ AND: [chave, { tenantId }] }`, que o Prisma aceita
 * em `WhereUniqueInput`.
 */

/**
 * Models com coluna `tenantId`: recebem o filtro automatico.
 *
 * Esta lista e a VERDADE DE EXECUCAO do isolamento. Os nomes sao os MODELS do
 * Prisma, nao os nomes fisicos das tabelas.
 */
const TENANT_SCOPED_MODELS = [
  "Role",
  "Subscription",
  "SubscriptionEvent",
  "BillingInvoice",
  "TenantUsage",
  "Session",
  "Membership",
  "Company",
  "Branch",
  "TenantSetting",
  "Customer",
  "Supplier",
  "Category",
  "Brand",
  "Unit",
  "Product",
  "Service",
  "PaymentMethod",
  "PaymentTerms",
  "StockItem",
  "StockMovement",
  "StockTransfer",
  "StockTransferItem",
  "Inventory",
  "InventoryItem",
  "NumberSequence",
  "Quote",
  "QuoteItem",
  "SalesOrder",
  "SalesOrderItem",
  "Sale",
  "SaleItem",
  "PaymentTransaction",
  "SaleReturn",
  "SaleReturnItem",
  "ReturnReason",
  "CommissionRule",
  "Commission",
  "CommissionItem",
  "ChartOfAccount",
  "CostCenter",
  "FinancialEntry",
  "Settlement",
  "BankAccount",
  "BankReconciliation",
  "BankReconciliationItem",
  "AccountsReceivable",
  "AccountsPayable",
  "Installment",
  "Purchase",
  "PurchaseItem",
  "CashRegister",
  "CashMovement",
  "FiscalIntegration",
  "FiscalConfig",
  "FiscalSeries",
  "Certificate",
  "TaxRule",
  "Invoice",
  "InvoiceItem",
  "InvoiceEvent",
  "FiscalLog",
  "FiscalJob",
  "AuditLog",
  "ConsentLog",
  "DataSubjectRequest",
  "Notification",
  "SupportTicket",
  "SupportMessage",
] as const;

/**
 * Campos de relacao que guardam itens de um model COM `tenantId` proprio.
 *
 * Usado para propagar o tenant em `nested create`. Sem isto, este codigo
 * quebraria, porque a coluna nova e `NOT NULL`:
 *
 * ```ts
 * db.sale.create({ data: { items: { create: [{ ... }] } } })
 * ```
 *
 * O Prisma emite UMA operacao (`create` em `Sale`). O hook nao e chamado para
 * os filhos, entao o `tenantId` deles nunca seria preenchido e o banco
 * recusaria a gravacao por violacao de `NOT NULL`.
 *
 * E falha no lugar certo: e um erro visivel, nao um dado gravado sem dono. Mas
 * quebrar toda criacao de venda para corrigir um detalhe de infraestrutura seria
 * errado, entao a propagacao acontece aqui.
 *
 * Os itens herdam SEMPRE o tenant do pai, nunca um valor informado pelo
 * chamador. E o que garante que a folha e o pai pertencem a mesma empresa.
 */
const NESTED_TENANT_KEYS: ReadonlySet<string> = new Set([
  "items",
  "events",
  "messages",
]);

/**
 * Models SEM `tenantId`, restritos a leitura atraves do pai.
 *
 * Sao as tres tabelas de PONTE de RBAC. Ligam um registro global (`User`,
 * `Permission`) a um registro de empresa e nao guardam dado de negocio:
 * conceder `tenantId` a elas duplicaria o vinculo sem fechar nenhum
 * vazamento real, porque o acesso acontece por `include` do pai, que ja foi
 * filtrado.
 *
 * MESMO ASSIM, ESCRITA DIRETA CONTINUA BLOQUEADA
 *
 * `create: { role: { connect: { id } } }` prova que o papel existe, nao que ele
 * e desta empresa. A gravacao correta e pelo pai. O filtro de leitura e
 * obrigatorio para nao devolver permissoes de empresas alheias.
 */
const PARENT_SCOPED_MODELS = new Set([
  "RolePermission",
  "MembershipRole",
  "UserBranchAccess",
]);

/**
 * Models com `tenantId` NULLABLE no schema, que precisam de regra propria.
 *
 * - `Role`: `tenantId = null` identifica o perfil de SISTEMA (matriz padrao de
 *   permissoes). Cada empresa recebe clones desses perfis. Ler a matriz de
 *   sistema e legitimo, entao o filtro aqui e `OR: [tenantId = atual, isNull]`.
 * - `Session`: `tenantId` e null ANTES do login, na tela de escolha de empresa
 *   (a sessao ja existe, mas ainda nao pertence a nenhuma). Filtrar sessao por
 *   tenant destruiria justamente essa tela. A verificacao real de posse do
 *   token fica em `src/server/auth/session.ts`, o unico autorizado a ler
 *   `Session` diretamente, sempre por `userId` + token opaco do cookie.
 */
const OPTIONAL_TENANT_MODELS = new Set(["Role", "Session"]);

const TENANT_MODEL_SET: ReadonlySet<string> = new Set<string>(TENANT_SCOPED_MODELS);

/** `true` quando o model pertence a um tenant e precisa de filtro automatico. */
export function isTenantScopedModel(model: string): boolean {
  return TENANT_MODEL_SET.has(model);
}

/** `true` quando o model herda o escopo do pai e exige filtro explicito. */
export function isParentScopedModel(model: string): boolean {
  return PARENT_SCOPED_MODELS.has(model);
}

/** Todos os models com `tenantId`. Usado por testes e pelo health check. */
export function tenantScopedModels(): readonly string[] {
  return TENANT_SCOPED_MODELS;
}

/**
 * Erro lancado quando uma operacao de negocio roda sem escopo de tenant.
 *
 * Distinto de `AppError` de proposito: e um bug de PROGRAMACAO (nao entrada de
 * usuario), entao nao deve virar um 403 bonito. Deve virar 500 com alerta no
 * log, para o developer perceber imediatamente.
 */
export class MissingTenantScopeError extends Error {
  readonly operation: string;
  readonly model: string | undefined;

  constructor(operation: string, model: string | undefined) {
    super(
      `Operacao "${operation}"${model ? ` no model "${model}"` : ""} executada sem escopo de ` +
        `tenant. Use getScopedDb() dentro de runWithTenantScope(), ou withTenantScope() em jobs, ` +
        `ou withSystemScope({ reason }) para acesso cross-tenant justificado.`,
    );
    this.name = "MissingTenantScopeError";
    this.operation = operation;
    this.model = model;
  }
}

/** Erro lancado ao escrever direto em um model que herda o escopo do pai. */
export class ParentScopedWriteError extends Error {
  constructor(operation: string, model: string) {
    super(
      `Escrita direta em "${model}" (${operation}) bloqueada: este model herda o tenant do pai. ` +
        `Crie ou atualize pelo pai, ex.: db.sale.create({ data: { items: { create: [...] } } }).`,
    );
    this.name = "ParentScopedWriteError";
  }
}

type Mutable = Record<string, unknown>;

function isMutable(value: unknown): value is Mutable {
  return typeof value === "object" && value !== null;
}

/**
 * Acrescenta o filtro do tenant preservando a semantica do filtro existente.
 *
 * O `tenantId` entra no nivel EXTERIOR do `where`. Isso e o que garante o
 * `AND` implicito com as condicoes do chamador, inclusive quando ele usa `OR`,
 * `NOT` ou `AND` aninhados. Envolver num `{ AND: [...] }` daria o mesmo
 * resultado; a forma plana mantem o SQL gerado mais simples.
 */
function withTenantFilter(where: unknown, tenantId: string): Mutable {
  if (where === undefined || where === null) return { tenantId };
  // `where` escalar e invalido no Prisma; deixa o Prisma emitir o erro dele.
  if (!isMutable(where)) return where as Mutable;
  return { ...where, tenantId };
}

/**
 * Variante para `Role`: inclui a matriz de sistema (`tenantId IS NULL`).
 *
 * Sem isto, uma empresa nao conseguiria ler a matriz de permissoes que ela
 * mesma clonou, e o RBAC quebraria no primeiro acesso.
 */
function withTenantOrSystemFilter(where: unknown, tenantId: string): Mutable {
  const base = isMutable(where) ? { ...where } : {};
  const { OR: _ignored, ...rest } = base;
  return { ...rest, OR: [{ tenantId }, { tenantId: null }] };
}

/**
 * Verifica se o filtro ja restringe o escopo do pai.
 *
 * Aceita `tenantId` em qualquer nivel do `where` (ex.: `{ sale: { tenantId } }`).
 * E uma verificacao estrutural, nao semantica: ela exige que o codigo aponte o
 * filtro, sem tentar provar que o valor e o do tenant corrente. Por isso o
 * valor tem de vir do escopo, nunca de entrada do usuario.
 */
function filterMentionsTenant(where: unknown): boolean {
  if (Array.isArray(where)) return where.some(filterMentionsTenant);
  if (!isMutable(where)) return false;
  for (const [key, value] of Object.entries(where)) {
    if (key === "tenantId") return true;
    if (filterMentionsTenant(value)) return true;
  }
  return false;
}

/** Operacoes cujo `where` recebe o filtro do tenant. */
const READ_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "delete",
  "updateMany",
  "deleteMany",
  "upsert",
]);

/** Operacoes que criam linhas. */
const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

/**
 * DECISAO PURA DO GUARD, sem dependencia de banco.
 *
 * Recebe a operacao e os argumentos, e:
 * - lanca, se a operacao nao pode acontecer; ou
 * - reescreve `args` in-place com o filtro do tenant; ou
 * - devolve `false`, se a operacao deve seguir intacta (model sem escopo).
 *
 * Extrair isso da extensao tem um motivo: a logica de seguranca fica
 * verificavel SEM subir um Postgres. `tests/unit/tenant-guard.test.ts` exercita
 * os cenarios de vazamento direto contra esta funcao. Se a logica morresse
 * dentro do callback do Prisma, o unico jeito de testa-la seria com banco de
 * verdade, e bugs de isolamento raramente sao testados.
 *
 * @returns `true` se a operacao foi tratada (args talvez modificados).
 */
export function applyTenantGuard(
  model: string,
  operation: string,
  args: Mutable,
  scope: TenantScope | null,
): boolean {
  if (!isTenantScopedModel(model)) {
    if (isParentScopedModel(model)) guardParentScoped(model, operation, args);
    return false;
  }

  // ---- FAIL CLOSED ------------------------------------------------------
  // Sem escopo, a query NAO roda. Ler sem filtro devolveria linhas de todos os
  // tenants: exatamente o vazamento que este modulo existe para impedir.
  if (!scope) throw new MissingTenantScopeError(operation, model);

  // Acesso cross-tenant explicito (super admin da plataforma, jobs de
  // manutencao). `withSystemScope` ja registrou um `warn` no log.
  if (isSystemScope(scope)) return true;

  // Sentinela fora de `withSystemScope` e falha, nao vaza.
  if (scope.tenantId === SYSTEM_SCOPE_SENTINEL) {
    throw new MissingTenantScopeError(operation, model);
  }

  if (CREATE_OPERATIONS.has(operation)) {
    injectTenantOnCreate(args, scope.tenantId);
    return true;
  }

  // Nunca permitir MOVER uma linha para outra empresa via `data`. Isso e sempre
  // um bug, e o filtro do `where` nao impediria.
  if (operation === "update" || operation === "updateMany") {
    assertTenantNotMoved(model, operation, args.data, scope.tenantId);
  }

  if (!READ_OPERATIONS.has(operation)) return true;

  if (operation === "update" || operation === "delete" || operation === "upsert") {
    // `WhereUniqueInput` nao aceita o filtro achatado, entao o tenant vai
    // dentro de um `AND` com a chave unica do chamador.
    args.where = { AND: [args.where ?? {}, buildTenantClause(model, scope.tenantId)] };

    if (operation === "upsert") {
      const create = args.create;
      if (isMutable(create) && create.tenantId === undefined) {
        args.create = { ...create, tenantId: scope.tenantId };
      }
      assertTenantNotMoved(model, operation, args.update, scope.tenantId);
    }
    return true;
  }

  args.where = OPTIONAL_TENANT_MODELS.has(model)
    ? withTenantOrSystemFilter(args.where, scope.tenantId)
    : withTenantFilter(args.where, scope.tenantId);
  return true;
}

function assertTenantNotMoved(model: string, operation: string, data: unknown, tenantId: string): void {
  if (isMutable(data) && data.tenantId !== undefined && data.tenantId !== tenantId) {
    log("tenant-guard").error(
      { model, operation, tenantId },
      "tentativa de mover registro para outro tenant bloqueada",
    );
    throw new Error(`Nao e permitido alterar tenantId de "${model}".`);
  }
}

/**
 * Extensao aplicada ao client do Prisma.
 *
 * Cobre TODAS as operacoes via `$allOperations`, e nao uma lista nominal: a
 * falha aberta e o risco, e uma operacao esquecida seria um vazamento
 * silencioso.
 */
export function tenantGuardExtension() {
  return Prisma.defineExtension({
    name: "tenant-guard",

    query: {
      $allModels: {
        async $allOperations({ model, operation, args: rawArgs, query }) {
          // O Prisma tipa `args` como a UNIAO de todos os argumentos de todos
          // os models e operacoes. O guard e, por natureza, dinamico: decide
          // pelo nome do model em tempo de execucao. O cast e seguro porque a
          // extensao so LE e ESCREVE chaves que o Prisma define em todos os
          // args (`where`, `data`, `create`, `update`), e nunca inventa uma.
          const args = rawArgs as unknown as Mutable;

          const handled = applyTenantGuard(model, operation, args, getTenantScope());

          // `handled === false`: model sem escopo de tenant (plataforma).
          // Os args seguem intactos, como o Prisma os entregou.
          return handled ? query(args) : query(rawArgs);
        },
      },
    },
  });
}

function buildTenantClause(model: string, tenantId: string): Mutable {
  if (model === "Role") {
    return { OR: [{ tenantId }, { tenantId: null }] };
  }
  return { tenantId };
}

/**
 * Injeta `tenantId` em `create` / `createMany`, incluindo os itens aninhados.
 *
 * Nao sobrescreve valor explicito, EXCETO no item aninhado: ali o valor do
 * chamador e sempre descartado, porque a folha tem de pertencer a mesma empresa
 * do pai. Aceitar um `tenantId` diferente no item criaria uma linha de uma
 * empresa dentro do documento de outra — invisivel no CRUD e assimetrica no
 * relatorio.
 */
function injectTenantOnCreate(args: Mutable, tenantId: string): void {
  const data = args.data;
  if (Array.isArray(data)) {
    args.data = data.map((row) => {
      if (!isMutable(row)) return row;
      return { ...withNestedTenant(row, tenantId), tenantId };
    });
    return;
  }
  if (isMutable(data)) {
    args.data = { ...withNestedTenant(data, tenantId), tenantId };
  }
}

/**
 * Propaga o tenant para os itens criados junto com o pai.
 *
 * Percorre apenas as chaves conhecidas de relacao (`items`, `events`,
 * `messages`). Um percorrimento recursivo cego seria mais simples, mas
 * entraria em `where`, `select` e afins, onde `tenantId` nao pertence e
 * estragaria a query.
 */
function withNestedTenant(row: Mutable, tenantId: string): Mutable {
  let changed = false;
  const result: Mutable = { ...row };

  for (const key of NESTED_TENANT_KEYS) {
    const nested = result[key];
    if (nested === undefined) continue;

    // `items: { create: [...] }` ou `items: { createMany: { data: [...] } }`
    const container = isMutable(nested) ? nested : undefined;
    if (!container) continue;

    if (Array.isArray(container.create)) {
      container.create = container.create.map((child) =>
        isMutable(child) ? { ...withNestedTenant(child, tenantId), tenantId } : child,
      );
      changed = true;
    }

    const manyData = container.createMany && isMutable(container.createMany)
      ? (container.createMany as Mutable).data
      : undefined;
    if (Array.isArray(manyData)) {
      (container.createMany as Mutable).data = manyData.map((child) =>
        isMutable(child) ? { ...withNestedTenant(child, tenantId), tenantId } : child,
      );
      changed = true;
    }
  }

  return changed ? result : row;
}

/**
 * Aplica as regras dos models que herdam o escopo do pai.
 *
 * `create` e `createMany` ficam bloqueados: `connect: { id }` prova que a linha
 * pai existe, nao que ela e deste tenant. A gravacao correta e via `nested
 * create` no pai, que ja passou pelo filtro.
 */
function guardParentScoped(model: string, operation: string, args: Mutable): void {
  if (CREATE_OPERATIONS.has(operation)) throw new ParentScopedWriteError(operation, model);
  if (operation === "update" || operation === "updateMany" || operation === "upsert") {
    if (filterMentionsTenant(args.where)) return;
    throw new ParentScopedWriteError(operation, model);
  }
  // Leitura: exige que o filtro ja aponte o pai com o tenant.
  if (!filterMentionsTenant(args.where)) {
    throw new MissingTenantScopeError(operation, model);
  }
}

/**
 * Aplica `tenantGuardExtension` a um client.
 *
 * O tipo de retorno e o proprio `PrismaClient`, e isso e intencional. A extensao
 * nao adiciona metodos, campos nem delegates: ela apenas REESCREVE os
 * argumentos antes de chegarem ao Prisma. Do ponto de vista de quem chama, a
 * superficie da API e identica a do client comum, entao `TenantScopedClient` e
 * `PrismaClient`.
 *
 * Derivar o tipo via `typeof base.$extends(...)` cria uma referencia
 * circular (o resultado depende da propria extensao que o define) e o
 * TypeScript rejeita. Como nao ha API nova, nao ha nada a perder.
 */
export function extendWithTenantGuard(base: PrismaClient): TenantScopedClient {
  return base.$extends(tenantGuardExtension()) as unknown as TenantScopedClient;
}

/**
 * Client com o guard aplicado. Igual a `PrismaClient` na assinatura; o que
 * muda e o COMPORTAMENTO (filtro automatico e recusa sem escopo).
 */
export type TenantScopedClient = PrismaClient;
