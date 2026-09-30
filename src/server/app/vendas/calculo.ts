import type Decimal from "decimal.js";

import { AppError, ErrorCode } from "@/lib/errors";
import {
  round,
  splitAmount,
  sumMoney,
  toDecimal,
  toMoney,
  toQuantity,
  type DecimalLike,
} from "@/lib/money";

/**
 * Calculo financeiro de uma venda.
 *
 * Este modulo e PURO de proposito: nao toca em banco, nao importa Prisma e nao
 * le `Date.now()`. Todo calculo de dinheiro entra por aqui com as entradas
 * explicitas, o que permite testar a aritmetica inteira com o caso de centavos
 * que o dinheiro de verdade produz — "3 parcelas de 33,33" que somam 99,99
 * num total de 100,00.
 *
 * A separacao tambem evita o pior bug POSSIVEL num ERP: o mesmo valor calculado
 * em dois lugares. A tela de confirmacao e a action que grava usam a mesma
 * funcao, entao o total que a pessoa viu antes de clicar e o total que foi
 * gravado nao podem divergir.
 *
 * ## O QUE FICA FORA, DE PROPONITO
 *
 * **Tributos.** Todo item nasce com `taxPercent = 0` e `taxAmount = 0`, e o
 * calculo de tributacao depende de NCM, CEST, CFOP e da regra da UF, que ainda
 * nao existem no sistema. Inventar um "ICMS 18%" aqui pareceria funcionar e
 * estaria errado em quase toda venda. O espaco esta reservado no schema e a
 * formula do total ja soma o que vier.
 *
 * **Juros e desconto de cash.** Esta versao REJEITA termos com juros ou com
 * grade de vencimento customizada, em vez de ignorá-los. Silenciosamente
 * calcular errado um valor que o cliente vai pagar e o pior tipo de bug
 * financeiro: o sistema parece funcionar e o erro so aparece na conciliacao,
 * semanas depois. Ver `validarTermosSuportados`.
 */

/** Uma linha de venda como vem do formulario. */
export interface ItemVendaCalculado {
  /** Posicao na tela, preservada na gravacao como `sortOrder`. */
  readonly indice: number;
  readonly productId: string | null;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: DecimalLike;
  readonly unitPrice: DecimalLike;
  readonly discountAmount: DecimalLike;
  /**
   * Custo unitario vigente no momento do calculo, vindo de
   * `StockItem.averageCost`. `null` em servico e em item sem estoque.
   */
  readonly unitCost: DecimalLike | null;
}

export interface VendaCalculada {
  readonly itens: readonly ItemCalculado[];
  readonly subtotal: Decimal;
  readonly discountAmount: Decimal;
  readonly shippingAmount: Decimal;
  readonly taxAmount: Decimal;
  readonly total: Decimal;
  readonly costAmount: Decimal;
  readonly profitAmount: Decimal;
  /** Custo total dos produtos, para a margem percentual. */
  readonly custoDeReferencia: Decimal;
}

export interface ItemCalculado {
  readonly indice: number;
  readonly productId: string | null;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: Decimal;
  readonly unitPrice: Decimal;
  readonly discountAmount: Decimal;
  readonly grossAmount: Decimal;
  readonly total: Decimal;
  readonly unitCost: Decimal;
  readonly costAmount: Decimal;
  /** Tributos do item. Sempre zero enquanto nao houver motor fiscal. */
  readonly taxPercent: Decimal;
  readonly taxAmount: Decimal;
  readonly grossTaxAmount: Decimal;
}

/**
 * O total da venda.
 *
 * `subtotal - desconto + frete + tributos`.
 *
 * COMO LER O `total` HOJE
 *
 * Sem motor fiscal, `taxAmount` e `0`, entao o `total` hoje e o valor liquido
 * (ja com desconto e frete). A formula ja esta completa para quando os tributos
 * existirem, e e por isso que o campo nao guarda "valor sem imposto": ele guarda
 * o total do documento, e o que o cliente paga.
 *
 * O que ainda NAO pode ser feito e comparar este `total` com o total de uma
 * venda ja emitida com NF-e, porque naquela o tributo ja estava dentro. Esse
 * ajuste de semantica fica para quando existir o motor fiscal, e e a unica
 * migracao conceitual que essa escolha exige.
 */
