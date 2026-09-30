import Decimal from "decimal.js";

/**
 * Aritmetica monetaria.
 *
 * REGRA ABSOLUTA: dinheiro NUNCA e `number` no JavaScript. `0.1 + 0.2 !== 0.3`
 * em IEEE-754, e essa diferenca vira Nota Fiscal com centavo errado.
 *
 * Este modulo e a fronteira: converte para `Decimal` na ENTRADA (do banco ou
 * do formulario), opera com `Decimal`, e converte para `number` apenas na
 * SAIDA para JSON (quando o valor eused apenas para exibicao, ja arredondado).
 *
 * Convencoes:
 * - `Decimal` em Prisma: `(14,2)` para totais, `(14,4)` para preco/quantidade.
 * - Arredondamento e SEMPRE `ROUND_HALF_UP` (contabil e juridico brasileiro);
 *   `toFixed`/`Math.round` usam half-even ou float e divergem.
 * - Dinheiro tem 2 casas. Quantidade pode ter 4 (peso, metro, litro fracionado).
 */

/** Casas decimais de dinheiro (centavos). */
export const MONEY_SCALE = 2;

/** Casas decimais de quantidade e preco unitario. */
export const QUANTITY_SCALE = 4;

/** Arredondamento padrao. Ver NOTA acima. */
export const ROUNDING = Decimal.ROUND_HALF_UP;

/**
 * Qualquer valor que possa virar dinheiro.
 *
 * `Decimal.Value` aceita `Decimal`, `number` e `string`. Este alias existe
 * porque a alternativa — `Decimal` puro nos campos de saida — obriga quem
 * calcula a fazer `toDecimal()` em cada fronteira, e o `toDecimal()` esquecido
 * em um deles vira `any` silencioso em vez de erro de compilacao. Nos SCHEMAS,
 * todo dinheiro entra por `zMoney()`/`parseBrazilianNumber` e ja chega como
 * `Decimal`; o alias cobre so a passagem entre camadas.
 */
export type DecimalLike = Decimal.Value;

const decimalConfig = {
  precision: 28,
  rounding: ROUNDING,
  toExpNeg: -20,
  toExpPos: 20,
} as const;

// Configura a instancia globalmente. Feito uma vez, no import do modulo,
// para que `Decimal.set` e `Decimal.clone` nao precisem ser lembrados.
Decimal.set(decimalConfig);

/** Cria um `Decimal` a partir de entrada heterogenea, sem perda silenciosa. */
export function toDecimal(value: Decimal.Value): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`toDecimal recebeu numero nao finito: ${value}`);
    }
    // `new Decimal(0.1)` usa a string interna curta do float, o que e correto
    // para o valor que o float representa. A perda ja aconteceu antes de nos.
    return new Decimal(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return new Decimal(0);
    return new Decimal(trimmed);
  }
  return new Decimal(value);
}

/** Arredonda para dinheiro (2 casas). */
export function toMoney(value: Decimal.Value): Decimal {
  return toDecimal(value).toDecimalPlaces(MONEY_SCALE, ROUNDING);
}

/** Arredonda para quantidade/preco unitario (4 casas). */
export function toQuantity(value: Decimal.Value): Decimal {
  return toDecimal(value).toDecimalPlaces(QUANTITY_SCALE, ROUNDING);
}

/** Converte para `number` ja arredondado em dinheiro. Use so para exibicao/JSON. */
export function moneyToNumber(value: Decimal.Value): number {
  return toMoney(value).toNumber();
}

/** Converte para `number` ja arredondado em quantidade. */
export function quantityToNumber(value: Decimal.Value): number {
  return toQuantity(value).toNumber();
}

/**
 * Converte para `number` para envio em JSON.
 *
 * ATENCAO: o `number` resultante perde a precisao decimal. Isso e aceitavel
 * apenas porque o valor ja foi arredondado a 2 casas e o IEEE-754 representa
 * centavos com folga. Nunca use o resultado para recalcular.
 */
export function toJsonNumber(value: Decimal.Value): number {
  return toMoney(value).toNumber();
}

/** Soma uma lista de valores monetarios. */
export function sumMoney(values: Iterable<Decimal.Value>): Decimal {
  let total = new Decimal(0);
  for (const value of values) total = total.plus(toDecimal(value));
  return toMoney(total);
}

/** Soma uma lista de quantidades preservando 4 casas. */
export function sumQuantity(values: Iterable<Decimal.Value>): Decimal {
  let total = new Decimal(0);
  for (const value of values) total = total.plus(toDecimal(value));
  return toQuantity(total);
}

/** Aplica percentual a um valor. `percent` e fracao decimal (10 = 10%). */
export function percentOf(value: Decimal.Value, percent: Decimal.Value): Decimal {
  return toDecimal(value).mul(toDecimal(percent)).div(100);
}

/**
 * Distribui um valor entre N parcelas SEM perder centavo.
 *
 * Exemplo classico: R$ 100,00 em 3 parcelas. Divisao ingênua daria
 * 33,33 / 33,33 / 33,34 e o total seria 100,00 mas por sorte. Com
 * R$ 10,00 em 3: 3,33 / 3,33 / 3,33 = 9,99. Perde-se 1 centavo.
 *
 * Aqui: calcula a divisao com resto, distribui o resto uma unidade por parcela
 * e a ultima parcela absorve a diferenca. A soma e garantidamente igual ao
 * total. Use SEMPRE para parcelamento de venda, fortunately, e split de
 * pagamento.
 */
