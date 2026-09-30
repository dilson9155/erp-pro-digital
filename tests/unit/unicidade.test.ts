import { describe, expect, it } from "vitest";

import { decidirUnicidade, mesmoNome } from "@/server/app/unicidade";
import { schemaCategoria } from "@/server/app/categorias/schema";
import { schemaMarca } from "@/server/app/marcas/schema";

/**
 * Testes de unicidade com exclusao logica.
 *
 * Este arquivo existe por causa de um bug concreto, nao por cobertura. A primeira
 * versao de `unidades/queries.ts` filtrava `deletedAt: null` ao procurar nome
 * duplicado — o jeito "limpo" de escrever a query. O efeito era que apagar "KG"
 * e tentar recadastrar "KG" falhava com `P2002` do banco: a consulta dizia que
 * nao havia conflito, a action tentava criar, e o indice unico recusava porque
 * a linha excluida continuava la.
 *
 * Um teste de integration pegaria isso. Um teste unitario pega mais rapido e sem
 * banco, porque a DECISAO ("criar", "restaurar" ou "duplicado") e uma funcao
 * pura — e o que a torna isolada e testavel.
 */
describe("server/app/unicidade", () => {
  const linhaViva = { id: "u1", deletedAt: null, active: true };
  const linhaExcluida = { id: "u2", deletedAt: new Date("2026-01-01"), active: false };

  describe("decidirUnicidade", () => {
    it("cria quando nao existe linha com o mesmo nome", () => {
      expect(decidirUnicidade(null)).toEqual({ tipo: "criar" });
    });

    it("recusa quando existe linha VIVA com o mesmo nome", () => {
      // Duplicidade de verdade: a pessoa digitou um nome que ja existe, e o
      // caminho e a mensagem no campo.
      expect(decidirUnicidade(linhaViva)).toEqual({ tipo: "duplicado" });
    });

    it("restaura quando existe linha EXCLUIDA com o mesmo nome", () => {
      // O caso que o bug de `deletedAt` quebrava. Restaurar e o unico caminho que
      // respeita o indice unico e mantem o `id` — e o `id` que produto referencia.
      expect(decidirUnicidade(linhaExcluida)).toEqual({ tipo: "restaurar", id: "u2" });
    });

    it("trata linha excluida mas ainda ativa como excluida", () => {
      // `active: true` com `deletedAt` preenchido nao acontece pelas actions, mas
      // pode acontecer por edicao direta. A decisao olha `deletedAt`, que e a
      // fonte da verdade da exclusao logica.
      const inconsistente = { id: "u3", deletedAt: new Date(), active: true };
      expect(decidirUnicidade(inconsistente).tipo).toBe("restaurar");
    });
  });

  describe("mesmoNome", () => {
    it("ignora caixa", () => {
      // O `@@unique` do schema e sensivel a caixa, entao sem esta comparacao
      // "KG" e "kg" seriam duas linhas — e o preco do produto apareceria com a
      // unidade errada num dos dois casos.
      expect(mesmoNome("KG", "kg")).toBe(true);
      expect(mesmoNome("  KG  ", "kg")).toBe(true);
    });

    it("distingue nomes diferentes", () => {
      expect(mesmoNome("kg", "g")).toBe(false);
      expect(mesmoNome("cx", "CX12")).toBe(false);
    });

    it("nao confunde vazio com igual", () => {
      // `mesmoNome("", "")` e `true`, e e por isso que a query chama retorna
      // `null` ANTES de comparar quando o nome esta vazio: sem esse guarda, um
      // cadastro sem nome "colidiria" com outro cadastro sem nome.
      expect(mesmoNome("", "")).toBe(true);
    });
  });
});

describe("schemaCategoria", () => {
  const base = { nome: "Bebidas", casasDecimais: 0 };

  it("aceita categoria sem pai (raiz)", () => {
    const resultado = schemaCategoria.safeParse({ ...base, categoriaPaiId: "" });
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.categoriaPaiId).toBeNull();
  });

  it("aceita categoria com pai por id", () => {
    const resultado = schemaCategoria.safeParse({ ...base, categoriaPaiId: "cat_123" });
    expect(resultado.success).toBe(true);
  });

  it("transforma codigo vazio em null", () => {
    // A coluna e nullable e `""` e `NULL` separam em filtro (`IS NULL` vs `= ''`).
    const resultado = schemaCategoria.safeParse({ ...base, codigo: "  " });
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.codigo).toBeNull();
  });

  it("recusa nome de 1 caractere", () => {
    const resultado = schemaCategoria.safeParse({ nome: "A" });
    expect(resultado.success).toBe(false);
  });

  it("recusa ordem negativa", () => {
    // A ordem define a sequencia de exibicao; valor negativo nao tem significado
    // e faria a categoria aparecer antes de tudo sem explicacao.
    const resultado = schemaCategoria.safeParse({ ...base, ordem: "-1" });
    expect(resultado.success).toBe(false);
  });

  it("aceita ordem 0, que e o padrao de categoria raiz", () => {
    const resultado = schemaCategoria.safeParse({ ...base, ordem: "0" });
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.ordem).toBe(0);
  });

  it("trata checkbox vazio como false, e nao como erro", () => {
    const resultado = schemaCategoria.safeParse({ ...base, ativo: "" });
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.ativo).toBe(false);
  });
});

describe("schemaMarca", () => {
  it("aceita marca so com nome", () => {
    // O caso comum: empresa cadastra 40 marcas e nao usa codigo nem logo.
    const resultado = schemaMarca.safeParse({ nome: "Bosch" });
    expect(resultado.success).toBe(true);
  });

  it("recusa URL sem esquema http", () => {
    // Sem esquema, a URL relativa resolveria contra o proprio dominio e a
    // imagem viria de um caminho qualquer do sistema.
    const resultado = schemaMarca.safeParse({ nome: "Bosch", logoUrl: "/logos/bosch.png" });
    expect(resultado.success).toBe(false);
  });

  it("recusa esquema que nao seja http", () => {
    // `javascript:` em `src` nao executa em `<img>` nos navegadores atuais, mas
    // o valor circula em exportacao e e-mail. A revisao de seguranca de um ERP
    // nao deve aceitar esquema livre.
    const resultado = schemaMarca.safeParse({ nome: "Bosch", logoUrl: "javascript:alert(1)" });
    expect(resultado.success).toBe(false);
  });

  it("aceita https", () => {
    const resultado = schemaMarca.safeParse({
      nome: "Bosch",
      logoUrl: "https://cdn.exemplo.com.br/bosch.png",
    });
    expect(resultado.success).toBe(true);
  });

  it("trata logoUrl vazia como null", () => {
    const resultado = schemaMarca.safeParse({ nome: "Bosch", logoUrl: "" });
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.logoUrl).toBeNull();
  });
});
