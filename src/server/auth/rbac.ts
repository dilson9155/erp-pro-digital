/**
 * Execucao de RBAC: o unico lugar do sistema que le `MembershipRole` para
 * DECIDIR se uma operacao acontece.
 *
 * Este modulo e a camada de EXECUCAO. O schema (`Role`, `Permission`,
 * `RolePermission`, `MembershipRole`) e a camada de DADOS; `policy.ts` e a
 * camada de DECISAO de identidade (status, troca de senha, escolha de empresa).
 * O que falta entre elas e este arquivo: o verbo que o resto do codigo chama
 * antes de escrever no banco.
 *
 * POR QUE UM VERBO E NAO UM SELECT ESPALHADO
 *
 * Duas formas ruins de fazer isto, e as duas silenciosas:
 *
 * 1. Cada Server Action carrega `roles` e decide sozinha. A decisao se duplica
 *    em dezenas de acoes, e o dia que uma delas esquecer de filtrar
 *    `role.active`, so aquela acao fica furada — o resto continua seemingly
 *    correto e os testes das outras nao acusam.
 * 2. O `proxy.ts` decide, e o proxy nao conhece o usuario. Ele so tem o cookie.
 *    Chegar o token ate o layout significa que o `if` de permissao fica no
 *    lugar errado: a pagina carrega, o dado some, e a acao de escrita (que roda
 *    depois, no server) nunca foi checada.
 *
 * O verbo centraliza a consulta e, principalmente, centraliza a DECISAO: um
 * lugar para auditar "quem pode fazer o que", e um lugar para provar em teste
 * que as exclusoes (perfil inativo, perfil apagado, perfil de sistema, modulo
 * fora do plano) sao respeitadas.
 *
 * POR QUE `requirePermission` LANCA e `can` NAO
 *
 * Duas portas com contratos diferentes:
 * - `can()` responde para a UI ("mostrar botao?"). Nao lanca: a UI PRECISA
 *   renderizar o botao escondido, e um `throw` la derrubaria a pagina inteira.
 * - `requirePermission()` e o portao das Server Actions. Lanca `AppError` com
 *   403. Aqui lancar e o comportamento CORRETO: uma acao de escrita que chegou
 *   ate a camada de escrita sem permissao e um bug ou um ataque, e nos dois
 *   casos a resposta certa e 403 — nunca um sucesso parcial nem uma tela que
 *   "funciona mas nao salvou".
 *
 * A UI esconder botao e CONVENIENCIA, nao seguranca. Se alguem chamar a Server
 * Action direto (curl, fetch no console), o `requirePermission` e o que barra.
 * Por isso esconder o botao e complemento, nunca a protecao.
 *
 * POR QUE O GATE DE PLANO ESTA AQUI
 *
 * O plano contratado (`PlanModule`) e a PERMISSao sao filtros ortogonais, e os
 * dois precisam passar:
 * - o plano diz se o modulo foi COMPRADO;
 * - o perfil diz se o USUARIO pode usar.
 *
 * Se so o perfil existisse, um plano basico com um perfil generico daria acesso
 * ao modulo premium. Se so o plano existisse, todo usuario do tenant usaria
 * tudo que a empresa comprou. O porque de os dois estarem no mesmo arquivo: sao
 * as duas metades de UM gate, e um gate pela metade passa em teste e falha em
 * producao.
 */

import { prismaCommon } from "@/server/db/client";
import { AppError, ErrorCode, type ErrorCodeValue } from "@/lib/errors";
import { chavePermissao, type PedidoPermissao } from "@/lib/rbac/permissions";
import { RoleScope, SubscriptionStatus } from "@/generated/prisma/enums";
import type { PlanModuleKey } from "@/generated/prisma/enums";

/** Input minimo para resolver as permissoes de uma sessao. */
export interface ContextoRbac {
  /** `Membership.id` da sessao. `null` = sessao ainda sem empresa escolhida. */
  readonly membershipId: string | null;
  /** `User.id`, so para auditoria. Nao concede nada. */
  readonly userId: string | null;
  /** `Session.id`, so para auditoria. Nao concede nada. */
  readonly sessionId: string | null;
  /** Tenant da sessao, para checar o gate de plano. */
  readonly tenantId: string | null;
}

/** Uma `Permission` concedida, ja filtrada. */
export interface PermissaoEfetiva {
  readonly key: string;
  readonly actions: readonly string[];
}