export function calcularVenda(
  entradas: readonly ItemVendaCalculado[],
  opcoes: { readonly descontoCabecalho?: DecimalLike; readonly frete?: DecimalLike } = {},
): VendaCalculada {
  const itens = entradas.map((item, indice) => calcularItem(item, indice));

  const subtotal = sumMoney(itens.map((i) => i.grossAmount));
  const descontoItens = sumMoney(itens.map((i) => i.discountAmount));
  const desconto = toMoney(descontoItens.plus(toMoney(opcoes.descontoCabecalho ?? 0)));
  const frete = toMoney(opcoes.frete ?? 0);
  const tributos = toMoney(sumMoney(itens.map((i) => i.taxAmount)));

  const totalBruto = toMoney(subtotal.minus(desconto).plus(frete).plus(tributos));
  // Mesmo limite do item. O desconto do cabecalho e livre, e um desconto de
  // cabecalho maior que a venda inteira viraria a mesma conta a receber
  // negativa — sem passar pelo item, que e onde a protecao de cima nao pega.
  const total = totalBruto.isNegative() ? toMoney(0) : totalBruto;
  const custo = toMoney(sumMoney(itens.map((i) => i.costAmount)));

  return {
    itens,
    subtotal,
    discountAmount: desconto,
    shippingAmount: frete,
    taxAmount: tributos,
    total,
    costAmount: custo,
    profitAmount: toMoney(total.minus(tributos).minus(custo)),
    custoDeReferencia: custo,
  };
}

/**
 * Uma linha de venda.
 *
 * `grossAmount` e `quantity * unitPrice` SEM desconto; `total` e o valor
 * realmente cobrado da linha, com o desconto do item. A distincao existe
 * porque o `subtotal` da venda tem de ser o bruto — e o desconto da venda, um
 * campo so. Sem isso, o desconto do item desapareceria do relatorio de desconto
 * e o `subtotal` mentiria sobre o volume vendido.
 *
 * ## POR QUE `max(0)` NO DESCONTO
 *
 * Desconto maior que o item daria item negativo. Item negativo nao e um erro
 * cosmetico: ele entra em `stock_movements` como quantidade de baixa, faz a
 * conta a receber receber um valor negativo e derruba o total da venda. O
 * resultado e um saldo negativo que a pessoa precisa explicar para o
 * contador — partindo de um simples erro de digitacao no campo de desconto.
 *
 * O desconto continua sendo gravado como digitado, entao o relatorio mostra o
 * desconto pedido. O que nunca acontece e o total cair abaixo de zero.
 */
export function calcularItem(entrada: ItemVendaCalculado, indice: number): ItemCalculado {
  const quantity = toQuantity(entrada.quantity);
  const unitPrice = toDecimal(entrada.unitPrice);
  const desconto = toMoney(entrada.discountAmount);
  const unitCost = toQuantity(entrada.unitCost ?? 0);

  const bruto = round(quantity.times(unitPrice), 2);
  const total = toMoney(bruto.minus(desconto));
  const liquido = total.isNegative() ? toMoney(0) : total;
  const custo = round(quantity.times(unitCost), 2);

  return {
    indice,
    productId: entrada.productId,
    serviceId: entrada.serviceId,
    description: entrada.description,
    quantity,
    unitPrice,
    discountAmount: desconto,
    grossAmount: toMoney(bruto),
    total: liquido,
    unitCost,
    costAmount: toMoney(custo),
    // Placeholder explicito: quando o motor fiscal entrar, estes tres campos
    // passam a vir da regra por NCM/CEST/UF em vez de zero.
    taxPercent: toDecimal(0),
    taxAmount: toMoney(0),
    grossTaxAmount: toMoney(0),
  };
}

