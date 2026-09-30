import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";

import { ProductOrigin, ProductType, StockNegativeBehavior } from "@/generated/prisma/enums";
import { decimalParaCampo, zDinheiro, zOpcional, zPercentual, zQuantidadeOuZero } from "@/lib/zod-dinheiro";
import { schemaProduto } from "@/server/app/produtos/schema";

/**
 * O centro deste arquivo e o `precoVenda`.
 *
 * `z.coerce.number()` em "1.234,56" devolve `NaN` — e `NaN` passa por
 * `gte(0)`, porque toda comparacao com `NaN` e `false`, o que faz o `.refine`
 * devolver `true` e o `NaN` seguir para o Prisma. O preco gravado seria o que o
 * `NaN.toString()` produz, e a venda sairia por esse valor. Estes testes existem
 * para travar a conversao, nao a forma do schema.
 */
describe("lib/zod-dinheiro", () => {
  describe("zDinheiro", () => {
    it("converte formato brasileiro com ponto de milhar", () => {
      const r = zDinheiro.safeParse("1.234,56");
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data.toString()).toBe("1234.56");
    });

    it("converte valor sem separador de milhar", () => {
      const r = zDinheiro.safeParse("1234,56");
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data.toString()).toBe("1234.56");
    });

    it("preserva as 4 casas que o Decimal(14,4) aceita", () => {
      // Kilo vendido a R$ 12,3456: arredondar para 12,35 no cadastro perde 4
      // centavos por kilo, e o erro cresce com a quantidade.
      const r = zDinheiro.safeParse("12,3456");
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data.toString()).toBe("12.3456");
    });

    it("inteiro sem virgula decimal", () => {
      const r = zDinheiro.safeParse("50");
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data.toString()).toBe("50");
    });

    it("zero e valido", () => {
      // "0" e o preco de um item de/internal ou produto sem margem. Precisa
      // passar: o `.refine(>= 0)` do schemaProduto nao pode rejeitar.
      const r = zDinheiro.safeParse("0");
      expect(r.success).toBe(true);
    });

    it("rejeita texto sem digitos", () => {
      expect(zDinheiro.safeParse("abc").success).toBe(false);
    });

    it("rejeita vazio", () => {
      // Vazio em preco e erro, nao zero. Um produto de graca e uma decisao
      // consciente; produto sem preco preenchido e um cadastro incompleto.
      expect(zDinheiro.safeParse("").success).toBe(false);
      expect(zDinheiro.safeParse("   ").success).toBe(false);
    });

    it("rejeita milhar sem centavos como 1.234", () => {
      // Ambiguo: "1.234" pode ser mil e duzentos e trinta e quatro, ou o
      // numero "1.234" que alguem digitou por engano. Rejeitar e mais seguro
      // que adivinhar um preco.
      expect(zDinheiro.safeParse("1.234").success).toBe(false);
    });
  });

  describe("zOpcional", () => {
    const base = zPercentual;

    it('vazio vira null, e nao 0', () => {
      // A distincao que o comentario do arquivo descreve: `null` = "nao
      // informado", `0` = "isento". collapsing os dois declara isencao fiscal
      // que ninguem pediu.
      const r = zOpcional(base).safeParse("");
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data).toBeNull();
    });

    it("ausente vira null", () => {
      const r = zOpcional(base).safeParse(undefined);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data).toBeNull();
    });

    it("valor presente e preservado", () => {
      const r = zOpcional(base).safeParse("35,5");
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect((r.data as Decimal).toString()).toBe("35.5");
    });
  });

  describe("zQuantidadeOuZero", () => {
    it("vazio vira Decimal zero, nao null", () => {
      // Aqui o contrario vale: estoque minimo vazio e "sem controle de estoque", que
      // e zero. E o que o `<input>` vazio significa para quem cadastra.
      const r = zQuantidadeOuZero.safeParse("");
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data.toString()).toBe("0");
    });

    it("valor presente e preservado", () => {
      const r = zQuantidadeOuZero.safeParse("2,5");
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data.toString()).toBe("2.5");
    });
  });

  describe("zPercentual", () => {
    it("rejeita acima de 100", () => {
      expect(zPercentual.safeParse("120").success).toBe(false);
    });

    it("aceita 100", () => {
      expect(zPercentual.safeParse("100").success).toBe(true);
    });

    it("rejeita negativo", () => {
      expect(zPercentual.safeParse("-5").success).toBe(false);
    });
  });

  describe("decimalParaCampo", () => {
    it("usa virgula decimal para o campo", () => {
      expect(decimalParaCampo(new Decimal("1234.56"))).toBe("1234,56");
    });

    it("nao arredonda para 2 casas", () => {
      // Se arredondasse, editar um produto de kilo exibiria 12,35 e salvar
      // mudaria o preco sem ninguem ter digitado nada.
      expect(decimalParaCampo(new Decimal("12.3456"))).toBe("12,3456");
    });

    it("null vira string vazia", () => {
      expect(decimalParaCampo(null)).toBe("");
      expect(decimalParaCampo(undefined)).toBe("");
    });
  });
});

