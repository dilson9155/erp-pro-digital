import { z } from "zod";
import Decimal, { type Decimal as DecimalValue } from "decimal.js";

import { parseBrazilianNumber } from "@/lib/money";

/**
 * Campos de `Decimal` em formulario.
 *
 * POR QUE ISTO PRECISA EXISTIR, E NAO UM `z.coerce.number()` NO SCHEMA
 *
 * O `<input type="text">` manda o que a pessoa digitou: "1.234,56". O
 * `z.coerce.number()` chamaria `Number("1.234,56")`, que devolve `NaN` — e o
 * `NaN` escaparia da checagem de faixa e acabaria gravado no Postgres, que
 * receberia a string do `Decimal.toString()`. O preco do produto viraria `NaN`, e
 * a venda sairia por um valor que ninguem digitou.
 *
 * A conversao correta e `parseBrazilianNumber`, o MESMO que `lib/form.ts` usa
 * nas Server Actions. Este arquivo e a versao "de schema" dela, e a duplicacao
 * e deliberada: `lib/form.ts` le campo a campo, e o schema precisa validar o
 * `FormData` inteiro de uma vez. As duas precisam concordar sobre o que
 * "1.234,56" significa, e por isso as duas chamam a mesma funcao.
 *
 * POR QUE `Decimal` E NAO `number`
 *
 * `0.1 + 0.2 !== 0.3` em `number`. Numa soma de 300 itens de venda, o erro
 * acumulado aparece no centavo, e o documento fiscal deixa de bater com o
 * extrato. O schema Postgres e `Decimal(14,4)`: quem casa com ele e `Decimal`.
 */

const NAO_NULO = { error: "Informe um valor" } as const;

/**
 * Formato aceito: digitos, virgula decimal, ponto SO como separador de milhar.
 *
 * Tres casos decidiram este padrao, e todos vieram de testes que falharam antes:
 *
 * - `"50"` precisa passar. A primeira versao exigia virgula, e "50" era
 *   recusado — quem cadastra um produto de R$ 50 era barrado por causa da
 *   virgula. Por isso o ultimo grupo e opcional.
 * - `"1.234"` precisa FALHAR. Com ponto aceito como decimal, "1.234" passa a
 *   valer 1,234 — e ponto de milhar e o que a pessoa digita para mil duzentos e
 *   trinta e quatro. O preco viraria 1,23 em vez de 1234,00. Por isso o ponto
 *   so vale quando a virgula tambem aparece: `"1.234,56"` entra, `"1.234"` nao.
 * - `"1.234.567,89"` entra, com quantos grupos de milhar forem necessarios.
 */
const PADRAO_NUMERO = /^-?\d+(?:,\d{1,4})?$|^-?\d{1,3}(?:\.\d{3})+,\d{1,4}$/;

/** Valor em dinheiro: `type="text"`, com ponto de milhar e virgula decimal. */
export const zDinheiro = z
  .string(NAO_NULO)
  .trim()
  .min(1, "Informe um valor")
  .refine((valor) => PADRAO_NUMERO.test(valor), { error: "Use o formato 1.234,56" })
  .transform((valor) => parseBrazilianNumber(valor));

/** Quantidade: mesma conversao, com ate 4 casas (padrao de `money.ts`). */
export const zQuantidade = z
  .string(NAO_NULO)
  .trim()
  .min(1, "Informe um valor")
  .refine((valor) => PADRAO_NUMERO.test(valor), { error: "Use o formato 1.234,56" })
  .transform((valor) => parseBrazilianNumber(valor));

/** Percentual: aceita "35" e "35,5", e vira `Decimal` no mesmo numero. */
export const zPercentual = z
  .string(NAO_NULO)
  .trim()
  .min(1, "Informe um valor")
  .refine((valor) => /^-?\d+(,\d{1,4})?$/.test(valor), { error: "Use o formato 35 ou 35,5" })
  .transform((valor) => parseBrazilianNumber(valor))
  .refine((valor) => valor.gte(0) && valor.lte(100), {
    error: "Informe um valor entre 0 e 100",
  });

/**
 * Variante OPCIONAL de um campo numerico.
 *
 * Vazio e `null`, e nao `0`. A diferenca importa: `nationalTaxPercent = null`
 * significa "nao informado, o fiscal decide", e `= 0` significa "isento", que e
 * uma declaracao fiscal. Transformar vazio em zero faria toda mercadoria sem
 * tributacao cadastrada virar isenta — e o erro apareceria meses depois, no
 * primeiro documento que chegasse ao auditor.
 *
 * O `z.union` com `z.literal("")` e necessario porque o `transform` do campo
 * obrigatorio lanca em `""`, e o `optional()` sozinho nao chega no `transform`.
 */
export function zOpcional<T extends z.ZodType>(base: T) {
  return z
    .union([base, z.literal("")])
    .optional()
    .transform((valor) => (valor === "" || valor === undefined ? null : (valor as z.infer<T>)));
}

/**
 * Quantidade que aceita vazio e vira `0`.
 *
 * Usada em estoque minimo e maximo, que sao "zero significa sem controle" — um
 * padrao legitimo, e nao "nao informado". Por isso `0` e o certo aqui, ao
 * contrario dos percentuais fiscais acima.
 *
 * O `z.union([zQuantidade, z.literal("")])` vem ANTES do transform: `zQuantidade`
 * ja tem `transform` para `Decimal`, entao o `""` precisa ser aceito no input.
 * Nao dava para usar `zQuantidade.default(0)`: o `default` recebe o valor de
 * SAIDA do schema, que ja e `Decimal`, e passar a string `"0"` la e um erro de
 * tipo que so apareceria em producao.
 */
export const zQuantidadeOuZero = z
  .union([zQuantidade, z.literal("")])
  // O `.optional()` e obrigatorio, e o teste do cadastro minimo de produto
  // mostrou por que: sem ele, `estoqueMinimo` ausente reprovava o schema
  // inteiro. A `.default()` do `zQuantidade` nao serviria, porque `zQuantidade`
  // tem `transform` e a `.default()` recebe o valor de saida, que ja e
  // `Decimal` — passar a string `"0"` ali e erro de tipo.
  .optional()
  .transform((valor) => (valor === undefined || valor === "" ? new Decimal(0) : valor));

/**
 * Checkbox do formulario.
 *
 * O `padrao` e o valor quando o campo NAO CHEGA no `FormData` — e essa e a
 * parte que o `.optional().transform(v => v === true || v === "on")` faz
 * errar. Ausente vira `false` sempre, e isso e errado para `ativo`, cujo padrao
 * no banco e `true`: um produto novo era gravado inativo, sumia da venda, e
 * ninguem sabia por que. Ausente tem que valer `padrao`; `""` (checkbox
 * desmarcado) e que vale `false`.
 */
export function zCheck(padrao: boolean) {
  return z
    .union([z.boolean(), z.literal("on"), z.literal("")])
    .optional()
    .transform((valor) => {
      if (valor === undefined) return padrao;
      return valor === true || valor === "on";
    });
}

/** `Decimal` -> texto do formulario, no formato que a pessoa digitou. */
export function decimalParaCampo(valor: DecimalValue | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  // `toFixed(2)` arredondaria uma quantidade de 4 casas. O `toString` mantem a
  // precisao que o `Decimal` tem, e so normaliza o separador.
  return valor.toString().replace(".", ",");
}
