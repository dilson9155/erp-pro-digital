import Decimal from "decimal.js";
import { z } from "zod";

import { SaleChannel, SaleType } from "@/generated/prisma/enums";
import { zDinheiro, zQuantidade } from "@/lib/zod-dinheiro";
import { zDataOpcional } from "@/lib/zod-data";
import { TEXTO_LONGO, textoOpcional } from "@/lib/zod-texto";

/**
 * Schema do formulario de venda.
 *
 * ## POR QUE OS ITENS VAO COMO UM JSON E NAO COMO CAMPOS REPETIDOS
 *
 * Um `<input name="quantidade">` por linha de item e a forma obvia, e ela nao
 * funciona com `validarFormulario`: aquele helper monta o objeto com
 * `Object.fromEntries(dados.entries())`, e o `Object.fromEntries` guarda SO O
 * ULTIMO valor de cada chave repetida. Cinco linhas de item virariam um item,
 * com a quantidade da quinta e o preco da quinta — uma venda de cinco coisas
 * viraria uma venda de uma, e o erro apareceria como "o total esta errado" sem
 * nenhuma pista de onde.
 *
 * Entao o formulario manda as linhas em UM campo so, como JSON, e este schema
 * valida a lista inteira. O lado bom e que a linha continua sendo uma linha: o
 * erro da terceira linha diz "Item 3", e nao o nome de um campo de formulario
 * que nao existe.
 *
 * A alternativa seria `dados.getAll("itemQuantidade")` e um schema por linha,
 * o que joga a traducao de `FormData` para dentro de cada action e repete o
 * mesmo trabalho em toda acao que precisar de lista.
 */

/** Uma linha de item ja convertida. */
export interface ItemDigitado {
  readonly productId: string | null;
  readonly serviceId: string | null;
  readonly descricao: string;
  readonly quantidade: Decimal;
  readonly precoUnitario: Decimal;
  readonly desconto: Decimal;
}

export interface DadosVenda {
  readonly clienteId: string | null;
  readonly vendedorId: string | null;
  readonly paymentTermsId: string | null;
  readonly paymentMethodId: string | null;
  readonly tipo: SaleType;
  readonly canal: SaleChannel;
  readonly data: Date | null;
  readonly desconto: Decimal;
  readonly frete: Decimal;
  readonly observacoes: string | null;
  readonly observacoesInternas: string | null;
  readonly itens: readonly ItemDigitado[];
}

/** Desconto que aceita vazio: aqui zero e "sem desconto", e nao "nao informado". */
const dinheiroOuZero = z
  .union([zDinheiro, z.literal("")])
  .optional()
  .transform((valor) => (valor === undefined || valor === "" ? new Decimal(0) : valor));

/**
 * Identificador dentro do JSON do item, aceitando `null`.
 *
 * `textoOpcional` resolve o caso do `FormData`, onde "vazio" chega como `""` ou
 * como chave ausente. Aqui o item vem de um `<input type="hidden">` com JSON
 * montado por um Client Component, e a forma natural de dizer "esta linha nao
 * tem produto" e `null`, nao `""`. Reusar `textoOpcional` faria a linha com
 * `serviceId: null` reprovar em "expected string, received null" — um erro de
 * tipo no meio de uma lista de dados que estava correta.
 *
 * Por isso o `null` e aceito explicitamente nas duas formas e normalizado para
 * `null`, e o `textoOpcional` continua certo para o resto do formulario.
 */