describe("schemaProduto", () => {
  const minimo = {
    sku: "sku-001",
    nome: "Cabo HDMI 2m",
    unidadeId: "un_1",
    precoVenda: "39,90",
  };

  it("aceita o cadastro minimo: sku, nome, unidade e preco", () => {
    const r = schemaProduto.safeParse(minimo);
    // O segundo argumento do `expect` so aparece se o primeiro falhar, e mostra
    // o caminho do campo culpado. Sem ele, uma falha aqui diz so "expected true".
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues, null, 2)).toBe(true);
    if (!r.success) return;
    expect(r.data.tipo).toBe(ProductType.MERCADORIA);
    expect(r.data.ativo).toBe(true);
    expect(r.data.estoqueMinimo.toString()).toBe("0");
  });

  it("normaliza sku para maiusculas", () => {
    // `@@unique([tenantId, sku])` e sensivel a caixa no Postgres. Sem isso,
    // "abc" e "ABC" seriam dois produtos, e o segundo nao seria detectado como
    // duplicado pelo indice.
    const r = schemaProduto.safeParse({ ...minimo, sku: "sku-abc" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.sku).toBe("SKU-ABC");
  });

    it("rejeita barcode com espacos", () => {
      // A coluna guarda "apenas digitos"; "789 1000318" viraria 12 caracteres e a
      // bipagem pararia de casar.
      const r = schemaProduto.safeParse({ ...minimo, barcode: "789 1000318" });
      expect(r.success).toBe(false);
    });

  it("rejeita barcode com menos de 8 digitos", () => {
    expect(schemaProduto.safeParse({ ...minimo, barcode: "12345" }).success).toBe(false);
  });

  it("normaliza barcode vazio para null", () => {
    const r = schemaProduto.safeParse({ ...minimo, barcode: "" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.barcode).toBeNull();
  });

  it("exige unidade de medida", () => {
    const r = schemaProduto.safeParse({ ...minimo, unidadeId: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita preco negativo", () => {
    const r = schemaProduto.safeParse({ ...minimo, precoVenda: "-1" });
    expect(r.success).toBe(false);
  });

  it("usa os enums reais do Prisma em tipo e comportamento", () => {
    // Trava contra a regressao que motivou o arquivo: a primeira versao
    // escrevia `["MERCADORIA","SERVICO","COMBO"]` e `["BLOQUEAR","PERMITIR","AJUSTAR"]`
    // a mao. `COMBO` e `PERMITIR` nao existem no schema.prisma, e um
    // `z.enum` escrito a mao aceitaria os dois — o erro so apareceria em runtime,
    // no primeiro produto cadastrado com o valor errado.
    const r = schemaProduto.safeParse({
      ...minimo,
      tipo: "COMBO",
      comportamentoNegativo: "PERMITIR",
    });
    expect(r.success).toBe(false);

    const ok = schemaProduto.safeParse({
      ...minimo,
      tipo: ProductType.COMPOSTO,
      comportamentoNegativo: StockNegativeBehavior.PERMITIR_NEGATIVO,
    });
    expect(ok.success).toBe(true);
    if (!ok.success) return;
    expect(ok.data.comportamentoNegativo).toBe(StockNegativeBehavior.PERMITIR_NEGATIVO);
  });

  it("aceita as origens do enum e rejeita as invented", () => {
    const ok = schemaProduto.safeParse({ ...minimo, origem: ProductOrigin.ESTRANGEIRA_IMPORTACAO_DIRETA });
    expect(ok.success).toBe(true);

    const r = schemaProduto.safeParse({ ...minimo, origem: "IMPORTACAO_DIRETA" });
    expect(r.success).toBe(false);
  });

  it("rejeita NCM com numero de digitos errado", () => {
    expect(schemaProduto.safeParse({ ...minimo, ncmCode: "123" }).success).toBe(false);
    const ok = schemaProduto.safeParse({ ...minimo, ncmCode: "8471.30.00" });
    expect(ok.success).toBe(true);
  });

  it("deixa ncm vazio como null, porque nem toda empresa emite NFe", () => {
    const r = schemaProduto.safeParse({ ...minimo, ncmCode: "" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.ncmCode).toBeNull();
  });

  it("trata aliquota st vazia como 0", () => {
    const r = schemaProduto.safeParse({ ...minimo, aliquotaSt: "" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.aliquotaSt).toBe(0);
  });

  it("rejeita aliquota st acima de 4", () => {
    // `icmsStFraction` e o fracionario: 0 = 1 inteiro, ate 4 digitos. Acima
    // disso o calculo de ICMS ST nao tem interpretacao.
    expect(schemaProduto.safeParse({ ...minimo, aliquotaSt: "5" }).success).toBe(false);
  });

  it("converte os tres checks de rastreio", () => {
    const r = schemaProduto.safeParse({ ...minimo, rastrearLote: "on", rastrearSerie: "on" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.rastrearLote).toBe(true);
    expect(r.data.rastrearSerie).toBe(true);
    expect(r.data.rastrearValidade).toBe(false);
  });

  it("traca checkbox vazio como false, e nao como erro", () => {
    const r = schemaProduto.safeParse({ ...minimo, ativo: "", permitirNegativo: "" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.ativo).toBe(false);
    expect(r.data.permitirNegativo).toBe(false);
  });
});
