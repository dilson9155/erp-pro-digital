/**
 * Catalogo de permissoes: a lista do que EXISTE no produto.
 *
 * Este modulo e a fonte unica da verdade sobre as linhas de `Permission`. O
 * seed grava exatamente o que esta declarado aqui, e a tela de configuracao de
 * perfis desenha exatamente o que esta declarado aqui. Nenhum dos dois le a
 * lista do outro, e por isso nao ha como a UI oferecer uma permissao que o banco
 * nao tem, nem o banco ter uma permissao que a UI esconde.
 *
 * POR QUE O CATALOGO E CODIGO E NAO DADO DO BANCO
 *
 * O alternativa seria criar `Permission` a mao, linha por linha, e deixar o
 * banco ser a fonte. Funciona ate a primeira tabela nova: ai surge a duvida
 * "esta permissao ja existe?" e o padrao e criar uma segunda linha parecida, com
 * `key` quase igual (`VENDAS.venda` e `VENDAS.venda2`), e o RBAC segue
 * funcionando porque ninguem percebeu que a tela grava na errada.
 *
 * Declarando aqui, o seed vira `createMany` a partir da lista, e o banco e uma
 * consequencia. O preco e uma migracao quando um recurso novo entra — que e
 * justo: entrada de recurso novo e uma mudanca de produto, e merece estar no
 * historico do git.
 *
 * POR QUE `platform.*` NAO EH UM `PlanModuleKey`
 *
 * `PlanModuleKey` e o que o plano contratado vende. Gestao de usuario, perfil e
 * dados da empresa nao sao produto que se desliga: sem eles nao existe quem
 * operaria o tenant. Um `Permission.module` fora do enum reprova o gate de
 * plano (fail-closed, ver `planoDoTenant` em `src/server/auth/rbac.ts`), e o
 * efeito seria o oposto do desejado — o usuario perde TUDO, nao so o que nao
 * vendeu.
 *
 * Por isso as permissoes administrativas usam o prefixo `platform` e o RBAC as
 * exclui do cruzamento com o plano. E a unica categoria fora do gate, e a
 * exclusao e explicita em um `if` nomeado, nao uma excecao silenciosa.
 *
 * RELACAO COM `ACOES`
 *
 * `availableActions` aqui e a MISMA lista que vai para `Permission.availableActions`.
 * O campo existe para o servidor recusar uma concessao de acao que o recurso nao
 * implementa: conceder `venda.delete` e um erro de modelagem, e o lugar de
 * recusar isso e antes de gravar, nao no meio de uma regra de negocio.
 */

import type { Acao } from "./permissions";

/**
 * Modulos de plano citados pelo catalogo.
 *
 * A lista e declarada AQUI, e nao importada de `@/generated/prisma/enums`, por
 * uma razao que e regra do projeto e nao preferencia: `src/lib/**` e codigo que
 * pode acabar no bundle do navegador (a tela de perfis e um Client Component que
 * precisa dos rotulos), e o ESLint bloqueia qualquer import de `@/generated/prisma/*`
 * fora de `src/server/**` — o Prisma Client inteiro no navegador e nao um risco
 * teorico, e um vazamento de credencial de banco no JavaScript entregue.
 *
 * Entao a correspondencia com o enum fica no lugar onde ela pode ser verificada
 * sem quebrar a fronteira: `tests/unit/rbac-catalogo.test.ts` importa o enum
 * gerado e afirma que todo modulo desta lista existe em `PlanModuleKey`. Se o
 * enum mudar e um modulo for renomeado, o teste quebra — que e o mesmo efeito
 * de uma constraint, sem colocar o Prisma no bundle.
 */
export const MODULOS_DO_CATALOGO = [
  "ESTOQUE",
  "TRANSFERENCIAS",
  "INVENTARIO",
  "CLIENTES",
  "FORNECEDORES",
  "ORCAMENTOS",
  "PEDIDOS",
  "VENDAS",
  "PDV",
  "DEVOLUCOES",
  "COMISSOES",
  "COMPRAS",
  "PLANO_DE_CONTAS",
  "FINANCEIRO",
  "CONTAS_A_RECEBER",
  "CONTAS_A_PAGAR",
  "FLUXO_DE_CAIXA",
  "RELATORIOS",
  "DRE",
  "FISCAL",
  "NFE",
  "NFCE",
  "NFSE",
  "MULTI_FILIAL",
] as const;

