import { describe, expect, it } from "vitest";

import { FILTROS_SALDO, ehFiltroSaldo, filtroBusca, filtroDeSaldo } from "@/server/app/clientes/queries";

/**
 * `filtroBusca` e `filtroDeSaldo` sao as unicas funcoes puras da listagem: nao
 * tocam em banco e devolvem objeto, entao sao testaveis sem Postgres.
 *
 * O erro que estas funcoes precisam travar e o SILENCIOSO. Um `where` mal
 * montado devolve lista vazia — a tela funciona, mostra "nada encontrado", e
 * ninguem desconfia do filtro. Por isso os testes verificam a ESTRUTURA do
 * `where`, e nao apenas que a funcao nao lanca.
 */

/** Extrai as colunas consultadas no ramo `OR`, para as assercoes. */
function colunasDoOr(where: ReturnType<typeof filtroBusca>): string[] {
  const or = where.OR;
  if (!or) return [];
  return or.map((condicao) => Object.keys(condicao)[0] ?? "");
}

describe("clientes/queries: filtroBusca", () => {
  it("nao filtra quando o termo e vazio", () => {
    // Um `{ OR: [{ name: { contains: "" } }] }` trazia TODOS os clientes com
    // "contains vazio" — comportamento diferente entre o Postgres e o que a
    // pessoa espera de "sem busca", e a lista ficava lenta sem filtro nenhum.
    expect(filtroBusca("")).toEqual({});
    expect(filtroBusca("   ")).toEqual({});
  });

  it("busca por nome, nome fantasia e email sem digito", () => {
    const where = filtroBusca("maria");
    expect(colunasDoOr(where)).toEqual(["name", "tradeName", "email"]);
  });

  it("inclui documento e telefone quando o termo tem digito", () => {
    const where = filtroBusca("111");
    expect(colunasDoOr(where)).toContain("cpf");
    expect(colunasDoOr(where)).toContain("cnpj");
    expect(colunasDoOr(where)).toContain("phone");
    expect(colunasDoOr(where)).toContain("whatsapp");
    expect(colunasDoOr(where)).toContain("zipCode");
  });

  it("busca documento com os digitos do termo, e nao o termo cru", () => {
    // A coluna guarda SO digitos. `{ cpf: { contains: "111.444.777-06" } }`
    // nao encontraria nada, e a pessoa veria "nada encontrado" depois de digitar
    // o CPF exatamente como esta no papel.
    const where = filtroBusca("111.444.777-06") as {
      OR: { cpf?: { contains: string } }[];
    };
    const cpf = where.OR.find((c) => c.cpf)?.cpf;
    expect(cpf?.contains).toBe("11144477706");
  });

  it("NAO busca documento quando o termo nao tem digito", () => {
    // Regressao. "Joao" virava `{ cpf: { contains: "1" } }` quando o termo
    // tinha qualquer caractere nao numerico junto, e trazia quem tem CPF
    // começando com 1 junto com o Joao procurado. A lista ficava maior e
    // enganosa, sem erro visivel.
    const where = filtroBusca("Joao da Silva");
    expect(colunasDoOr(where)).not.toContain("cpf");
    expect(colunasDoOr(where)).not.toContain("cnpj");
    expect(colunasDoOr(where)).not.toContain("phone");
  });

  it("busca por digitos puros tambem funciona como busca de texto", () => {
    // Um CPF digitado sem mascara e "11144477706": o nome nao casa, mas o
    // documento casa. Se as condicoes de texto fossem removidas quando ha
    // digito, a busca por telefone deixaria de funcionar.
    const where = filtroBusca("11144477706");
    expect(colunasDoOr(where)).toContain("name");
    expect(colunasDoOr(where)).toContain("cpf");
  });

  it("mantem a busca textual em modo insensivel a caixa", () => {
    // Sem `mode: "insensitive"`, "MARIA" nao encontraria "Maria" — e a coluna
    // esta com collation do Postgres, que diferencia caixa.
    const where = filtroBusca("MARIA") as { OR: { name?: { mode?: string } }[] };
    expect(where.OR[0]?.name?.mode).toBe("insensitive");
  });
});

describe("clientes/queries: filtroDeSaldo", () => {
  it("todos nao restringe nada", () => {
    expect(filtroDeSaldo(FILTROS_SALDO.todos)).toEqual({});
  });

  it("com saldo filtra totalDebt positivo", () => {
    // Compara coluna com CONSTANTE, que e o que o `where` do Prisma expressa.
    // O `@@index([tenantId, totalDebt])` do schema existe para este filtro.
    expect(filtroDeSaldo(FILTROS_SALDO.comSaldo)).toEqual({ totalDebt: { gt: 0 } });
  });

  it("ehFiltroSaldo aceita so os filtros do catalogo", () => {
    // Query string vem da URL, e o parametro `saldo` aceita qualquer texto. Sem
    // esta checagem, `?saldo=qualquer` entraria no `where` e o filtro viraria
    // um `{ [texto]: ... }` que o Prisma rejeita com erro de tipo em runtime.
    expect(ehFiltroSaldo("todos")).toBe(true);
    expect(ehFiltroSaldo("com_saldo")).toBe(true);
    expect(ehFiltroSaldo("comSaldo")).toBe(false);
    expect(ehFiltroSaldo("")).toBe(false);
    expect(ehFiltroSaldo("qualquer")).toBe(false);
  });
});
