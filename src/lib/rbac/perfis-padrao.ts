/**
 * Perfis de acesso padrao, e as acoes que cada um concede.
 *
 * FICAM EM ARQUIVO SEPARADO DO SEED, E NAO DENTRO DELE, POR UM MOTIVO
 * OPERACIONAL
 *
 * A tela de configuracao de perfis precisa mostrar os perfis padrao com as
 * caixas ja marcadas, para o administrador entender o que um "Vendedor" pode
 * fazer antes de criar o seu. Se a lista vivesse dentro do `seed.ts`, a tela
 * teria que importar o seed — e o seed abre conexao com o banco no import.
 * Uma lista de cargos que so pode ser lida em ambiente de script e nao uma
 * lista de cargos: e configuracao de produto, entao mora em `src/`.
 *
 * POR QUE OS PERFIS SAO GLOBAIS (`tenantId: null`)
 *
 * Um perfil descreve um CARGO, nao uma empresa. "Vendedor" significa a mesma
 * coisa em qualquer tenant, e duplicar a definicao por cliente faria o suporte
 * perder a capacidade de responder "o vendedor pode cancelar venda?" sem antes
 * perguntar de qual empresa estamos falando. `resolverRbac` aceita explicitamente
 * o perfil global (ver o filtro `donoValido`), entao ele concede acesso igual.
 *
 * A consequencia e que estes perfis nao podem ser apagados nem renomeados sem
 * quebrar a comparacao entre empresas — por isso `isSystem: true` no seed.
 *
 * COMO A GRANULARIDADE E ESCOLHIDA AQUI
 *
 * Cada concessao e `(modulo, recurso, acoes[])`. As acoes vem do que o cargo faz
 * no dia a dia, e nao do que o recurso suporta. O vendedor precisa `cancel` de
 * venda (cliente desistiu antes do faturamento) mas nao `update` (preco e
 * desconto nao sao dele) nem `delete` (venda nao se apaga, se cancela). Se este
 * arquivo concedesse tudo, o `RolePermission.actions` seria decoracao — que e
 * exatamente o que o ADR 0004 existe para impedir.
 *
 * O seed valida cada concessao contra o catalogo e falha se um recurso ou uma
 * acao nao existir, entao um erro de digitacao aqui aparece no seed e nao em
 * producao.
 */

import type { Acao } from "./permissions";
import type { ModuloPermissao } from "./catalogo";

/** Uma concessao: as acoes que o perfil recebe sobre o recurso. */
export interface ConcessaoPerfil {
  readonly modulo: ModuloPermissao;
  readonly recurso: string;
  readonly acoes: readonly Acao[];
}

/** Um perfil padrao do produto. */
export interface PerfilPadrao {
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly concessoes: readonly ConcessaoPerfil[];
}

/** Atalho: lista de `modulo.recurso` com as acoes passadas. */
function todas(modulo: ModuloPermissao, recurso: string, acoes: readonly Acao[]): ConcessaoPerfil {
  return { modulo, recurso, acoes };
}

