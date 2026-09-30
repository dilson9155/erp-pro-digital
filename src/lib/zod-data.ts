import { z } from "zod";

/**
 * Campo de data do formulario.
 *
 * O `<input type="date">` entrega `YYYY-MM-DD` e nada mais. Transformar isso em
 * `Date` e a etapa onde o projeto ja perdeu um dia em dados reais, duas vezes.
 *
 * ## O PROBLEMA DA MEIA-NOITE
 *
 * `new Date("1990-05-10")` — sem a parte da hora — e interpretado como UTC
 * pelos padroes da linguagem, mas `new Date()` no servidor tem fuso. Num fuso
 * negativo, essa meia-noite UTC ja e a noite do dia 9 na hora local, e o
 * `.toLocaleDateString()` mostra **09/05** para uma data que a pessoa digitou
 * como **10/05**. O mesmo dado entra como dia 10 e sai como dia 9.
 *
 * ## POR QUE MEIO-DIA
 *
 * `T12:00:00.000Z` deixa 12 horas de folga em cada lado. O fuso mais extremo do
 * planeta e UTC-12; meio-dia UTC cai no dia correto em qualquer um dos dois
 * extremos. A alternativa seria converter explicitamente para o fuso do
 * servidor, que troca o bug de meia-noite por um de mudanca de fuso no servidor.
 *
 * ## POR QUE UM MODULO PROPRIO
 *
 * `pessoas/schema.ts` tinha essa transformacao escrita como `DATA` local. A data
 * de nascimento de um cliente e a data de uma venda usam exatamente a mesma
 * regra, e a regra tem que ser a mesma: duas copias divergem assim que uma delas
 * ganha um ajuste, e a divergencia aparece como "a data de nascimento virou um
 * dia" num cadastro e "a venda e do dia anterior" em outro.
 */

/** `YYYY-MM-DD` -> `Date` em UTC ao meio-dia. Ausente ou vazio vira `null`. */
export const zDataOpcional = z
  .union([z.string(), z.literal("")])
  .optional()
  // O `.trim()` antes de qualquer `refine`: espaco em volta e digitado em
  // campo controlado por script, e um " 2026-03-10 " recusado por espaco e um
  // bug. O tipo continua `string | undefined`, entao as mensagens abaixo nao
  // mudam de lugar.
  .transform((valor) => (typeof valor === "string" ? valor.trim() : valor))
  .refine((valor) => valor === undefined || valor === "" || PADRAO.test(valor), {
    error: "Informe a data no formato AAAA-MM-DD",
  })
  .refine((valor) => valor === undefined || valor === "" || dataExiste(valor), {
    error: "Informe uma data que exista no calendario",
  })
  .transform((valor) =>
    valor === undefined || valor === "" ? null : new Date(`${valor}T12:00:00.000Z`),
  );

/** `YYYY-MM-DD` -> `Date` em UTC ao meio-dia, obrigatorio. */
export const zData = z
  .string({ error: "Informe a data" })
  .trim()
  .refine((valor) => PADRAO.test(valor), { error: "Informe a data no formato AAAA-MM-DD" })
  .refine((valor) => dataExiste(valor), { error: "Informe uma data que exista no calendario" })
  .transform((valor) => new Date(`${valor}T12:00:00.000Z`));

const PADRAO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A data existe no calendario?
 *
 * A regex sozinha aceita "2026-02-31" e "2026-13-01", e o construtor do
 * JavaScript NAO reclama: ele rola para o mes seguinte e devolve um dia
 * valido. "2026-02-31" viraria 3 de março, "2026-13-01" viraria janeiro do ano
 * seguinte, e a pessoa que digitou 31 de fevereiro receberia um salvamento
 * bem-sucedido com outra data. E o que a comparacao com o texto de volta
 * pega — o `toISOString` do resultado nao confere com o que foi digitado.
 *
 * A mesma comparacao rejeita "2026-02-29": 2026 nao e ano bissexto, e o
 * construtor rola para 1 de março.
 */
function dataExiste(texto: string): boolean {
  const data = new Date(`${texto}T12:00:00.000Z`);
  if (Number.isNaN(data.getTime())) return false;
  return data.toISOString().slice(0, 10) === texto;
}

/**
 * `Date` -> `YYYY-MM-DD` para o `<input type="date">`.
 *
 * A volta da data para o campo tem o MESMO problema da entrada, e e por isso
 * que ela le `toISOString` e nao os metodos locais: o mesmo dia 10, formatado
 * no fuso de Sao Paulo, viraria dia 9 e o `<input>` mostraria 09/05 num
 * cadastro de 10/05.
 */
export function dataParaCampo(valor: Date | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  return valor.toISOString().slice(0, 10);
}
