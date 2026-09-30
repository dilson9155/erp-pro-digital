/**
 * Leitura de `FormData` para as Server Actions.
 *
 * POR QUE UM MODULO SO, E NAO `Object.fromEntries(dados)` EM CADA ACTION
 *
 * `FormData` devolve `string | File` e nao tem noção de tipo. O caminho curto —
 * `dados.get("preco")` direto no Zod — funciona, e empurra para dentro de cada
 * acao tres decisiones que ja foram tomadas uma vez:
 *
 * 1. Campo vazio. `Number("")` e `0`, nao `null`. Um preco em branco viraria
 *    R$ 0,00 gravado, e a venda sairia por nada. Aqui, vazio e `undefined`, e o
 *    Zod decide se o campo e obrigatorio.
 * 2. Decimal. `parseFloat` aceita "1.234,56" como `1.234`, e o produto gravaria
 *    mil reais em vez de mil duzentos. A conversao passa por
 *    `parseBrazilianNumber`, que entende o que o brasileiro digita.
 * 3. Checkbox. Ausente nao e `false` por acidente: Ausente e "nao marcado", e
 *    a action que decide o que isso significa.
 *
 * Este modulo faz a traducao mecanica e deixa a REGRA com a action. O que e
 * obrigatorio, o que e valido e o que acontece quando falta sao perguntas do
 * negocio, e por isso ficam no schema Zod de cada acao, onde o teste le.
 */

import { parseBrazilianNumber, toDecimal } from "@/lib/money";
import type { Decimal } from "@/lib/money";

/** `string` do campo, ou `undefined` quando vazio/ausente. */
export function texto(dados: FormData, campo: string): string | undefined {
  const bruto = dados.get(campo);
  if (bruto === null) return undefined;
  const valor = typeof bruto === "string" ? bruto.trim() : "";
  return valor === "" ? undefined : valor;
}

/** `string` do campo, sempre presente (mesmo vazia). Para campo de texto livre. */
export function textoBruto(dados: FormData, campo: string): string {
  const bruto = dados.get(campo);
  return typeof bruto === "string" ? bruto.trim() : "";
}

/** Inteiro, ou `undefined` quando vazio. */
export function inteiro(dados: FormData, campo: string): number | undefined {
  const valor = texto(dados, campo);
  if (valor === undefined) return undefined;
  const convertido = Number(valor);
  return Number.isInteger(convertido) ? convertido : Number.NaN;
}

/** Decimal em pt-BR ("1.234,56"). Lanca quando o texto nao e numero. */
export function decimal(dados: FormData, campo: string): Decimal | undefined {
  const valor = texto(dados, campo);
  if (valor === undefined) return undefined;
  return parseBrazilianNumber(valor);
}

/** Decimal pt-BR com `0` como padrao, para campo de total calculado. */
export function decimalOuZero(dados: FormData, campo: string): Decimal {
  return decimal(dados, campo) ?? toDecimal(0);
}

/**
 * `true` quando o checkbox veio marcado.
 *
 * USA `getAll`, E NAO `get`, POR CAUSA DO CAMPO ESCONDIDO PAR.
 *
 * O par marcado/desmarcado com o mesmo `name` resolve o problema real do
 * checkbox em formulario sem JavaScript, mas inverte a leitura: `get` devolve o
 * PRIMEIRO valor, e o campo escondido vem primeiro no HTML. Com `get`, um
 * checkbox marcado leria `""` e um desmarcado leria `""` — os dois iguais, e a
 * acao nunca veria `true`.
 *
 * `getAll` devolve os dois, e a resposta e "marcado se ALGUM valor for `on`". A
 * ordem dos campos deixa de importar, que e o que torna o par seguro de usar.
 */
export function marcado(dados: FormData, campo: string): boolean {
  return dados.getAll(campo).some((bruto) => bruto === "on" || bruto === "true" || bruto === "1");
}

/**
 * Data no formato do `<input type="date">` (`AAAA-MM-DD`), como `Date` UTC.
 *
 * UTC e deliberado. `new Date("2026-01-31")` em Node interpreta como UTC e
 * `new Date("31/01/2026")` como local — a mesma data vira dia 30 depois de noon
 * no Brasil. Parsear o `AAAA-MM-DD` a mao e montar `Date.UTC` mantem o dia que o
 * usuario digitou, que e o que ele quer dizer.
 */
export function data(dados: FormData, campo: string): Date | undefined {
  const valor = texto(dados, campo);
  if (valor === undefined) return undefined;
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return undefined;
  const [, ano, mes, dia] = partes;
  if (!ano || !mes || !dia) return undefined;
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

/** `Date | null`, para campo opcional gravado como nulo. */
export function dataOuNula(dados: FormData, campo: string): Date | null {
  return data(dados, campo) ?? null;
}
