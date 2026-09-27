import { describe, expect, it } from "vitest";
import {
  ACOES,
  ChavePermissaoInvalida,
  ehAcao,
  chavePermissao,
  permissaoCobreAcao,
  type PedidoPermissao,
} from "@/lib/rbac/permissions";

const venda: PedidoPermissao = { modulo: "VENDAS", recurso: "venda", acao: "read" };

describe("ehAcao", () => {
  it("aceita as sete acoes canonicas", () => {
    for (const acao of ACOES) {
      expect(ehAcao(acao)).toBe(true);
    }
  });

  it("recusa acao fora do conjunto", () => {
    // A falha importante: um `acao: "delete!"` ou `"Delete"` (maiuscula) num
    // ponto de chamada nao pode ser tratado como valido.
    for (const invalida of ["Delete", "DELETE", "read ", "", "listar", "create "]) {
      expect(ehAcao(invalida)).toBe(false);
    }
  });
});

describe("chavePermissao", () => {
  it("monta a chave canonica modulo.recurso.acao", () => {
    expect(chavePermissao(venda)).toBe("VENDAS.venda.read");
    expect(chavePermissao({ modulo: "ESTOQUE", recurso: "produto", acao: "create" })).toBe(
      "ESTOQUE.produto.create",
    );
  });

  it("lanca em modulo vazio", () => {
    expect(() => chavePermissao({ ...venda, modulo: "" })).toThrow(ChavePermissaoInvalida);
    expect(() => chavePermissao({ ...venda, modulo: "   " })).toThrow(ChavePermissaoInvalida);
  });

  it("lanca em recurso vazio", () => {
    expect(() => chavePermissao({ ...venda, recurso: "" })).toThrow(ChavePermissaoInvalida);
  });

  it("lanca em acao fora do conjunto, listando as validas", () => {
    // A mensagem tem que ajudar a achar o erro: um throw generico aqui vira
    // "por que o botao sumiu" no console, sem pista do valor errado.
    expect(() => chavePermissao({ ...venda, acao: "remover" as never })).toThrow(
      /acao "remover" fora do conjunto/,
    );
    try {
      chavePermissao({ ...venda, acao: "remover" as never });
      expect.unreachable("deveria ter lancado");
    } catch (erro) {
      expect((erro as Error).message).toContain("create");
      expect((erro as Error).message).toContain("export");
    }
  });

  it("e um erro de nome estavel, para quem quiser filtrar por tipo", () => {
    const erro = new ChavePermissaoInvalida("teste");
    expect(erro.name).toBe("ChavePermissaoInvalida");
    expect(erro).toBeInstanceOf(Error);
  });
});

describe("permissaoCobreAcao", () => {
  const permissao = { key: "VENDAS.venda", actions: ["create", "read", "update"] };

  it("cobre quando modulo.recurso bate e a acao esta no array", () => {
    expect(permissaoCobreAcao(permissao, venda)).toBe(true);
    expect(
      permissaoCobreAcao(permissao, { modulo: "VENDAS", recurso: "venda", acao: "create" }),
    ).toBe(true);
  });

  it("nao cobre quando a acao nao esta no array", () => {
    // Acao nao listada e negada, mesmo com a chave certa. Este e o teste que
    // impede que "delete" apareca por um array mal preenchido no seed.
    expect(permissaoCobreAcao(permissao, { modulo: "VENDAS", recurso: "venda", acao: "delete" })).toBe(
      false,
    );
    expect(permissaoCobreAcao(permissao, { modulo: "VENDAS", recurso: "venda", acao: "export" })).toBe(
      false,
    );
  });

  it("nao cobre quando a chave e de outro recurso", () => {
    expect(
      permissaoCobreAcao(permissao, { modulo: "VENDAS", recurso: "orcamento", acao: "read" }),
    ).toBe(false);
  });

  it("nao cobre quando o modulo e outro, mesmo com recurso e acao iguais", () => {
    // `ESTOQUE.venda.read` nao casa com `VENDAS.venda`. A chave e comparada
    // inteira, e nao so o recurso.
    expect(
      permissaoCobreAcao(permissao, { modulo: "ESTOQUE", recurso: "venda", acao: "read" }),
    ).toBe(false);
  });

  it("trata prefixo de recurso como recurso diferente", () => {
    // Cuidado classico: `startsWith` deixaria "vendas" casar com "venda".
    // Aqui a comparacao e por igualdade, entao nao casa.
    expect(
      permissaoCobreAcao(permissao, { modulo: "VENDAS", recurso: "vendas", acao: "read" }),
    ).toBe(false);
  });
});