/**
 * Resultado da resolucao, com o diagnostico do gate de plano separado.
 *
 * `modulosFaltantes` existe para o log distinguir "o perfil nao tem a
 * permissao" de "o tenant nao contratou o modulo". A UI e a resposta ao cliente
 * recebem a mesma mensagem nos dois casos (a distincao vaza informacao do plano
 * de terceiros), mas o log de autorizacao precisa da distincao para o suporte
 * saber se e upgrade de plano ou ajuste de perfil.
 */
export interface ResolucaoRbac {
  /** `key` -> acoes concedidas. Vazio quando o gate de plano reprova. */
  readonly permissoes: ReadonlyMap<string, readonly string[]>;
  /** Modulos exigidos que NAO estao no plano do tenant. */
  readonly modulosFaltantes: readonly string[];
  /** `true` quando a assinatura esta CANCELADA ou BLOQUEADA. */
  readonly assinaturaBloqueada: boolean;
}

/**
 * Status de assinatura que NAO liberam uso do produto.
 *
 * CANCELADA e BLOQUEADA cortam o acesso. PENDENTE e ATRASADA liberam: sao
 * situacoes transitorias de cobranca, e cortar o ERP inteiro por um atraso
 * derruba a operacao da empresa — que e o oposto do que um SaaS quer. TRIAL e
 * ATIVA liberam.
 *
 * Este e o unico ponto que decide "assinatura bloqueada?". O espelho
 * `Tenant.subscriptionStatus` existe para leitura rapida no proxy, mas a
 * VERDADE e a `Subscription` (o preco e congelado la). Por isso consultamos a
 * relacao e nao o espelho: se os dois divergirem, a `Subscription` ganha, e a
 * divergencia passa a ser bug de dado, nao de regra.
 */
function assinaturaBloqueia(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.CANCELADA || status === SubscriptionStatus.BLOQUEADA;
}

/**
 * Extrai o modulo de uma chave de `Permission` (`modulo.recurso`).
 *
 * Devolve `null` quando a chave nao tem ponto. Isso acontece com as permissoes
 * de plataforma (`platform.*`), que nao pertencem a nenhum modulo contratado e
 * por isso nao passam pelo gate de plano.
 */
function moduloDaChave(chave: string): string | null {
  const i = chave.indexOf(".");
  if (i <= 0) return null;
  return chave.slice(0, i);
}

/**
 * Resolve as permissoes EFETIVAS da sessao.
 *
 * Devolve o conjunto ja sem perfis inativos, sem perfis apagados, sem perfis de
 * sistema e sem o que o plano nao cobre. E o mesmo conjunto que `can` consulta e
 * que a tela de perfil desenha — se a UI usasse outra fonte, ela mentiria sobre
 * o que o usuario pode fazer.
 *
 * Cada exclusao esta no `where` do proprio Prisma (e nao em um `filter`
 * depois) para que o banco nunca traga a linha que seria descartada: menos dado
 * em transito, e nenhuma chance de o filtro ser esquecido num refactor futuro.
 */
