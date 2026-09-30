import { describe, expect, it } from "vitest";

import { valorDoFiltro } from "@/lib/querystring";

/**
 * Este util existe por causa de um bug que passou por quatro telas de listagem
 * (marcas, clientes, fornecedores, produtos) e por typecheck, lint e mais de
 * trezentos testes.
 *
 * O toggle de "inativos" montava o link com `mudancas.inativos ?? atual`. Para
 * DESLIGAR o filtro, o link passava `inativos: undefined` — e `undefined` e
 * exatamente o valor que `??` trata como "nao informado", devolvendo o valor
 * atual. O link saia com `?inativos=1` e o botao "Ocultando inativos" nao
 * ocultava nada: funcionava so para ligar.
 *
 * Nenhum teste automatizado de tela teria pego isso, porque a pagina respondia
 * 200 com a lista errada. Por isso o teste e do helper, e nao da pagina.
 */
describe("querystring/valorDoFiltro", () => {
  it("mantem o valor atual quando a chave nao foi mencionada", () => {
    // Este e o caso da paginacao: o link `{ pagina: "2" }` nao fala nada sobre
    // inativos, entao o que esta na URL precisa continuar valendo.
    expect(valorDoFiltro({ pagina: "2" }, "inativos", "1")).toBe("1");
    expect(valorDoFiltro({}, "inativos", "1")).toBe("1");
    expect(valorDoFiltro({ pagina: "2" }, "inativos", undefined)).toBeUndefined();
  });

  it("DESLIGA quando a chave foi mencionada sem valor", () => {
    // Este e o caso do toggle. Passar a chave com `undefined` e um pedido
    // explicito para tirar o filtro da URL, e nao uma omissao.
    expect(valorDoFiltro({ inativos: undefined }, "inativos", "1")).toBeUndefined();
  });

  it("liga quando a chave foi mencionada com o valor", () => {
    expect(valorDoFiltro({ inativos: "1" }, "inativos", undefined)).toBe("1");
  });

  it("diferencia chave ausente de chave presente e vazia", () => {
    expect(valorDoFiltro({ inativos: "" }, "inativos", "1")).toBe("");
    expect(valorDoFiltro({}, "inativos", "1")).toBe("1");
  });

  it("funciona com uma chave que existe no objeto mas nunca foi passada", () => {
    // `Object.create({ inativos: undefined })` tem a chave sem valor, mas
    // `hasOwnProperty` nao a ve. Confirma que a funcao nao esta lendo o
    // prototipo por acidente.
    const herdado = Object.create({ inativos: undefined }) as Record<string, string | undefined>;
    expect(valorDoFiltro(herdado, "inativos", "1")).toBe("1");
  });

  it("nao depende da ordem das chaves", () => {
    const agora = "1";
    const desligando = valorDoFiltro({ pagina: "1", inativos: undefined }, "inativos", agora);
    const ligando = valorDoFiltro({ inativos: "1", pagina: "1" }, "inativos", undefined);
    expect(desligando).toBeUndefined();
    expect(ligando).toBe("1");
  });
});
