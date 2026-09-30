import { describe, expect, it } from "vitest";

import {
  ehFiltroEstoque,
  FILTROS_ESTOQUE,
  filtroBusca,
  filtroDeEstoque,
} from "@/server/app/produtos/queries";

/**
 * A listagem de produto tem uma propriedade que nenhuma outra tem: o filtro de
 * estoque, que precisa conviver com a busca por texto.
 *
 * O erro de construcao aqui e somar os dois em um `OR` so. "Somente esgotados"
 * viraria `OR: [{ currentStock: { lte: 0 } }, { name: contains(...) }]`, e o
 * resultado seria o oposto do pedido: todo produto cujo nome contem a letra
 * digitada, mais os esgotados. A tela responderia "esgotados" e listaria itens
 * com estoque cheio. Estes testes travam os dois filtros como intersecao.
 */
describe("produtos/queries: filtros", () => {
  describe("ehFiltroEstoque", () => {
    it("aceita os filtros declarados", () => {
      for (const filtro of Object.values(FILTROS_ESTOQUE)) {
        expect(ehFiltroEstoque(filtro)).toBe(true);
      }
    });

    it("rejeita valor vindo da URL que nao existe", () => {
      // `searchParams` nao tem tipo. Um link antigo, uma digitacao na barra de
      // endereco ou um `?estoque=barato`Resultaria em `undefined` se o filtro
      // fosse usado direto, e o `switch` cairia no caso default — que e `todos`.
      // Funcionaria por acidente. Rejeitar explicitamente mantem o default
      // visivel no codigo.
      expect(ehFiltroEstoque("barato")).toBe(false);
      expect(ehFiltroEstoque("")).toBe(false);
    });
  });

  describe("filtroDeEstoque", () => {
    it("todos nao restringe nada", () => {
      // `{}` e o que o `where` recebe quando nao ha filtro: sem chave, o
      // Prisma nao adiciona condicao nenhuma.
      expect(filtroDeEstoque(FILTROS_ESTOQUE.todos)).toEqual({});
    });

    it("esgotado inclui zero e negativo", () => {
      // `lte: 0` e nao `lt: 0`: um produto com saldo exatamente zero esta
      // esgotado. Com `lt`, ele sumiria do filtro que existe justamente para
      // achar o que precisa ser comprado.
      expect(filtroDeEstoque(FILTROS_ESTOQUE.esgotado)).toEqual({ currentStock: { lte: 0 } });
    });

    it("negativo exclui zero", () => {
      expect(filtroDeEstoque(FILTROS_ESTOQUE.negativo)).toEqual({ currentStock: { lt: 0 } });
    });

    it("nao filtra por coluna contra coluna", () => {
      // `currentStock < minStock` e a comparacao que a tela de quem compra
      // quer, e ela NAO e expressivel no `where` tipado do Prisma: o filtro
      // aceita coluna contra constante. A solucao correta e coluna gerada no
      // Postgres ou view, que e migracao — e por isso o filtro nao esta aqui.
      const filtros = Object.values(FILTROS_ESTOQUE).map(filtroDeEstoque);
      const algumComMinStock = filtros.some((f) => Object.keys(f).some((k) => k === "minStock"));
      expect(algumComMinStock).toBe(false);
    });
  });

  describe("filtroBusca", () => {
    it("busca vazia nao restringe", () => {
      expect(filtroBusca("")).toEqual({});
      expect(filtroBusca("   ")).toEqual({});
    });

    it("cobre nome, SKU e codigo de barras", () => {
      // Quem cadastra produto procura por qualquer um dos tres: pela etiqueta
      // colada no balcao, pelo nome que digitou. Sem o SKU, buscar "12345" nao
      // acha o item cujo codigo interno e 12345.
      const filtro = filtroBusca("12345");
      expect("OR" in filtro && filtro.OR).toHaveLength(4);
    });

    it("ignora caixa do termo", () => {
      // `mode: "insensitive"` resolve o ILIKE do Postgres. Comparar em caixa
      // alta no aplicativo traria o produto inteiro para a memoria.
      const filtro = filtroBusca("cabo");
      expect("OR" in filtro).toBe(true);
      // Sem o `!`, o `toHaveLength` seguinte ja e a checagem: o acesso direto a
      // `filtro.OR` nao compila porque `filtroBusca` devolve `{} | { OR: ... }`.
      const condicoes = "OR" in filtro ? filtro.OR ?? [] : [];
      expect(condicoes).toHaveLength(4);
      for (const condicao of condicoes) {
        const alvo = Object.values(condicao)[0];
        if (typeof alvo === "object" && alvo && "contains" in alvo) {
          expect(alvo.mode).toBe("insensitive");
        }
      }
    });
  });

  /**
   * A composicao do `where` e feita no `listarProdutos`, e nao exportada para
   * teste porque depende do `withTenantDb`. Este teste documenta a regra sem
   * duplicar a implementacao: os dois filtros precisam conviver, e a unica forma
   * de isso acontecer e o spread de dois objetos distintos, nunca um `OR` unico.
   */
  describe("composicao", () => {
    it("texto e estoque sao aplicados em conjunto", () => {
      const busca = filtroBusca("cabo");
      const estoque = filtroDeEstoque(FILTROS_ESTOQUE.esgotado);
      const where = { deletedAt: null, ...busca, ...estoque };
      // `OR` (da busca) e `currentStock` (do estoque) coexistem: e a
      // interseccao. Um `OR` unico seria a uniao, que e o bug.
      expect(where).toHaveProperty("OR");
      expect(where).toHaveProperty("currentStock");
      expect(where).toHaveProperty("deletedAt", null);
    });

    it("os filtros nunca se sobrescrevem por ordem de spread", () => {
      // `filtroBusca` devolve `{ OR: [...] }` e `filtroDeEstoque` devolve
      // `{ currentStock: ... }`: chaves disjuntas, entao a ordem nao importa.
      // Se algum dia os dois passarem a usar a mesma chave, este teste falha.
      const um = filtroBusca("x");
      const dois = filtroDeEstoque(FILTROS_ESTOQUE.esgotado);
      expect(Object.keys(um)[0]).not.toBe(Object.keys(dois)[0]);
    });
  });
});
