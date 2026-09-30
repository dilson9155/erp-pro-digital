import { describe, expect, it } from "vitest";

import { SaleChannel, SaleType } from "@/generated/prisma/enums";
import { validarFormulario } from "@/server/app/validacao";
import { schemaVenda } from "@/server/app/vendas/schema";

/**
 * Schema do formulario de venda.
 *
 * O teste que mais importa aqui e o do `FormData` completo, passando por
 * `validarFormulario`: e nele que um erro com `path` errado vira uma tela que
 * mostra "Dados invalidos" sem dizer o que falta.
 */

const item = (extras: Record<string, unknown> = {}) => ({
  productId: "prod_1",
  serviceId: null,
  descricao: "",
  quantidade: "2",
  precoUnitario: "50",
  desconto: "",
  ...extras,
});

function formCom(itens: unknown, extras: Record<string, string> = {}): FormData {
  const dados = new FormData();
  dados.set("itens", typeof itens === "string" ? itens : JSON.stringify(itens));
  for (const [campo, valor] of Object.entries(extras)) dados.set(campo, valor);
  return dados;
}

/**
 * O estado de erro, ou `null` quando a venda passou.
 *
 * `EstadoFormulario` e uma uniao de "ok" e "erro", e o `!validacao.ok` so
 * estreita o `ok` do `ResultadoValidacao` — o `estado` continua sendo a uniao
 * toda. Sem esta checagem, `estado.campos` nao compila, e o caminho de teste
 * que mais importa (a mensagem que a pessoa ve) e o primeiro a se perder.
 */
function erro(dados: FormData) {
  const validacao = validarFormulario(schemaVenda, dados);
  if (validacao.ok) return null;
  return validacao.estado.tipo === "erro" ? validacao.estado : null;
}

/** As mensagens ancoradas em `itens`, que e o campo que existe no formulario. */
function errosDeItens(dados: FormData): string[] {
  return [...(erro(dados)?.campos?.itens ?? [])];
}

/** A unica linha da venda valida, com o tamanho conferido. */
function unicaLinha(dados: FormData) {
  const validacao = validarFormulario(schemaVenda, dados);
  if (!validacao.ok) return null;
  expect(validacao.dados.itens).toHaveLength(1);
  return validacao.dados.itens[0];
}

describe("vendas/schema: montagem", () => {
  it("aceita uma venda valida de um item", () => {
    const linha = unicaLinha(formCom([item()]));

    // Um item so, e ele veio com 2 unidades de 50.
    expect(linha).not.toBeNull();
    expect(linha?.quantidade.toNumber()).toBe(2);
    expect(linha?.precoUnitario.toNumber()).toBe(50);
  });

  it("defaulta tipo e canal quando o formulario nao manda", () => {
    const validacao = validarFormulario(schemaVenda, formCom([item()]));

    expect(validacao.ok).toBe(true);
    if (!validacao.ok) return;
    expect(validacao.dados.tipo).toBe(SaleType.NORMAL);
    expect(validacao.dados.canal).toBe(SaleChannel.BALCAO);
  });

  it("trata desconto e frete vazios como zero, e nao como ausente", () => {
    // Zero e "sem desconto". Ausente faria o `Decimal` ficar `undefined` e a
    // aritmetica quebraria no primeiro `.plus()`.
    const validacao = validarFormulario(schemaVenda, formCom([item()], { desconto: "", frete: "" }));

    expect(validacao.ok).toBe(true);
    if (!validacao.ok) return;
    expect(validacao.dados.desconto.toNumber()).toBe(0);
    expect(validacao.dados.frete.toNumber()).toBe(0);
  });

  it("aceita valor brasileiro com ponto de milhar", () => {
    const linha = unicaLinha(formCom([item({ quantidade: "1", precoUnitario: "1.234,56" })]));

    // "1.234" sozinho seria 1,234, nao 1234: ver PADRAO_NUMERO em zod-dinheiro.
    expect(linha?.precoUnitario.toNumber()).toBe(1234.56);
  });

  it("vira null o cliente nao informado", () => {
    // `customerId` e `String?` no schema. Venda de balcao sem cliente
    // cadastro e o caso mais comum do sistema, e nao um erro.
    const validacao = validarFormulario(schemaVenda, formCom([item()], { clienteId: "" }));

    expect(validacao.ok).toBe(true);
    if (!validacao.ok) return;
    expect(validacao.dados.clienteId).toBeNull();
  });

  it("aceita item com id nulo, que e como o cliente manda 'sem produto'", () => {
    // `textoOpcional` so entende `""` e chave ausente, que e a forma do
    // `FormData`. O item vem de um JSON montado por Client Component, e ai o
    // `null` e a forma natural — precisa passar.
    const linha = unicaLinha(formCom([item({ productId: "prod_1", serviceId: null })]));
    expect(linha?.serviceId).toBeNull();
  });
});

