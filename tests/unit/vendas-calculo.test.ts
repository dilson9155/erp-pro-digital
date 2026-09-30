import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { toMoney } from "@/lib/money";
import {
  addDays,
  calcularItem,
  calcularVenda,
  diaFixo,
  gerarParcelas,
  margemPercentual,
  validarTermosSuportados,
  type ItemVendaCalculado,
} from "@/server/app/vendas/calculo";

/**
 * Aritmetica de venda.
 *
 * Sao funcoes puras, e por isso valem teste. O motivo de testar calculo
 * monetario e mais especifico que "cobrir codigo": dinheiro so quebra em casos
 * que ninguem escreve de proposito. Divisao que perde centavo, desconto maior
 * que o item, meia-noite UTC virando dia seguinte no fuso do servidor. Nenhum
 * desses aparece no review, e todos aparecem na conciliacao.
 */

const item = (extras: Partial<ItemVendaCalculado> = {}): ItemVendaCalculado => ({
  indice: 0,
  productId: "prod_1",
  serviceId: null,
  description: "Teclado",
  quantity: 1,
  unitPrice: 100,
  discountAmount: 0,
  unitCost: 60,
  ...extras,
});

/**
 * O unico elemento de uma lista, com o tamanho conferido.
 *
 * `lista[0]` direto e `parcela!` nao compilam sob `noUncheckedIndexedAccess`, e
 * a forma de resolver isso com `!` esconde justamente o que o teste devia
 * pegar: uma regra de prazo que passou a devolver duas parcelas onde se
 * esperava uma passaria despercebida.
 */
function unica<T>(lista: readonly T[]): T {
  expect(lista).toHaveLength(1);
  return lista[0] as T;
}

describe("vendas/calcularItem", () => {
  it("separa o bruto do liquido quando ha desconto no item", () => {
    const calculado = calcularItem(item({ quantity: 2, unitPrice: 50, discountAmount: 15 }), 0);

    // 2 x 50 = 100 de bruto, menos 15 = 85 cobrado.
    expect(calculado.grossAmount.toNumber()).toBe(100);
    expect(calculado.total.toNumber()).toBe(85);
  });

  it("arredonda o centavo do item em vez de deixar o erro na venda", () => {
    // 3 x 33,335 = 100,005. Arredondado no item vira 100,01; somando depois em
    // float, viraria 100,00 (ou 100,02) dependendo da ordem das somas.
    const calculado = calcularItem(item({ quantity: 3, unitPrice: "33.335" }), 0);
    expect(calculado.total.toNumber()).toBe(100.01);
  });

  it("trata item sem estoque com custo zero, e nao com custo nulo", () => {
    const calculado = calcularItem(item({ unitCost: null }), 0);
    expect(calculado.unitCost.toNumber()).toBe(0);
    expect(calculado.costAmount.toNumber()).toBe(0);
  });

  it("mantem o indice da tela", () => {
    expect(calcularItem(item(), 3).indice).toBe(3);
  });
});