/** Percentual de margem sobre o custo. `null` quando nao ha custo de referencia. */
export function margemPercentual(lucro: DecimalLike, custo: DecimalLike): number | null {
  const base = toMoney(custo);
  if (base.isZero()) return null;
  return toMoney(toMoney(lucro).dividedBy(base)).times(100).toNumber();
}

// ---------------------------------------------------------------------------
// Vencimentos
// ---------------------------------------------------------------------------

/** Os tipos de `PaymentTerms` que esta versao sabe transformar em datas. */
const TIPOS_SUPORTADOS = new Set([
  "A_VISTA",
  "DIAS",
  "DIAS_RECEBIMENTO",
  "DIA_FIXO",
  "PARCELADO",
]);

/**
 * Termos que esta versao nao consegue calcular, rejeitados em vez de ignorados.
 *
 * Sao duas situacoes em que a formula "valor dividido em N parcelas com
 * intervalo de D dias" produz uma data errada sem nenhum sinal visivel:
 *
 * - `interestPercentMonthly > 0`: o valor de cada parcela depende de juros, e a
 *   divisao simples nao os aplica. Um termo de 3x com 2% a.m. geraria
 *   parcelas iguais que somam menos que o total, e o cliente pagaria menos do
 *   que o sistema diz que deve.
 * - `CUSTOM`: o prazo esta em `customDescription`, que e texto livre — nao ha
 *   data nenhuma para extrair. Tratar como "uma parcela para hoje" jogaria a
 *   venda no controle de vencimento com a data errada.
 *
 * As duas viram erro de regra visivel, que e o que a pessoa consegue corrigir.
 * A alternativa — calcular assim mesmo e anotar a limitacao — deixaria o erro
 * aparecer no fluxo de caixa, semanas depois, sem ninguem ligando as duas coisas.
 */
export function validarTermosSuportados(termos: {
  readonly type: string;
  readonly interestPercentMonthly: DecimalLike;
}): void {
  if (!TIPOS_SUPORTADOS.has(termos.type)) {
    throw new AppError(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      "Condicao de pagamento com prazo manual ainda nao suportada. Escolha um prazo com vencimento automatico.",
    );
  }
  if (!toDecimal(termos.interestPercentMonthly).isZero()) {
    throw new AppError(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      "Condicao de pagamento com juros ainda nao suportada. Sera corrigido apos a implementacao do motor de juros.",
    );
  }
}

export interface ParcelaCalculada {
  readonly numero: number;
  readonly total: number;
  readonly dueDate: Date;
  readonly amount: Decimal;
}

/**
 * Parcelas de um valor, com os vencimentos pelos termos de pagamento.
 *
 * `base` e a data de competencia da venda. Usar "hoje" em vez dela mudaria o
 * primeiro vencimento conforme o horario em que a pessoa clica em confirmar —
 * uma venda aberta as 23h50 vira para o dia seguinte, e a primeira parcela fica
 * um dia adiantada sem ninguem ter pedido isso.
 *
 * ## OS CENTAVOS DA DIVISAO
 *
 * `splitAmount` distribui o resto, e nao `total / n`. Com total 100,00 em 3
 * parcelas, a divisao ingenua da 33,33 para as tres e perde 1 centavo: o
 * cliente pagaria 99,99 e o sistema continuaria mostrando 0,01 em aberto para
 * sempre. O resto vai para a primeira parcela.
 */