const ADMINISTRADOR: PerfilPadrao = {
  slug: "administrador",
  nome: "Administrador",
  descricao: "Acesso total a operacao da empresa, exceto chave de assinatura fiscal.",
  concessoes: [
    // Cadastros: o administrador monta a base que os outros cargos usam.
    todas("ESTOQUE", "unidade", ["create", "read", "update", "delete"]),
    todas("ESTOQUE", "categoria", ["create", "read", "update", "delete"]),
    todas("ESTOQUE", "marca", ["create", "read", "update", "delete"]),
    todas("ESTOQUE", "produto", ["create", "read", "update", "delete", "export"]),
    todas("CLIENTES", "cliente", ["create", "read", "update", "delete", "export"]),
    todas("FORNECEDORES", "fornecedor", ["create", "read", "update", "delete"]),
    todas("MULTI_FILIAL", "filial", ["create", "read", "update", "delete"]),

    // Estoque.
    todas("ESTOQUE", "movimentacao", ["create", "read", "cancel", "export"]),
    todas("TRANSFERENCIAS", "transferencia", ["create", "read", "approve", "cancel"]),
    todas("INVENTARIO", "inventario", ["create", "read", "update", "approve", "export"]),

    // Vendas.
    todas("ORCAMENTOS", "orcamento", [
      "create",
      "read",
      "update",
      "approve",
      "cancel",
      "export",
    ]),
    todas("PEDIDOS", "pedido", ["create", "read", "update", "approve", "cancel"]),
    todas("VENDAS", "venda", ["create", "read", "update", "cancel", "export"]),
    todas("PDV", "venda", ["create", "read", "cancel"]),
    todas("DEVOLUCOES", "devolucao", ["create", "read", "approve", "cancel"]),
    todas("COMISSOES", "comissao", ["read", "update", "approve", "export"]),
    todas("COMISSOES", "regra", ["create", "read", "update", "delete"]),

    // Compras.
    todas("COMPRAS", "compra", ["create", "read", "update", "approve", "cancel", "export"]),

    // Financeiro.
    todas("PLANO_DE_CONTAS", "conta", ["create", "read", "update", "delete"]),
    todas("FINANCEIRO", "banco", ["create", "read", "update", "delete"]),
    todas("FINANCEIRO", "lancamento", ["create", "read", "update", "delete"]),
    todas("CONTAS_A_RECEBER", "titulo", ["create", "read", "update", "cancel", "export"]),
    todas("CONTAS_A_PAGAR", "titulo", ["create", "read", "update", "cancel", "export"]),
    todas("FLUXO_DE_CAIXA", "movimento", ["create", "read", "update", "delete"]),
    todas("RELATORIOS", "relatorio", ["read", "export"]),
    todas("DRE", "relatorio", ["read", "export"]),

    // Fiscal. `certificado` NAO entra: e `platformOnly`, e fica com o super
    // admin da plataforma. Ver o comentario do recurso no catalogo.
    todas("FISCAL", "configuracao", ["create", "read", "update"]),
    todas("FISCAL", "serie", ["create", "read", "update", "delete"]),
    todas("NFE", "documento", ["create", "read", "cancel", "export"]),
    todas("NFCE", "documento", ["create", "read", "cancel", "export"]),
    todas("NFSE", "documento", ["create", "read", "cancel"]),

    // Empresa e administracao. `platform.*` nao passa pelo gate de plano, entao
    // um tenant com plano basico ainda consegue administrar os proprios usuarios.
    todas("platform", "usuario", ["create", "read", "update", "delete"]),
    todas("platform", "perfil", ["create", "read", "update", "delete"]),
    todas("platform", "empresa", ["read", "update"]),
  ],
};

const VENDEDOR: PerfilPadrao = {
  slug: "vendedor",
  nome: "Vendedor",
  descricao: "Orcamenta, fecha venda e da baixa no proprio comissionamento.",
  concessoes: [
    // Le os cadastros, mas nao os altera: o cadastro e do administrador.
    todas("ESTOQUE", "produto", ["read"]),
    todas("ESTOQUE", "categoria", ["read"]),
    todas("ESTOQUE", "marca", ["read"]),
    todas("CLIENTES", "cliente", ["create", "read", "update"]),

    todas("ORCAMENTOS", "orcamento", ["create", "read", "update", "cancel"]),
    todas("PEDIDOS", "pedido", ["create", "read", "update"]),
    // `update` fora de proposito: preço e desconto nao sao do vendedor. Sem
    // `delete`: venda cancelada continua no historico.
    todas("VENDAS", "venda", ["create", "read", "cancel"]),
    todas("PDV", "venda", ["create", "read", "cancel"]),
    todas("DEVOLUCOES", "devolucao", ["create", "read"]),
    // Le a propria comissao e nao a regra: quem define a regra nao é quem cobra.
    todas("COMISSOES", "comissao", ["read"]),
  ],
};