export async function resolverRbac(ctx: ContextoRbac): Promise<ResolucaoRbac> {
  const vazio: ResolucaoRbac = {
    permissoes: new Map(),
    modulosFaltantes: [],
    assinaturaBloqueada: false,
  };

  // Sem membership nao ha perfil, e sem perfil nao ha permissao. Retorna vazio em
  // vez de lancar porque `can()` e usado pela UI para decidir se esconde o menu
  // inteiro — la um `throw` derrubaria a pagina.
  if (!ctx.membershipId) return vazio;

  const membership = await prismaCommon.membership.findUnique({
    where: { id: ctx.membershipId },
    select: {
      tenantId: true,
      active: true,
      deletedAt: true,
      roles: {
        where: {
          role: {
            // Perfil inativo ou logicamente apagado nao concede nada.
            active: true,
            deletedAt: null,
            // `SYSTEM` sao perfis internos do motor (ex.: "sistema-fiscal"). Se
            // um deles aparecesse ligado a uma `Membership` humana, o usuario
            // herdaria uma permissao de sistema. Excluir aqui e a defesa: mesmo
            // que o seed estrague a ligacao, o grant nao vira acesso.
            scope: { not: RoleScope.SYSTEM },
          },
        },
        select: {
          role: {
            select: {
              // `tenantId` vem porque o filtro de dono NAO pode ser feito no
              // `where` do Prisma: ele depende do valor do PAI (a membership), e
              // um `where` aninhado nao alcanca o campo do pai. Ver o filtro
              // abaixo.
              tenantId: true,
              permissions: {
                // `actions` vem do VINCULO (`RolePermission`), nao da `Permission`:
                // e o perfil que tem granularidade. Ler da permissao daria a
                // todos os perfis exatamente o mesmo poder sobre o recurso.
                select: {
                  actions: true,
                  permission: { select: { key: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Membership inexistente, inativa ou apagada: sem permissoes.
  if (!membership || !membership.active || membership.deletedAt !== null) {
    return vazio;
  }

  const concedidas: PermissaoEfetiva[] = [];
  for (const mr of membership.roles) {
    // `MembershipRole` nao tem `tenantId`, e `RolePermission` tambem nao: nada no
    // schema impede ligar o perfil do tenant A a uma membership do tenant B, e
    // essa ligacao concede acesso de verdade. O filtro e o unico lugar do sistema
    // que fecha isso.
    //
    // E o filtro roda AQUI, e nao no `where` acima, porque precisa do
    // `tenantId` da membership — que e o campo do PAI da consulta, inacessivel a
    // um `where` aninhado. O custo e Trivial: um usuario tem poucos perfis, e
    // comparar dois ids nao custa mais que o `findUnique` que ja foi feito.
    //
    // `tenantId: null` e o perfil GLOBAL, que e legitimo: o seed cria um
    // "Operador" padrao uma vez e todos os tenants usam. Rejeitar tambem o nulo
    // seria trocar um bug de seguranca por um bug de funcionalidade.
    const donoValido =
      mr.role.tenantId === null || mr.role.tenantId === membership.tenantId;
    if (!donoValido) continue;

    for (const rp of mr.role.permissions) {
      concedidas.push({ key: rp.permission.key, actions: rp.actions });
    }
  }

  const plano = await planoDoTenant(ctx.tenantId, concedidas);
  if (plano.assinaturaBloqueada || plano.modulosFaltantes.length > 0) {
    // Falha de plano: NAO devolve parte das permissoes. Permitir "menos um modulo"
    // significaria que o usuario opera em um sistema parcialmente contratado, o
    // que nobody contratou e ninguem espera. Vazio e a unica saida coerente.
    return { permissoes: new Map(), ...plano };
  }

  // Achata as permissoes de todos os perfis (a uniao). `Map<key, actions>`
  // porque a uniao e por chave: dois perfis podem cobrir o mesmo recurso com
  // acoes diferentes, e a uniao dessas acoes e o que o usuario pode fazer.
  const permissoes = new Map<string, readonly string[]>();
  for (const p of concedidas) {
    const anterior = permissoes.get(p.key);
    if (!anterior) {
      permissoes.set(p.key, [...p.actions]);
      continue;
    }
    if (anterior.length === p.actions.length) continue;
    permissoes.set(p.key, [...new Set([...anterior, ...p.actions])]);
  }

  return { permissoes, modulosFaltantes: [], assinaturaBloqueada: false };
}

/**
 * Cruza as permissoes concedidas com o que o tenant contratou.
 *
 * A checagem e por `Permission.module`, o agrupamento do app, igual ao
 * `PlanModuleKey` do enum. Como `Permission.module` e `String` (livre) e
 * `PlanModuleKey` e `enum`, o cruzamento e por igualdade de texto: um modulo de
 * permissao que nao casa com nenhum `PlanModuleKey` esta "nao contratado", e o
 * codigo e fail-closed de proposito — assim um typo em `Permission.module`
 * bloqueia em vez de liberar.
 */
async function planoDoTenant(
  tenantId: string | null,
  concedidas: readonly PermissaoEfetiva[],
): Promise<{ modulosFaltantes: readonly string[]; assinaturaBloqueada: boolean }> {
  // Modulos distintos exigidos pelas permissoes concedidas.
  const exigidos = new Set<string>();
  for (const p of concedidas) {
    const modulo = moduloDaChave(p.key);
    if (modulo) exigidos.add(modulo);
  }
  if (exigidos.size === 0) {
    // Nenhuma permissao de modulo de produto (so `platform.*`): o gate de plano
    // nao se aplica.
    return { modulosFaltantes: [], assinaturaBloqueada: false };
  }

  // Sem tenant nao ha plano consultavel. Fail-closed.
  if (!tenantId) {
    return { modulosFaltantes: [...exigidos], assinaturaBloqueada: false };
  }

  const assinatura = await prismaCommon.subscription.findUnique({
    where: { tenantId },
    select: {
      status: true,
      plan: { select: { modules: { select: { module: true } } } },
    },
  });

  // Sem assinatura nao ha nada contratado.
  if (!assinatura) {
    return { modulosFaltantes: [...exigidos], assinaturaBloqueada: false };
  }

  if (assinaturaBloqueia(assinatura.status)) {
    return { modulosFaltantes: [], assinaturaBloqueada: true };
  }

  const contratados = new Set<string>(assinatura.plan.modules.map((m) => m.module));
  const faltantes = [...exigidos].filter((m) => !contratados.has(m as PlanModuleKey));

  return { modulosFaltantes: faltantes, assinaturaBloqueada: false };
}

/**
 * O gate unico: checa perfil E plano e devolve o resultado tipado.
 *
 * `can` e `requirePermission` sao as duas portas sobre esta funcao. Centralizar
 * aqui garante que "o que a UI mostra" e "o que a acao exige" usem a MESMA
 * avaliacao, e nao duas implementacoes que concordam ate a primeira divergencia.
 */
async function gate(
  ctx: ContextoRbac,
  pedido: PedidoPermissao,
): Promise<{ ok: true } | { ok: false; code: ErrorCodeValue }> {
  // Valida a tripla ANTES de consultar. Chave malformada e bug de programacao;
  // `chavePermissao` lanca, e o erro escapa — o que e desejado, porque um
  // modulo/recurso/acao invalido no codigo tem de aparecer no primeiro teste, nao
  // virar um "negado" silencioso em producao.
  chavePermissao(pedido);

  const { permissoes, modulosFaltantes, assinaturaBloqueada } = await resolverRbac(ctx);

  if (assinaturaBloqueada) {
    return { ok: false, code: ErrorCode.SUBSCRIPTION_BLOCKED };
  }

  // O modulo do que foi PEDIDO esta fora do plano? Entao o obstaculo e o
  // contrato, e nao o perfil — a correcao que a pessoa precisa e outra, e dizer
  // "sem permissao" mandaria ela editar um perfil que ja esta correto.
  //
  // `modulosFaltantes` traz NOMES DE MODULO (vem de `moduloDaChave`), entao a
  // comparacao e com `pedido.modulo`, e nao com `modulo.recurso`.
  //
  // Note que a lista so contem modulos que o usuario TEM permissao de. Se ele
  // nao tem a permissao de `ESTOQUE` e o plano tampouco contratou, a resposta
  // e "sem permissao": o obstaculo real e o perfil, e ai a empresa tambem
  // precisaria de upgrade — mas a acao que desbloqueia primeiro e o perfil.
  if (modulosFaltantes.includes(pedido.modulo)) {
    return { ok: false, code: ErrorCode.MODULE_NOT_ENABLED };
  }

  // A permissao esta concedida, com a acao no conjunto que ESTE perfil recebeu?
  const actions = permissoes.get(`${pedido.modulo}.${pedido.recurso}`);
  if (actions?.includes(pedido.acao)) {
    return { ok: true };
  }

  return { ok: false, code: ErrorCode.INSUFFICIENT_PERMISSIONS };
}

/**
 * O usuario PODE executar a operacao? Responde sem lancar, para a UI.
 *
 * Nao e seguranca — a protecao e `requirePermission` na Server Action. Esta
 * funcao existe para a interface NAO oferecer o que sera negado.
 */
export async function can(ctx: ContextoRbac, pedido: PedidoPermissao): Promise<boolean> {
  const resultado = await gate(ctx, pedido);
  return resultado.ok;
}

/**
 * Exige a permissao e LANCA `AppError` (403 / 402) se faltar.
 *
 * E o portao das Server Actions de escrita. `can()` e `requirePermission()`
 * compartilham `gate()`, entao a UI e a acao nunca discordam sobre a mesma
 * tripla.
 */
export async function requirePermission(
  ctx: ContextoRbac,
  pedido: PedidoPermissao,
): Promise<void> {
  const resultado = await gate(ctx, pedido);
  if (resultado.ok) return;
  throw new AppError(resultado.code);
}