export function gerarParcelas(
  total: DecimalLike,
  termos: {
    readonly type: string;
    readonly installmentCount: number;
    readonly intervalDays: number;
    readonly fixedDay: number | null;
    /**
     * Juros mensais do termo. OBRIGATORIO de propósito: com o campo opcional,
     * quem chamasse sem ele passaria `0` implícito e a checagem de
     * `validarTermosSuportados` rodaria sobre um juro que ninguém informou —
     * o termo com juros entraria como se fosse sem juros, que é exatamente o
     * erro que a validação existe para impedir.
     */
    readonly interestPercentMonthly: DecimalLike;
  },
  base: Date,
): ParcelaCalculada[] {
  const valor = toMoney(total);
  validarTermosSuportados(termos);

  switch (termos.type) {
    case "A_VISTA":
      return [{ numero: 1, total: 1, dueDate: base, amount: valor }];

    case "DIAS":
    case "DIAS_RECEBIMENTO": {
      const dias = Math.max(0, termos.installmentCount);
      return [{ numero: 1, total: 1, dueDate: addDays(base, dias), amount: valor }];
    }

    case "DIA_FIXO":
      // A faixa 1..28 e validada em `diaFixo`, antes de `Date.UTC` rolar dia 31
      // silenciosamente para o mes seguinte.
      return [{ numero: 1, total: 1, dueDate: diaFixo(base, termos.fixedDay), amount: valor }];

    case "PARCELADO": {
      const quantidade = Math.max(1, termos.installmentCount);
      const intervalo = Math.max(0, termos.intervalDays);
      const valores = splitAmount(valor, quantidade);
      return valores.map((amount, i) => ({
        numero: i + 1,
        total: quantidade,
        dueDate: addDays(base, intervalo * i),
        amount,
      }));
    }

    default:
      // `validarTermosSuportados` ja barrou os demais; fica aqui porque o
      // `switch` nao e exhaustivo para o compilador sobre `string`.
      throw new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, "Condicao de pagamento nao suportada.");
  }
}

/**
 * Proximo dia fixo a partir de `base`.
 *
 * Se o dia fixo do mes corrente ainda nao passou, vence neste mes; senao, no
 * seguinte.
 *
 * ## POR QUE A VALIDACAO ESTA AQUI E NAO NO CHAMADOR
 *
 * O limite e 1..28, e ele existe porque `new Date(Date.UTC(ano, mes, 31))` nao
 * da erro: o JavaScript rola para 1 de abril, e devolve um dia valido que
 * ninguem pediu. Com dia 31, a mesma serie pagaria em 28 de fevereiro num ano e
 * em 3 de marco no seguinte — vencimento variando com o ano, sem nenhum aviso.
 *
 * `Date.UTC` normaliza overflow em silencio, entao a checagem precisa acontecer
 * ANTES da conta. E precisa estar nesta funcao, e nao em quem a chama, porque a
 * funcao que faz a conta de data e a unica que sabe que `31` vira "1 do mes
 * seguinte" em vez de dia invalido.
 */
export function diaFixo(base: Date, dia: number | null): Date {
  if (dia === null || !Number.isInteger(dia) || dia < 1 || dia > 28) {
    throw new AppError(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      "Prazo com dia fixo invalido. Use um dia entre 1 e 28.",
    );
  }
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth();
  const diaBase = base.getUTCDate();
  const alvo = dia >= diaBase ? new Date(Date.UTC(ano, mes, dia)) : new Date(Date.UTC(ano, mes + 1, dia));
  return aoMeioDia(alvo);
}

/**
 * Soma de dias mantendo o meio-dia UTC.
 *
 * Somar 24h em ms a uma data UTC jogada para a meia-noite UTC seria correto em
 * teoria, mas `new Date()` no servidor tem fuso e o erro de uma hora vira um
 * dia de atraso no vencimento. O meio-dia UTC deixa 12 horas de folga em cada
 * lado, e a regra do projeto ja usa isso em `pessoas/schema.ts`.
 */
export function addDays(base: Date, dias: number): Date {
  return aoMeioDia(new Date(base.getTime() + dias * 24 * 60 * 60 * 1000));
}

function aoMeioDia(data: Date): Date {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate(), 12, 0, 0, 0),
  );
}