/** Um modulo de plano citado pelo catalogo. Espelha `PlanModuleKey`. */
export type ModuloDeCatalogo = (typeof MODULOS_DO_CATALOGO)[number];

/** Modulo de permissao: um modulo vendido pelo plano, ou `platform`. */
export type ModuloPermissao = ModuloDeCatalogo | "platform";

/** Prefixo que marca permissao fora do gate de plano. Ver NOTA acima. */
export const PREFIXO_PLATFORM = "platform";

/** `true` quando o modulo nao passa pelo gate de plano. */
export function ehPlatform(modulo: ModuloPermissao): boolean {
  return modulo === PREFIXO_PLATFORM;
}

/** Uma linha do catalogo, pronta para virar `Permission` no banco. */
export interface DefinicaoPermissao {
  readonly modulo: ModuloPermissao;
  /** Recurso em `lower_snake`. Forma a chave com o modulo: `modulo.recurso`. */
  readonly recurso: string;
  /** Texto do checkbox na tela de perfis. */
  readonly label: string;
  /**
   * Agrupamento na tela de perfis. E o que impede a tela de virar uma lista de
   * 50 checkboxes soltos: permissoes de Estoque ficam juntas, as de Fiscal
   * ficam juntas, e o administrador enxerga a empresa em blocos.
   */
  readonly grupo: string;
  /** Acoes que o RECURSO suporta. Subconjunto de `ACOES`. */
  readonly acoes: readonly Acao[];
  /** Somente o super admin da plataforma concede. */
  readonly platformOnly?: boolean;
}

/** Atalho de leitura: todo recurso de cadastro usa o mesmo conjunto de acoes. */
const CRUD = ["create", "read", "update", "delete"] as const satisfies readonly Acao[];

/**
 * O catalogo.
 *
 * A ordem e a de leitura do administrador: cadastros, operacao diaria, financeiro,
 * fiscal, administracao. Nao e ordem alfabetica porque o agrupamento importa
 * mais que a letra, e nao e ordem de dependencia porque a tela de perfis nao e
 * um tutorial.
 */