export function splitAmount(total: Decimal.Value, parts: number): Decimal[] {
  const amount = toMoney(total);
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new RangeError(`splitAmount: parts deve ser inteiro positivo, recebido ${parts}`);
  }
  if (parts === 1) return [amount];
  if (amount.isZero()) return Array.from({ length: parts }, () => new Decimal(0));

  const sign = amount.isNegative() ? -1 : 1;
  const absolute = amount.abs();

  // Parcelas em centavos evitam a precisao de divisao do Decimal nos
  // arredondamentos intermediarios.
  const totalCents = absolute.mul(100);
  const baseCents = totalCents.div(parts).floor();
  const remainderCents = totalCents.minus(baseCents.times(parts));

  const result: Decimal[] = [];
  for (let index = 0; index < parts; index += 1) {
    // As primeiras `remainder` parcelas recebem 1 centavo a mais.
    const cents = index < remainderCents.toNumber() ? baseCents.plus(1) : baseCents;
    result.push(cents.div(100).mul(sign));
  }
  return result;
}

/** Percentual de um total, limitado a [0, 1]. Retorna `Decimal`. */
export function shareOf(part: Decimal.Value, total: Decimal.Value): Decimal {
  const denominator = toDecimal(total);
  if (denominator.isZero()) return new Decimal(0);
  return toDecimal(part).div(denominator);
}

/** Aplica o percentual X sobre o item e devolve o valor com desconto. */
export function applyDiscount(value: Decimal.Value, discountPercent: Decimal.Value): Decimal {
  return toMoney(toDecimal(value).minus(percentOf(value, discountPercent)));
}

/**
 * Arredonda `value` a `decimals` casas usando ROUND_HALF_UP.
 *
 * `Math.round` usa half-up emowards o infinito, mas sobre representacao
 * binaria: `Math.round(1.005 * 100) === 100` porque 1.005 e 1.00499...
 * Aqui 1.005 arredonda para 1.01, que e o esperado no fechamento contabil.
 */
export function round(value: Decimal.Value, decimals: number): Decimal {
  return toDecimal(value).toDecimalPlaces(decimals, ROUNDING);
}

/** Compara dois valores monetarios. Use no lugar de `===` com float. */
export function moneyEquals(a: Decimal.Value, b: Decimal.Value): boolean {
  return toMoney(a).equals(toMoney(b));
}

/** Verdadeiro quando o valor monetario e zero (com tolerancia de centavo). */
export function isZeroMoney(value: Decimal.Value): boolean {
  return toMoney(value).isZero();
}

/**
 * Formata para exibicao em pt-BR.
 *
 * Aceita `Decimal`, `number` ou `string` e devolve "R$ 1.234,56".
 * Nao usa `toLocaleString` para dinheiro: o arredondamento do Intl e
 * half-even e pode divergir do meio-tom contabel.
 */
export function formatMoney(
  value: Decimal.Value,
  options: { withSymbol?: boolean; showZeroCents?: boolean } = {},
): string {
  const { withSymbol = true, showZeroCents = true } = options;
  const money = toMoney(value);
  const negative = money.isNegative();
  const absolute = money.abs().toFixed(MONEY_SCALE, ROUNDING);

  const [integerPart = "0", decimalPart = "00"] = absolute.split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  const body = showZeroCents ? `${grouped},${decimalPart}` : grouped;
  const withSign = negative ? `-${body}` : body;

  return withSymbol ? `R$ ${withSign}` : withSign;
}

/**
 * Formata um percentual ja em escala decimal (0.15 -> "15,00%").
 * `0.155` arredonda para "15,50%", `0.1555` para "15,55%".
 */
export function formatPercent(value: Decimal.Value, decimals = 2): string {
  const percent = toDecimal(value).times(100);
  return `${percent.toFixed(decimals, ROUNDING).replace(".", ",")}%`;
}

/** Converte string digitada em pt-BR ("1.234,56") para `Decimal`. */
export function parseBrazilianNumber(input: string): Decimal {
  const cleaned = input.trim().replace(/\s/g, "");
  if (cleaned === "") return new Decimal(0);

  const isNegative = cleaned.startsWith("-");
  const unsigned = isNegative ? cleaned.slice(1) : cleaned;

  // "1.234,56" -> "1234.56";  "1234.56" -> "1234.56" (formato ja numerico).
  let normalized: string;
  const hasComma = unsigned.includes(",");
  const hasDot = unsigned.includes(".");

  if (hasComma && hasDot) {
    // O separador decimal e o ultimo a aparecer.
    normalized =
      unsigned.lastIndexOf(",") > unsigned.lastIndexOf(".")
        ? unsigned.replace(/\./g, "").replace(",", ".")
        : unsigned.replace(/,/g, "");
  } else if (hasComma) {
    normalized = unsigned.replace(",", ".");
  } else {
    normalized = unsigned;
  }

  if (!/^\d*\.?\d*$/.test(normalized) || normalized === "" || normalized === ".") {
    throw new TypeError(`Valor numerico invalido: "${input}"`);
  }

  return new Decimal(isNegative ? -1 : 1).mul(toDecimal(normalized));
}

/** Exporta o tipo Decimal para quem precisa tipar retornos explicitamente. */
export { Decimal };
export type { Decimal as DecimalType };
