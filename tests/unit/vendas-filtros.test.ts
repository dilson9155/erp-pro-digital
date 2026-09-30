import { describe, expect, it } from "vitest";

import { SaleStatus } from "@/generated/prisma/enums";
import { ehSituacao, filtroBusca, filtroDePeriodo, saldoDaVenda } from "@/server/app/vendas/queries";
import { rotuloDaSituacao, tomDaSituacao } from "@/server/app/vendas/rotulos";

/**
 * Filtros de venda.
 *
 * Sao tres funcoes puras, e as tres ja tiveram um bugeach na sua forma mais
 * obvia — por isso valem teste: o `where` montagem errado nao erra visivelmente,
 * ele devolve uma lista vazia e a pessoa conclui que "nao houve venda no mes".
 */
describe("vendas/filtroDePeriodo", () => {
  it("nao filtra quando nao ha periodo", () => {
    expect(filtroDePeriodo("", "")).toEqual({});
  });

  it("usa lt no dia seguinte, e nao lte no proprio dia", () => {
    // Este e o teste que importa. Com `lte`, a meia-noite de 2026-03-31 tiraria
    // da lista tudo que foi vendido DURANTE o dia 31 — a pessoa pediu o mes de
    // marco e recebeu fevereiro. O erro so apareceria no ultimo dia do filtro,
    // que e o dia que as pessoas conferem contra o extrato do banco.
    const where = filtroDePeriodo("", "2026-03-31") as { soldAt: { lt?: Date; lte?: Date } };
    // `lte` precisa estar ausente: e ele que traria o bug.
    expect(where.soldAt.lte).toBeUndefined();
    expect(where.soldAt.lt?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("atravessa virada de mes e de ano no dia seguinte", () => {
    const viradaDeMes = filtroDePeriodo("", "2026-01-31") as { soldAt: { lt: Date } };
    expect(viradaDeMes.soldAt.lt.toISOString().slice(0, 10)).toBe("2026-02-01");

    const viradaDeAno = filtroDePeriodo("", "2026-12-31") as { soldAt: { lt: Date } };
    expect(viradaDeAno.soldAt.lt.toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("trata 29 de fevereiro como dia seguinte real", () => {
    // `new Date("2026-02-29")` nao existe e o construtor rola para 1 de marco.
    // Com `setUTCDate(+1)` sobre o dia 28, o resultado e 1 de marco do ano
    // certo, sem depender de o ano ser bissexto.
    const anoBissexto = filtroDePeriodo("", "2028-02-28") as { soldAt: { lt: Date } };
    expect(anoBissexto.soldAt.lt.toISOString().slice(0, 10)).toBe("2028-02-29");

    const anoNaoBissexto = filtroDePeriodo("", "2026-02-28") as { soldAt: { lt: Date } };
    expect(anoNaoBissexto.soldAt.lt.toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("usa gte no inicio do dia inicial", () => {
    const where = filtroDePeriodo("2026-03-01", "") as { soldAt: { gte: Date } };
    expect(where.soldAt.gte.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("aceita so uma das bordas", () => {
    const soInicio = filtroDePeriodo("2026-03-01", "") as { soldAt: Record<string, Date> };
    const soFim = filtroDePeriodo("", "2026-03-31") as { soldAt: Record<string, Date> };
    expect(soInicio.soldAt.gte).toBeDefined();
    expect(soInicio.soldAt.lt).toBeUndefined();
    expect(soFim.soldAt.lt).toBeDefined();
    expect(soFim.soldAt.gte).toBeUndefined();
  });
});

describe("vendas/filtroBusca", () => {
  it("nao filtra com termo vazio", () => {
    expect(filtroBusca("")).toEqual({});
    expect(filtroBusca("   ")).toEqual({});
  });

  it("busca por numero, cliente e vendedor", () => {
    // Termo SEM digito, senao os dois campos de documento entram tambem e a
    // contagem de 3 nao valeria. "Joao" e o caso de quem nao sabe o CNPJ.
    const where = filtroBusca("Joao") as { OR: Record<string, unknown>[] };
    expect(where.OR).toHaveLength(3);
    expect(Object.keys(where.OR[0] ?? {})).toEqual(["number"]);
    expect(Object.keys(where.OR[1] ?? {})).toEqual(["customer"]);
    expect(Object.keys(where.OR[2] ?? {})).toEqual(["seller"]);
  });

  it("busca documento do cliente so quando o termo tem digito", () => {
    const semDigito = filtroBusca("Joao") as { OR: Record<string, unknown>[] };
    expect(semDigito.OR).toHaveLength(3);

    // Com digito, os dois campos de documento entram. Um termo sem digito
    // viraria `{ cpf: { contains: "" } }`, e `contains` vazio traz a lista
    // inteira: a tela pareceria estar filtrando sem estar.
    const comDigito = filtroBusca("Joao 11") as { OR: Record<string, unknown>[] };
    expect(comDigito.OR).toHaveLength(5);
  });

  it("mantem modo insensivel no numero", () => {
    const where = filtroBusca("V-001") as { OR: { number?: { mode?: string } }[] };
    expect(where.OR[0]?.number?.mode).toBe("insensitive");
  });
});

describe("vendas/saldoDaVenda", () => {
  it("subtrai em Decimal, sem erro de centavo", () => {
    // Em `number`, 0.1 + 0.2 !== 0.3, e a diferenca apareceria como "falta
    // R$ 0,01" numa venda de mil reais — exatamente o tipo de divergencia que
    // faz a pessoa desconfiar do sistema inteiro.
    const total = "1000.00";
    const recebido = "700.35";
    expect(saldoDaVenda(total, recebido).toFixed(2)).toBe("299.65");
  });

  it("devolve zero quando esta quitada, e nao -0", () => {
    expect(saldoDaVenda("50.00", "50.00").isZero()).toBe(true);
  });

  it("aceita o total como number, Decimal ou string", () => {
    const esperado = "10.50";
    expect(saldoDaVenda(10.5, 0).toFixed(2)).toBe(esperado);
    expect(saldoDaVenda("10.50", "0").toFixed(2)).toBe(esperado);
  });
});

describe("vendas/situacao", () => {
  it("aceita 'todas' e os valores do enum", () => {
    expect(ehSituacao("todas")).toBe(true);
    expect(ehSituacao("CONFIRMADA")).toBe(true);
    expect(ehSituacao("CANCELADA")).toBe(true);
  });

  it("rejeita valor que nao existe no enum", () => {
    // `?situacao=qualquer` vem da URL. Sem esta validacao, o cast para
    // `SaleStatus` passaria um texto invalido ao Prisma e a consulta estouraria
    // com erro de banco, em vez de mostrar a lista sem filtro.
    expect(ehSituacao("qualquer")).toBe(false);
    expect(ehSituacao("")).toBe(false);
    expect(ehSituacao("confirmada")).toBe(false);
  });

  it("da rotulo a todos os status do enum, sem vazamento", () => {
    for (const status of Object.values(SaleStatus)) {
      expect(rotuloDaSituacao(status)).not.toBe(status);
      expect(rotuloDaSituacao(status).length).toBeGreaterThan(0);
    }
  });
});

describe("vendas/tomDaSituacao", () => {
  it("separa situacao que exige acao de situacao normal", () => {
    expect(tomDaSituacao("RASCUNHO")).toBe("atencao");
    expect(tomDaSituacao("PENDENTE")).toBe("atencao");
    expect(tomDaSituacao("CONFIRMADA")).toBe("ok");
  });

  it("marca cancelada e devolvida como perigo, nao como neutro", () => {
    // Sao as duas unicas situacoes em que o total NAO e receita. Somar a lista
    // sem olhar a cor somaria dinheiro que nao entrou.
    expect(tomDaSituacao("CANCELADA")).toBe("perigo");
    expect(tomDaSituacao("DEVOLVIDA")).toBe("perigo");
    expect(tomDaSituacao("PARCIALMENTE_DEVOLVIDA")).toBe("info");
  });
});
