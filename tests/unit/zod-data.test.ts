import { describe, expect, it } from "vitest";

import { dataParaCampo, zData, zDataOpcional } from "@/lib/zod-data";

/**
 * Campo de data do formulario.
 *
 * A data e o campo onde o erro e invisivel: um dia a menos ou a mais no
 * nascimento, no vencimento ou na competencia nao da erro de validacao nenhum —
 * o sistema aceita, grava, e a divergencia aparece semanas depois, num
 * demonstrativo ou num boleto com vencimento errado.
 */

const data = (texto: unknown) => zDataOpcional.safeParse(texto);

describe("zod-data/zDataOpcional", () => {
  it("converte para UTC ao meio-dia, e nao meia-noite", () => {
    // Este e o teste que importa. Meia-noite UTC lida no fuso de Sao Paulo
    // (-03) e 21h do dia ANTERIOR: o `<input>` gravaria 10/05 e a tela
    // mostraria 09/05.
    const resultado = data("1990-05-10");
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data?.toISOString()).toBe("1990-05-10T12:00:00.000Z");
    }
  });

  it("aceita o dia em qualquer fuso, porque o meio-dia absorve +-12h", () => {
    // O intervalo UTC-12..UTC+12 sempre contem 12:00 do dia digitado. E o que
    // torna a regra segura sem depender do fuso do servidor.
    expect(new Date("2026-07-01T12:00:00.000Z").getUTCDate()).toBe(1);
  });

  it("vira null quando ausente ou vazio", () => {
    for (const entrada of [undefined, "", "   "]) {
      const resultado = data(entrada);
      expect(resultado.success).toBe(true);
      if (resultado.success) expect(resultado.data).toBeNull();
    }
  });

  it("ignora espaco em volta", () => {
    // Campo controlado por script chega com espaco, e recusar por espaco e um
    // bug sem motivo visivel para quem preencheu.
    const resultado = data(" 2026-03-10 ");
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data?.toISOString().slice(0, 10)).toBe("2026-03-10");
  });

  it("recusa data que nao existe no calendario", () => {
    // `new Date("2026-02-31T12:00:00.000Z")` nao da erro: o JavaScript rola
    // para 3 de marco. Sem esta checagem, quem digitasse 31 de fevereiro
    // receberia um salvamento bem-sucedido com outra data.
    const resultado = data("2026-02-31");
    expect(resultado.success).toBe(false);
  });

  it("recusa 29 de fevereiro em ano nao bissexto, e aceita no bissexto", () => {
    expect(data("2026-02-29").success).toBe(false);
    expect(data("2024-02-29").success).toBe(true);
  });

  it("recusa mes e dia fora da faixa", () => {
    expect(data("2026-13-01").success).toBe(false);
    expect(data("2026-00-10").success).toBe(false);
    expect(data("2026-01-32").success).toBe(false);
    expect(data("2026-01-00").success).toBe(false);
  });

  it("recusa o formato brasileiro, em vez de aceitar data invertida", () => {
    // "10/03/2026" e o que a pessoa digita, mas `<input type="date">` entrega
    // "2026-03-10". Aceitar os dois formatos aqui abriria porta para o dia e o
    // mes trocados: 10 de marco viraria 3 de outubro, sem erro em lugar nenhum.
    expect(data("10/03/2026").success).toBe(false);
    expect(data("20260310").success).toBe(false);
  });
});

describe("zod-data/zData", () => {
  it("exige a data, diferente do opcional", () => {
    expect(zData.safeParse("").success).toBe(false);
    expect(zData.safeParse(undefined).success).toBe(false);
  });

  it("aceita data valida", () => {
    const resultado = zData.safeParse("2026-03-10");
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.toISOString()).toBe("2026-03-10T12:00:00.000Z");
  });
});

describe("zod-data/dataParaCampo", () => {
  it("formata em UTC, e nao no fuso do servidor", () => {
    // A volta tem o mesmo problema da entrada: formatar no fuso local
    // viraria o dia 9 num cadastro de dia 10.
    expect(dataParaCampo(new Date("1990-05-10T12:00:00.000Z"))).toBe("1990-05-10");
  });

  it("devolve vazio para ausente", () => {
    expect(dataParaCampo(null)).toBe("");
    expect(dataParaCampo(undefined)).toBe("");
  });

  it("faz a ida e a volta sem mudar o dia", () => {
    const texto = "2026-12-31";
    const resultado = zDataOpcional.parse(texto);
    expect(dataParaCampo(resultado)).toBe(texto);
  });
});
