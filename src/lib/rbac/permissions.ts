/**
 * vocabulario de permissao.
 *
 * Este e o modulo PURO: nao toca banco, nao importa Prisma, e por isso roda em
 * qualquer contexto (Server Action, middleware, script, teste). Ele responde a
 * pergunta "esta tripla modulo.recurso.acao faz sentido?" e devolve as acoes
 * canonicas. A DECISAO de conceder ou negar acontece em `src/server/auth/rbac.ts`,
 * que e o unico lugar que le `MembershipRole`.
 *
 * POR QUE A CHAVE E UMA TRIPLA E NAO UMA STRING SOLTA
 *
 * O schema tem `Permission.key` como unico (VarChar(80)) e `actions` como array.
 * Duas opcoes seriam codificar `vendas.venda.create` em `key` (uma linha por
 * acao) OU usar `key = vendas.venda` com `actions = [...]` (uma linha por
 * recurso). A segunda e a escolhida aqui porque:
 *
 * - um perfil editorial lista recurso e marca acoes, nao repete a chave por
 *   acao; a tela de configuracao de perfis fica trivial;
 * - a contagem de linhas de `permissions` cai de ~300 para ~80, o que torna o
 *   seed e o cache mais leves.
 *
 * A tripla `(modulo, recurso, acao)` e o que o codigo passa; o RBAC a expande
 * para a linha de `Permission` correspondente. Inverter essa responsabilidade
 * (guardar a tripla no banco) forcaria mudanca de migracao se a convencao de
 * `key` mudar.
 *
 * POR QUE `modulo` E SEPARADO DE `PlanModuleKey`
 *
 * Sao coisas diferentes e o schema as separa de proposito:
 * - `PlanModuleKey` (enum) e o que o PLANO contratado inclui — cobranca.
 * - `Permission.module` (VarChar) e o agrupamento da permissao dentro do app —
 *   autorizacao.
 *
 * Um tenant pode ter o modulo contratado e ainda assim ninguem ter a permissao
 * (e o inverso). O RBAC checa permissao; o gate de plano checa contrato. Sao
 * dois `if` independentes, e um nunca substitui o outro. A distincao entre a
 * permissao e o que o perfil recebe esta no ADR 0004.
 */

/** Acoes canonicas que uma `Permission` pode cobrir. */
export const ACOES = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "cancel",
  "export",
] as const;

export type Acao = (typeof ACOES)[number];

const CONJUNTO_ACOES: ReadonlySet<string> = new Set<string>(ACOES);

/** `true` se `valor` e uma acao canonica. */
export function ehAcao(valor: string): valor is Acao {
  return CONJUNTO_ACOES.has(valor);
}

/**
 * Tripla que identifica uma permissao. E o que o codigo pede ao RBAC.
 */
export interface PedidoPermissao {
  /** Modulo de negocio, em `SCREAMING_SNAKE` (ex.: "VENDAS", "ESTOQUE"). */
  readonly modulo: string;
  /** Recurso dentro do modulo, em `lower_snake` (ex.: "venda", "produto"). */
  readonly recurso: string;
  /** Acao canonica sobre o recurso. */
  readonly acao: Acao;
}

/**
 * Erro de programacao: tripla malformada num ponto de chamada.
 *
 * E `Error` e nao um erro de negocio de proposito. Um `modulo` vazio ou uma
 * `acao` fora do conjunto significa que ALGUEM escreveu errado no codigo, e o
 * certo e explodir no primeiro teste, com a mensagem apontando o valor — nao
 * devolver `false` e deixar a funcionalidade quebrada sumir em producao.
 */
export class ChavePermissaoInvalida extends Error {
  constructor(detalhe: string) {
    super(`Chave de permissao invalida: ${detalhe}`);
    this.name = "ChavePermissaoInvalida";
  }
}

/**
 * Normaliza e valida um pedido, devolvendo a chave canonica.
 *
 * Lanca `ChavePermissaoInvalida` se qualquer parte estiver vazia ou fora do
 * conjunto. Este e o portao de entrada: toda verificacao de permissao passa
 * por aqui, entao uma tripla invalida nunca chega a consulta de banco.
 */
export function chavePermissao(pedido: PedidoPermissao): string {
  const { modulo, recurso, acao } = pedido;

  if (typeof modulo !== "string" || modulo.trim() === "") {
    throw new ChavePermissaoInvalida("modulo vazio");
  }
  if (typeof recurso !== "string" || recurso.trim() === "") {
    throw new ChavePermissaoInvalida(`recurso vazio em "${modulo}"`);
  }
  if (typeof acao !== "string" || !ehAcao(acao)) {
    throw new ChavePermissaoInvalida(
      `acao "${String(acao)}" fora do conjunto [${ACOES.join(", ")}]`,
    );
  }

  return `${modulo}.${recurso}.${acao}`;
}

/**
 * Indica se uma `Permission` do banco cobre a acao pedida.
 *
 * A `Permission` tem `key` no formato `modulo.recurso` e `actions` com as
 * acoes que ela cobre. Esta funcao e a expansao da tripla para a linha: o
 * modulo e o recurso batem com `key` e a acao esta em `actions`.
 *
 * Fica aqui, e nao no `rbac.ts`, porque e logica pura e porque a tela de
 * configuracao de perfis precisa exatamente desta comparacao para marcar as
 * caixas — reimplementar la seria guarantee de divergencia.
 */
export function permissaoCobreAcao(
  permissao: { readonly key: string; readonly actions: readonly string[] },
  pedido: PedidoPermissao,
): boolean {
  const chaveEsperada = `${pedido.modulo}.${pedido.recurso}`;
  if (permissao.key !== chaveEsperada) return false;
  return permissao.actions.includes(pedido.acao);
}