describe("vendas/calcularVenda", () => {
  it("soma itens, desconto e frete no total", () => {
    const venda = calcularVenda(
      [item({ quantity: 2, unitPrice: 50, unitCost: 30 }), item({ productId: "prod_2", quantity: 1, unitPrice: 25, unitCost: 10 })],
      { frete: 15 },
    );

    // Bruto 125, sem desconto, + 15 de frete = 140.
    expect(venda.subtotal.toNumber()).toBe(125);
    expect(venda.total.toNumber()).toBe(140);
    // Custo: 2 x 30 + 1 x 10 = 70.
    expect(venda.costAmount.toNumber()).toBe(70);
    expect(venda.profitAmount.toNumber()).toBe(70);
  });

  it("soma o desconto do cabecalho junto com o dos itens", () => {
    const venda = calcularVenda([item({ quantity: 1, unitPrice: 100, discountAmount: 10 })], {
      descontoCabecalho: 5,
    });

    expect(venda.discountAmount.toNumber()).toBe(15);
    expect(venda.total.toNumber()).toBe(85);
  });

  it("mantem o subtotal como o valor vendido, sem o desconto", () => {
    // O `subtotal` alimenta relatorio de volume vendido. Se ele viesse ja com o
    // desconto, o desconto do item sumiria do relatorio de desconto e o volume
    // pareceria menor do que foi vendido.
    const venda = calcularVenda([item({ quantity: 2, unitPrice: 100, discountAmount: 30 })]);
    expect(venda.subtotal.toNumber()).toBe(200);
    expect(venda.total.toNumber()).toBe(170);
  });

  it("desconta no maximo o proprio item, nunca deixando o total negativo", () => {
    const venda = calcularVenda([item({ quantity: 1, unitPrice: 100, discountAmount: 150 })]);
    // 100 - 150 = -50. Registrar venda de -50,00 contaria estoque fantasma e
    // geraria conta a receber negativa. O item vai a zero.
    expect(venda.total.toNumber()).toBe(0);
  });

  it("devolve todos os valores em zero para venda sem itens", () => {
    const venda = calcularVenda([]);
    expect(venda.subtotal.toNumber()).toBe(0);
    expect(venda.total.toNumber()).toBe(0);
    expect(venda.profitAmount.toNumber()).toBe(0);
    expect(venda.itens).toHaveLength(0);
  });

  it("deja tributos em zero, sem motor fiscal", () => {
    const venda = calcularVenda([item()]);
    expect(venda.taxAmount.toNumber()).toBe(0);
    for (const i of venda.itens) {
      expect(i.taxPercent.toNumber()).toBe(0);
      expect(i.taxAmount.toNumber()).toBe(0);
    }
  });
});

describe("vendas/margemPercentual", () => {
  it("calcula sobre o custo", () => {
    expect(margemPercentual(40, 100)).toBe(40);
  });

  it("devolve null sem custo de referencia, e nao divisao por zero", () => {
    // Servico puro nao tem custo. `lucro / 0` em Decimal e `Infinity`, e isso
    // chegaria na tela como "Infinity%" ou, pior, num JSON invalido.
    expect(margemPercentual(100, 0)).toBeNull();
  });
});