export const CATALOGO: readonly DefinicaoPermissao[] = [
  // --- Cadastros -------------------------------------------------------
  {
    modulo: "ESTOQUE",
    recurso: "unidade",
    label: "Unidades de medida",
    grupo: "Cadastros",
    acoes: CRUD,
  },
  {
    modulo: "ESTOQUE",
    recurso: "categoria",
    label: "Categorias",
    grupo: "Cadastros",
    acoes: CRUD,
  },
  {
    modulo: "ESTOQUE",
    recurso: "marca",
    label: "Marcas",
    grupo: "Cadastros",
    acoes: CRUD,
  },
  {
    modulo: "ESTOQUE",
    recurso: "produto",
    label: "Produtos",
    grupo: "Cadastros",
    acoes: [...CRUD, "export"],
  },
  {
    modulo: "CLIENTES",
    recurso: "cliente",
    label: "Clientes",
    grupo: "Cadastros",
    acoes: [...CRUD, "export"],
  },
  {
    modulo: "FORNECEDORES",
    recurso: "fornecedor",
    label: "Fornecedores",
    grupo: "Cadastros",
    acoes: [...CRUD, "export"],
  },

  // --- Estoque ---------------------------------------------------------
  {
    modulo: "ESTOQUE",
    recurso: "movimentacao",
    label: "Movimentacoes de estoque",
    grupo: "Estoque",
    // Sem `update`: movimentacao e um fato occurred, nao um cadastro. O que se
    // corrige e um lancamento novo que estorna o anterior, e por isso existe
    // `cancel`. Permitir `update` faria o historico de estoque mentir.
    acoes: ["create", "read", "cancel", "export"],
  },
  {
    modulo: "TRANSFERENCIAS",
    recurso: "transferencia",
    label: "Transferencias entre filiais",
    grupo: "Estoque",
    acoes: ["create", "read", "approve", "cancel"],
  },
  {
    modulo: "INVENTARIO",
    recurso: "inventario",
    label: "Inventarios",
    grupo: "Estoque",
    acoes: ["create", "read", "update", "approve", "export"],
  },

  // --- Vendas ----------------------------------------------------------
  {
    modulo: "ORCAMENTOS",
    recurso: "orcamento",
    label: "Orcamentos",
    grupo: "Vendas",
    acoes: ["create", "read", "update", "approve", "cancel", "export"],
  },
  {
    modulo: "PEDIDOS",
    recurso: "pedido",
    label: "Pedidos de venda",
    grupo: "Vendas",
    acoes: ["create", "read", "update", "approve", "cancel"],
  },
  {
    modulo: "VENDAS",
    recurso: "venda",
    label: "Vendas",
    grupo: "Vendas",
    // `delete` nao existe de proposito: venda nao se apaga, se cancela. Sem a
    // distincao, um operador apaga a venda e o estoque continua baixado.
    acoes: ["create", "read", "update", "cancel", "export"],
  },
  {
    modulo: "PDV",
    recurso: "venda",
    label: "Vendas no PDV",
    grupo: "Vendas",
    acoes: ["create", "read", "cancel"],
  },
  {
    modulo: "DEVOLUCOES",
    recurso: "devolucao",
    label: "Devolucoes",
    grupo: "Vendas",
    acoes: ["create", "read", "approve", "cancel"],
  },
  {
    modulo: "COMISSOES",
    recurso: "comissao",
    label: "Comissoes",
    grupo: "Vendas",
    acoes: ["read", "update", "approve", "export"],
  },
  {
    modulo: "COMISSOES",
    recurso: "regra",
    label: "Regras de comissao",
    grupo: "Vendas",
    acoes: CRUD,
  },

  // --- Compras ---------------------------------------------------------
  {
    modulo: "COMPRAS",
    recurso: "compra",
    label: "Compras",
    grupo: "Compras",
    acoes: ["create", "read", "update", "approve", "cancel", "export"],
  },

  // --- Financeiro ------------------------------------------------------
  {
    modulo: "PLANO_DE_CONTAS",
    recurso: "conta",
    label: "Plano de contas",
    grupo: "Financeiro",
    acoes: CRUD,
  },
  {
    modulo: "FINANCEIRO",
    recurso: "banco",
    label: "Contas bancarias",
    grupo: "Financeiro",
    acoes: CRUD,
  },
  {
    modulo: "FINANCEIRO",
    recurso: "lancamento",
    label: "Lancamentos contabeis",
    grupo: "Financeiro",
    acoes: CRUD,
  },
  {
    modulo: "CONTAS_A_RECEBER",
    recurso: "titulo",
    label: "Contas a receber",
    grupo: "Financeiro",
    acoes: ["create", "read", "update", "cancel", "export"],
  },
  {
    modulo: "CONTAS_A_PAGAR",
    recurso: "titulo",
    label: "Contas a pagar",
    grupo: "Financeiro",
    acoes: ["create", "read", "update", "cancel", "export"],
  },
  {
    modulo: "FLUXO_DE_CAIXA",
    recurso: "movimento",
    label: "Fluxo de caixa",
    grupo: "Financeiro",
    acoes: ["create", "read", "update", "delete"],
  },
  {
    modulo: "RELATORIOS",
    recurso: "relatorio",
    label: "Relatorios",
    grupo: "Relatorios",
    acoes: ["read", "export"],
  },
  {
    modulo: "DRE",
    recurso: "relatorio",
    label: "DRE",
    grupo: "Relatorios",
    acoes: ["read", "export"],
  },

  // --- Fiscal ----------------------------------------------------------
  {
    modulo: "FISCAL",
    recurso: "configuracao",
    label: "Configuracao fiscal",
    grupo: "Fiscal",
    acoes: ["create", "read", "update"],
  },
  {
    modulo: "FISCAL",
    recurso: "serie",
    label: "Series de notas",
    grupo: "Fiscal",
    acoes: CRUD,
  },
  {
    modulo: "FISCAL",
    recurso: "certificado",
    label: "Certificados digitais",
    grupo: "Fiscal",
    // `platformOnly`: certificado digital e a chave de assinatura da empresa. Um
    // perfil de tenant receber isto por concessao automatica seria entregar a
    // chave da NF-e a qualquer usuario com o perfil certo.
    acoes: CRUD,
    platformOnly: true,
  },
  {
    modulo: "NFE",
    recurso: "documento",
    label: "NF-e",
    grupo: "Fiscal",
    acoes: ["create", "read", "cancel", "export"],
  },
  {
    modulo: "NFCE",
    recurso: "documento",
    label: "NFC-e",
    grupo: "Fiscal",
    acoes: ["create", "read", "cancel", "export"],
  },
  {
    modulo: "NFSE",
    recurso: "documento",
    label: "NFS-e",
    grupo: "Fiscal",
    acoes: ["create", "read", "cancel"],
  },

  // --- Empresa e administracao ----------------------------------------
  {
    modulo: "MULTI_FILIAL",
    recurso: "filial",
    label: "Filiais",
    grupo: "Empresa",
    acoes: CRUD,
  },
  // `SUPORTE.chamado` NAO esta no catalogo, apesar de `PlanModuleKey.SUPORTE`
  // existir no enum. Motivo: nao ha tela nem regra de negocio de chamado, e uma
  // permissao sem nada atras dela e exatamente o tipo de chave orfa que o
  // checklist nao pega — ela aparece na tela de perfis, o administrador marca, e
  // nada acontece. O enum guarda o espaco do produto; o catalogo guarda o que
  // existe.
  {
    modulo: "platform",
    recurso: "usuario",
    label: "Usuarios",
    grupo: "Administracao",
    acoes: CRUD,
  },
  {
    modulo: "platform",
    recurso: "perfil",
    label: "Perfis de acesso",
    grupo: "Administracao",
    acoes: CRUD,
  },
  {
    modulo: "platform",
    recurso: "empresa",
    label: "Dados da empresa",
    grupo: "Administracao",
    acoes: ["read", "update"],
  },
] as const;

