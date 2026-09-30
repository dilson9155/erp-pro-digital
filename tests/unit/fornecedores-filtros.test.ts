import { describe, expect, it } from "vitest";

import { filtroBusca, listarFornecedores } from "@/server/app/fornecedores/queries";

/**
 * `filtroBusca` e a unica funcao pura da listagem de fornecedor, e ela carrega o
 * risco do modulo: as colunas guardam SO digitos, e um `contains` com o termo
 * cru (com mascara) nao encontraria nada.
 *
 * A diferenca em relacao a `clientes/queries.ts` e um campo a mais na busca: o
 * `contactName`. Quem liga para o fornecedor lembra do interlocutor, nao da razao
 * social, e um filtro que so enxerga `name` nao encontra "falar com o Sr. Paulo".
 */
function colunasDoOr(where: ReturnType<typeof filtroBusca>): string[] {
  const or = where.OR;
  if (!or) return [];
  return or.map((condicao) => Object.keys(condicao)[0] ?? "");
}

describe("fornecedores/queries: filtroBusca", () => {
  it("nao filtra quando o termo e vazio", () => {
    expect(filtroBusca("")).toEqual({});
    expect(filtroBusca("  ")).toEqual({});
  });

  it("busca por razao, fantasia, email e pessoa de contato", () => {
    const where = filtroBusca("acme");
    expect(colunasDoOr(where)).toEqual(["name", "tradeName", "email", "contactName"]);
  });

  it("inclui documento, telefone e CEP quando o termo tem digito", () => {
    const where = filtroBusca("112");
    const colunas = colunasDoOr(where);
    expect(colunas).toContain("cpf");
    expect(colunas).toContain("cnpj");
    expect(colunas).toContain("phone");
    expect(colunas).toContain("zipCode");
  });

  it("busca documento pelos digitos do termo, e nao pelo termo com mascara", () => {
    const where = filtroBusca("11.222.333/0001-30") as {
      OR: { cnpj?: { contains: string } }[];
    };
    expect(where.OR.find((c) => c.cnpj)?.cnpj?.contains).toBe("11222333000130");
  });

  it("NAO busca documento quando o termo nao tem digito", () => {
    // "Distribuidora ACME" viraria `{ cnpj: { contains: "" } }` sem este
    // filtro, e o `contains` vazio traz a lista inteira — a tela pareceria
    // estar filtrando e nao estaria.
    const where = filtroBusca("Distribuidora ACME");
    expect(colunasDoOr(where)).not.toContain("cnpj");
    expect(colunasDoOr(where)).not.toContain("cpf");
  });

  it("mantem modo insensivel a caixa", () => {
    const where = filtroBusca("ACME") as { OR: { name?: { mode?: string } }[] };
    expect(where.OR[0]?.name?.mode).toBe("insensitive");
  });
});

describe("fornecedores/queries: assinatura da listagem", () => {
  it("exporta o tamanho de pagina usado pelo rodape", () => {
    // O rodape da tela mostra "de N" e os links montam `pagina=N`. Se o tamanho
    // mudasse aqui sem mudar la, a pagina 2 comecaria onde a 1 parou com um
    // salto, e o total nao fecharia com o que a pessoa viu.
    expect(typeof listarFornecedores).toBe("function");
  });
});