describe("vendas/schema: itens", () => {
  it("recusa venda sem item, com mensagem que chega na tela", () => {
    const erros = errosDeItens(formCom([]));

    // Sem `path`, `validarFormulario` descarta a issue e a pessoa ve so
    // "Dados invalidos".
    expect(erros.join(" ")).toContain("ao menos um item");
  });

  it("recusa quantidade zero", () => {
    const erros = errosDeItens(formCom([item({ quantidade: "0" })]));
    expect(erros.join(" ")).toContain("quantidade maior que zero");
  });

  it("numera a linha na mensagem de erro", () => {
    // "Informe uma quantidade" sem o numero da linha nao diz o que corrigir
    // num formulario com cinco itens.
    const erros = errosDeItens(formCom([item(), item(), item({ quantidade: "" })]));
    expect(erros.join(" ")).toContain("Item 3");
  });

  it("recusa item sem produto e sem servico", () => {
    const erros = errosDeItens(formCom([item({ productId: null, serviceId: null })]));
    expect(erros.join(" ")).toContain("escolha um produto ou um servico");
  });

  it("recusa item com produto E servico", () => {
    const erros = errosDeItens(formCom([item({ productId: "prod_1", serviceId: "serv_1" })]));
    expect(erros.join(" ")).toContain("nao os dois");
  });

  it("exige descricao quando nao ha produto nem servico", () => {
    // Sem cadastro para buscar o nome, a descricao e a unica descricao que
    // existe, e ela vai para o documento impresso.
    const erros = errosDeItens(formCom([item({ productId: null, serviceId: null, descricao: "" })]));
    expect(erros.join(" ")).toContain("informe a descricao");
  });

  it("aceita item de servico so com descricao", () => {
    const validacao = validarFormulario(
      schemaVenda,
      formCom([item({ productId: null, serviceId: "serv_1", descricao: "Mao de obra" })]),
    );
    expect(validacao.ok).toBe(true);
  });

  it("recusa desconto maior que o item", () => {
    // 2 x 50 = 100, desconto 150. `calculo.ts` ja limita o total em zero, mas
    // aqui a recusa e explicita: quem digita isso quase sempre erro o ponto, e
    // silenciar deixaria a pessoa acreditando num desconto que nao houve.
    const erros = errosDeItens(formCom([item({ desconto: "150" })]));
    expect(erros.join(" ")).toContain("desconto e maior que o valor do item");
  });

  it("aceita desconto igual ao valor do item", () => {
    const validacao = validarFormulario(schemaVenda, formCom([item({ desconto: "100" })]));
    expect(validacao.ok).toBe(true);
  });

  it("recusa JSON invalido sem estourar excecao", () => {
    // `JSON.parse` lancando aqui chegaria ao usuario como "Nao foi possivel
    // concluir a operacao", que nao ajuda ninguem a corrigir.
    const erros = errosDeItens(formCom("isto nao e json"));
    expect(erros.join(" ")).toContain("Itens invalidos");
  });

  it("preserva as linhas que o usuario digitou quando um item falha", () => {
    // O `FormData` volta inteiro em `valores`, e e ele que impede o formulario
    // de apagar a venda inteira por causa de um unico item.
    const estado = erro(formCom([item(), item({ quantidade: "0" })]));

    expect(estado?.valores?.itens).toBeDefined();
  });
});

describe("vendas/schema: cabecalho", () => {
  it("recusa frete negativo", () => {
    const validacao = validarFormulario(schemaVenda, formCom([item()], { frete: "-10" }));
    expect(validacao.ok).toBe(false);
  });

  it("recusa tipo de venda desconhecido", () => {
    const validacao = validarFormulario(schemaVenda, formCom([item()], { tipo: "INVENTADO" }));
    expect(validacao.ok).toBe(false);
  });

  it("recusa data de venda que nao existe", () => {
    const validacao = validarFormulario(schemaVenda, formCom([item()], { data: "2026-02-31" }));
    expect(validacao.ok).toBe(false);
  });

  it("aceita data vazia, que a action preenche com hoje", () => {
    const validacao = validarFormulario(schemaVenda, formCom([item()], { data: "" }));
    expect(validacao.ok).toBe(true);
    if (!validacao.ok) return;
    expect(validacao.dados.data).toBeNull();
  });
});