/** Monta a chave canonica `modulo.recurso` de uma definicao. */
export function chaveDefinicao(definicao: DefinicaoPermissao): string {
  return `${definicao.modulo}.${definicao.recurso}`;
}

/** Todas as definicoes, indexadas por chave. Chave duplicada e bug de codigo. */
const POR_CHAVE: ReadonlyMap<string, DefinicaoPermissao> = new Map(
  CATALOGO.map((definicao) => [chaveDefinicao(definicao), definicao]),
);

/** `true` quando a chave existe no catalogo. */
export function chaveNoCatalogo(chave: string): boolean {
  return POR_CHAVE.has(chave);
}

/** Definicao de uma chave, ou `undefined` se nao existir. */
export function definicaoDaChave(chave: string): DefinicaoPermissao | undefined {
  return POR_CHAVE.get(chave);
}

/** Todas as acoes que o recurso da chave suporta. */
export function acoesDaChave(chave: string): readonly Acao[] {
  return POR_CHAVE.get(chave)?.acoes ?? [];
}

/**
 * Modulos de produto citados pelo catalogo, sem `platform`.
 *
 * E o que o seed usa para montar o `PlanModule` de um plano com tudo. Um modulo
 * que o catalogo nao cita nao entra: o plano offering algo que o produto nao
 * tem leva o cliente a uma tela que so existe para dizer "em breve".
 */
export function modulosDoCatalogo(): ModuloDeCatalogo[] {
  const vistos = new Set<ModuloDeCatalogo>();
  for (const definicao of CATALOGO) {
    if (definicao.modulo === PREFIXO_PLATFORM) continue;
    vistos.add(definicao.modulo);
  }
  return [...vistos].sort();
}

/** Grupos do catalogo, na ordem em que aparecem (ordem de leitura da tela). */
export function gruposDoCatalogo(): string[] {
  const vistos = new Set<string>();
  for (const definicao of CATALOGO) vistos.add(definicao.grupo);
  return [...vistos];
}

/** Definicoes de um grupo, para a tela de perfis. */
export function definicoesDoGrupo(grupo: string): readonly DefinicaoPermissao[] {
  return CATALOGO.filter((definicao) => definicao.grupo === grupo);
}