const idOpcional = (maximo: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((valor) => {
      if (typeof valor !== "string") return null;
      const limpo = valor.trim();
      return limpo === "" ? null : limpo;
    })
    .refine((valor) => valor === null || valor.length <= maximo, {
      error: `Use no maximo ${maximo} caracteres`,
    });

/** Descricao livre: `null` vira string vazia, que a regra do item sabe tratar. */
const descricaoItem = z
  .union([z.string(), z.null()])
  .optional()
  .transform((valor) => (typeof valor === "string" ? valor.trim() : ""))
  .refine((valor) => valor.length <= 255, { error: "Use no maximo 255 caracteres" });

/**
 * A linha de item, com os numeros ainda em TEXTO.
 *
 * Os campos sao `string` de entrada porque a conversao de "1.234,56" para
 * `Decimal` e o que `zDinheiro`/`zQuantidade` fazem. Se o campo ja fosse
 * `Decimal` no schema, o `FormData` — que so tem string — nunca casaria.
 */
const itemBruto = z.object({
  productId: idOpcional(40),
  serviceId: idOpcional(40),
  // A descricao e livre porque o produto ja traz o nome: vazia num item de
  // produto significa "use o nome do produto". Em item de SERVICO e obrigatoria,
  // porque nao existe nome para buscar no cadastro.
  descricao: descricaoItem,
  quantidade: zQuantidade.refine((valor) => valor.gt(0), {
    error: "Informe uma quantidade maior que zero",
  }),
  precoUnitario: zDinheiro.refine((valor) => valor.gte(0), { error: "Informe um preco valido" }),
  desconto: dinheiroOuZero,
});

const listaDeItens = z.array(itemBruto).min(1, "Informe ao menos um item");

/** O campo ao qual o erro e ancorado. Ver NOTA DOS CAMINHOS no fim do arquivo. */
const EM_ITENS = "itens";

export const schemaVenda = z
  .object({
    clienteId: textoOpcional(40, "Use no maximo 40 caracteres"),
    vendedorId: textoOpcional(40, "Use no maximo 40 caracteres"),
    paymentTermsId: textoOpcional(40, "Use no maximo 40 caracteres"),
    paymentMethodId: textoOpcional(40, "Use no maximo 40 caracteres"),
    tipo: z.enum(SaleType).default(SaleType.NORMAL),
    canal: z.enum(SaleChannel).default(SaleChannel.BALCAO),
    data: zDataOpcional,
    desconto: dinheiroOuZero,
    frete: dinheiroOuZero,
    observacoes: TEXTO_LONGO,
    observacoesInternas: TEXTO_LONGO,
    itens: z.string({ error: "Informe ao menos um item" }),
  })
  .transform((bruto, ctx) => {
    // Itens primeiro: `JSON.parse` invalido e o erro mais comum aqui, e ele
    // precisa virar recusa com mensagem e nao excecao de sintaxe crua — que
    // chegaria ao usuario como "Nao foi possivel concluir a operacao".
    let crus: unknown;
    try {
      crus = JSON.parse(bruto.itens);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: [EM_ITENS],
        message: "Itens invalidos. Recarregue a tela e tente de novo.",
      });
      return z.NEVER;
    }

    const lista = listaDeItens.safeParse(crus);
    if (!lista.success) {
      for (const issue of lista.error.issues) {
        const posicao = typeof issue.path[0] === "number" ? issue.path[0] + 1 : 0;
        const campo = typeof issue.path[1] === "string" ? issue.path[1] : null;
        ctx.addIssue({
          code: "custom",
          path: [EM_ITENS],
          // Numero da linha E nome do campo. "Informe uma quantidade" num
          // formulario de cinco linhas nao diz o que corrigir, e o texto cru do
          // Zod ("Invalid input: expected string, received null") nao diz nada
          // que uma pessoa de loja.consiga usar.
          message:
            posicao > 0 && campo !== null
              ? `Item ${posicao} (${campo}): ${issue.message}`
              : posicao > 0
                ? `Item ${posicao}: ${issue.message}`
                : issue.message,
        });
      }
      return z.NEVER;
    }

    const itens = lista.data;

    for (const [indice, item] of itens.entries()) {
      const linha = indice + 1;
      const semProdutoESemServico = item.productId === null && item.serviceId === null;
      const comProdutoEServico = item.productId !== null && item.serviceId !== null;

      if (semProdutoESemServico) {
        ctx.addIssue({
          code: "custom",
          path: [EM_ITENS],
          message: `Item ${linha}: escolha um produto ou um servico`,
        });
      }
      if (comProdutoEServico) {
        ctx.addIssue({
          code: "custom",
          path: [EM_ITENS],
          message: `Item ${linha}: escolha um produto OU um servico, nao os dois`,
        });
      }
      if (semProdutoESemServico && item.descricao === "") {
        ctx.addIssue({
          code: "custom",
          path: [EM_ITENS],
          message: `Item ${linha}: informe a descricao`,
        });
      }
      if (item.desconto.gt(item.quantidade.times(item.precoUnitario))) {
        // `calculo.ts` ja limita o desconto ao item para o total nunca virar
        // negativo. Aqui a recusa e explicita, porque desconto maior que o item
        // quase sempre e ponto digitado a mais, e silenciar isso deixaria a
        // pessoa acreditando num desconto que nao foi aplicado.
        ctx.addIssue({
          code: "custom",
          path: [EM_ITENS],
          message: `Item ${linha}: o desconto e maior que o valor do item`,
        });
      }
    }

    if (bruto.frete.lt(0) || bruto.desconto.lt(0)) {
      ctx.addIssue({
        code: "custom",
        path: ["frete"],
        message: "Frete e desconto nao podem ser negativos",
      });
      return z.NEVER;
    }

    return {
      clienteId: bruto.clienteId,
      vendedorId: bruto.vendedorId,
      paymentTermsId: bruto.paymentTermsId,
      paymentMethodId: bruto.paymentMethodId,
      tipo: bruto.tipo,
      canal: bruto.canal,
      data: bruto.data,
      desconto: bruto.desconto,
      frete: bruto.frete,
      observacoes: bruto.observacoes,
      observacoesInternas: bruto.observacoesInternas,
      itens,
    } satisfies DadosVenda;
  });

/**
 * NOTA DOS CAMINHOS
 *
 * Todo `addIssue` deste arquivo tem `path`. Nao e arbitrario: `validarFormulario`
 * so conhece o primeiro elemento do `issue.path` e DESCARTA a issue se ele nao
 * for string — um erro sem caminho nunca chega na tela. E o caso do `.min(1)` de
 * `listaDeItens` acima: sem o `path`, "Informe ao menos um item" sumiria e a
 * pessoa veria apenas "Dados invalidos", sem nenhuma pista do que faltava.
 *
 * Todos os erros de item ancoram em `itens`, o que e o campo que existe no
 * formulario. O numero da linha viaja na mensagem, porque o `Formulario` mostra
 * uma lista de mensagens por campo, e nao marca o input da terceira linha.
 */