describe("vendas/gerarParcelas", () => {
  const base = new Date("2026-03-10T12:00:00.000Z");

  it("usa a data de competencia como vencimento no vista", () => {
    const parcela = unica(gerarParcelas(100, { type: "A_VISTA", installmentCount: 1, intervalDays: 0, fixedDay: null, interestPercentMonthly: 0 }, base));
    expect(parcela.dueDate.toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(parcela.amount.toNumber()).toBe(100);
  });

  it("soma os dias do prazo em DIAS", () => {
    const parcela = unica(gerarParcelas(100, { type: "DIAS", installmentCount: 30, intervalDays: 0, fixedDay: null, interestPercentMonthly: 0 }, base));
    expect(parcela.dueDate.toISOString()).toBe("2026-04-09T12:00:00.000Z");
  });

  it("distribui o resto de centavo na primeira parcela", () => {
    // Este e o teste que importa. 100,00 em 3 partes: divisao ingenua daria
    // 33,33 + 33,33 + 33,33 = 99,99, e o cliente ficaria com 0,01 em aberto
    // para sempre. O resto vai para a primeira.
    const parcelas = gerarParcelas("100.00", { type: "PARCELADO", installmentCount: 3, intervalDays: 30, fixedDay: null, interestPercentMonthly: 0 }, base);

    expect(parcelas.map((p) => p.amount.toNumber())).toEqual([33.34, 33.33, 33.33]);
    expect(parcelas.reduce((soma, p) => soma + p.amount.toNumber(), 0)).toBe(100);
  });

  it("espaca as parcelas pelo intervalo", () => {
    const parcelas = gerarParcelas(300, { type: "PARCELADO", installmentCount: 3, intervalDays: 15, fixedDay: null, interestPercentMonthly: 0 }, base);
    expect(parcelas.map((p) => p.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-03-10",
      "2026-03-25",
      "2026-04-09",
    ]);
  });

  it("numera as parcelas de 1 e marca o total", () => {
    const parcelas = gerarParcelas(300, { type: "PARCELADO", installmentCount: 3, intervalDays: 30, fixedDay: null, interestPercentMonthly: 0 }, base);
    expect(parcelas.map((p) => p.numero)).toEqual([1, 2, 3]);
    expect(parcelas.every((p) => p.total === 3)).toBe(true);
  });

  it("usa o dia fixo do proprio mes quando ele ainda nao passou", () => {
    const parcela = diaFixo(base, 20);
    expect(parcela.toISOString().slice(0, 10)).toBe("2026-03-20");
  });

  it("joga para o mes seguinte quando o dia fixo ja passou", () => {
    // Base no dia 10, vencimento no dia 5: o 5 deste mes ja foi, entao 5 do
    // proximo. A alternativa — ficar no dia 5 do mes corrente — daria um
    // vencimento 5 dias no passado.
    const parcela = diaFixo(base, 5);
    expect(parcela.toISOString().slice(0, 10)).toBe("2026-04-05");
  });

  it("atravessa a virada de ano no dia fixo", () => {
    const dezembro = new Date("2026-12-10T12:00:00.000Z");
    expect(diaFixo(dezembro, 5).toISOString().slice(0, 10)).toBe("2027-01-05");
  });

  it("recusa dia fixo fora de 1..28", () => {
    // Dia 31 nao existe em fevereiro, e `Date.UTC(ano, mes, 31)` nao da erro:
    // ele rola para 1 do mes seguinte. Com dia 31 a serie pagaria em 28 de
    // fevereiro num ano e 3 de marco no seguinte.
    expect(() => diaFixo(base, 31)).toThrow(AppError);
    expect(() => diaFixo(base, 0)).toThrow(AppError);
  });

  it("recusa dia fixo ausente ou fracionario", () => {
    // `null` e o padrao do schema para quem nao preencheu, e nao pode virar
    // "vence hoje" sem ninguem ter pedido.
    expect(() => diaFixo(base, null)).toThrow(AppError);
    // Fracionario viraria data invalida de qualquer jeito.
    expect(() => diaFixo(base, 15.5)).toThrow(AppError);
  });
});

describe("vendas/validarTermosSuportados", () => {
  it("rejeita prazo customizado em vez de assumir vencimento", () => {
    // `customDescription` e texto livre. Tratar como "uma parcela hoje" jogaria
    // a venda no controle de vencimento com a data errada e sem nenhum aviso.
    expect(() =>
      validarTermosSuportados({ type: "CUSTOM", interestPercentMonthly: 0 }),
    ).toThrow(AppError);
  });

  it("rejeita prazo com juros em vez de calcular sem eles", () => {
    // Divisao simples ignora juros: as parcelas somariam menos que o total e o
    // cliente pagaria menos do que o sistema mostra que deve.
    expect(() =>
      validarTermosSuportados({ type: "PARCELADO", interestPercentMonthly: 2 }),
    ).toThrow(AppError);
  });

  it("aceita os prazos automaticos", () => {
    for (const type of ["A_VISTA", "DIAS", "DIAS_RECEBIMENTO", "DIA_FIXO", "PARCELADO"]) {
      expect(() => validarTermosSuportados({ type, interestPercentMonthly: 0 })).not.toThrow();
    }
  });
});

describe("vendas/addDays", () => {
  it("mantem o meio-dia UTC, para nao virar dia anterior no fuso", () => {
    // Com meia-noite UTC, `new Date()` no servidor (fuso -03) leria a data como
    // o dia anterior, e o vencimento apareceria um dia antes em todo cadastro.
    const resultado = addDays(new Date("2026-03-10T12:00:00.000Z"), 1);
    expect(resultado.toISOString()).toBe("2026-03-11T12:00:00.000Z");
  });

  it("atravessa a virada de mes", () => {
    expect(addDays(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-01");
  });
});

describe("vendas/precisao de dinheiro", () => {
  it("nao acumula erro de float em Many", () => {
    // 0,1 + 0,2 !== 0,3 em IEEE-754. Em 0,05 x 3 a soma erraria em centavos
    // depois de dezenas de itens, e o total da venda nao bateria com a soma das
    // linhas da tela.
    const itens = Array.from({ length: 20 }, () => item({ quantity: 1, unitPrice: "0.05" }));
    const venda = calcularVenda(itens);
    expect(venda.subtotal.toString()).toBe("1");
  });

  it("mantem a escala de dinheiro em 2 casas no total", () => {
    const venda = calcularVenda([item({ quantity: 3, unitPrice: "19.999" })]);
    expect(toMoney(venda.total).toFixed(2)).toBe("60.00");
  });
});