const ESTOQUISTA: PerfilPadrao = {
  slug: "estoquista",
  nome: "Estoquista",
  descricao: "Mantem produto, saldo e movimentacao; fecha inventario.",
  concessoes: [
    todas("ESTOQUE", "produto", ["create", "read", "update", "export"]),
    todas("ESTOQUE", "unidade", ["read", "create"]),
    todas("ESTOQUE", "categoria", ["read", "create"]),
    todas("ESTOQUE", "marca", ["read", "create"]),
    todas("ESTOQUE", "movimentacao", ["create", "read", "cancel", "export"]),
    todas("TRANSFERENCIAS", "transferencia", ["create", "read", "approve"]),
    todas("INVENTARIO", "inventario", ["create", "read", "update", "approve", "export"]),
    // Le o cadastro para dar baixa na venda: precisa saber o que vendeu, mas
    // nao edita o cliente.
    todas("CLIENTES", "cliente", ["read"]),
  ],
};

const FINANCEIRO: PerfilPadrao = {
  slug: "financeiro",
  nome: "Financeiro",
  descricao: "Contas a receber e pagar, fluxo de caixa e lancamentos.",
  concessoes: [
    todas("CLIENTES", "cliente", ["read", "update", "export"]),
    todas("FORNECEDORES", "fornecedor", ["create", "read", "update", "delete", "export"]),
    todas("PLANO_DE_CONTAS", "conta", ["create", "read", "update", "delete"]),
    todas("FINANCEIRO", "banco", ["create", "read", "update", "delete"]),
    todas("FINANCEIRO", "lancamento", ["create", "read", "update", "delete"]),
    todas("CONTAS_A_RECEBER", "titulo", ["create", "read", "update", "cancel", "export"]),
    todas("CONTAS_A_PAGAR", "titulo", ["create", "read", "update", "cancel", "export"]),
    todas("FLUXO_DE_CAIXA", "movimento", ["create", "read", "update", "delete"]),
    todas("COMPRAS", "compra", ["create", "read", "update", "approve", "cancel", "export"]),
    todas("RELATORIOS", "relatorio", ["read", "export"]),
    todas("DRE", "relatorio", ["read", "export"]),
    // Le a venda para conferir o titulo que ela gerou.
    todas("VENDAS", "venda", ["read"]),
    todas("ORCAMENTOS", "orcamento", ["read"]),
  ],
};

const FISCAL: PerfilPadrao = {
  slug: "fiscal",
  nome: "Fiscal",
  descricao: "Parametros fiscais, series e emissao de documentos.",
  concessoes: [
    todas("FISCAL", "configuracao", ["create", "read", "update"]),
    todas("FISCAL", "serie", ["create", "read", "update", "delete"]),
    todas("NFE", "documento", ["create", "read", "cancel", "export"]),
    todas("NFCE", "documento", ["create", "read", "cancel", "export"]),
    todas("NFSE", "documento", ["create", "read", "cancel"]),
    // Le cadastros para conferir tributacao do item.
    todas("ESTOQUE", "produto", ["read"]),
    todas("CLIENTES", "cliente", ["read"]),
    todas("VENDAS", "venda", ["read"]),
    todas("COMPRAS", "compra", ["read"]),
  ],
};

/**
 * Os perfis, na ordem em que a tela de perfis deve exibi-los.
 *
 * A ordem e de carga para o mais restrito, e nao alfabetica: quem abre a tela
 * precisa achar primeiro o perfil que mais difere do padrao da empresa, e o
 * "Administrador" no topo ja responde a pergunta mais comum.
 */
export function definirPerfisPadrao(): readonly PerfilPadrao[] {
  return [ADMINISTRADOR, FINANCEIRO, FISCAL, ESTOQUISTA, VENDEDOR];
}
