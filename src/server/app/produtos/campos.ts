import { ProductOrigin, ProductType, StockNegativeBehavior } from "@/generated/prisma/enums";
import type { Product } from "@/generated/prisma/client";
import type { CampoSpec } from "@/components/formulario";
import { decimalParaCampo } from "@/lib/zod-dinheiro";

import type { ProdutoListagem } from "./queries";

/**
 * Spec dos campos de produto.
 *
 * `secao` e a diferenca em relacao aos outros cadastros: o modelo tem ~40
 * colunas, e sem agrupamento o preco de venda — que e o que quem cadastra vem
 * buscar — fica soterrado entre NCM e lote.
 *
 * A ordem dentro de cada secao e a ordem de leitura, nao a ordem do schema.
 */

/**
 * Rotulo de `Product.type` para exibicao.
 *
 * Vive no modulo do servidor, e a pagina de listagem importa daqui em vez de
 * montar o `Record` com o enum gerado. A razao nao e Hofstede: `enums.ts` fica
 * bloqueado por regra de lint para paginas (`no-restricted-imports`), porque
 * puxar o Prisma Client para uma pagina expoe o client no bundle do navegador.
 */
export const ROTULO_TIPO: Record<string, string> = {
  [ProductType.MERCADORIA]: "Mercadoria",
  [ProductType.SERVICO]: "Servico",
  [ProductType.COMPOSTO]: "Composto",
};

export function camposProduto(
  opcoes: {
    readonly categorias: readonly { readonly value: string; readonly rotulo: string }[];
    readonly marcas: readonly { readonly value: string; readonly rotulo: string }[];
    readonly unidades: readonly { readonly value: string; readonly rotulo: string }[];
  },
): readonly CampoSpec[] {
  return [
    // ---- Identificacao ----------------------------------------------------
    {
      tipo: "texto",
      nome: "sku",
      rotulo: "Codigo interno (SKU)",
      obrigatorio: true,
      maxLength: 60,
      autoComplete: "off",
      secao: "Identificacao",
      ajudaSecao: "Codigo unico do produto na empresa. E o que a venda e o relatorio usam.",
      ajuda: "Letras e numeros. Sera convertido para maiusculas.",
    },
    {
      tipo: "texto",
      nome: "barcode",
      rotulo: "Codigo de barras",
      maxLength: 20,
      secao: "Identificacao",
      ajuda: "So digitos, de 8 a 14. Deixe vazio se o produto nao tem codigo de barras.",
    },
    {
      tipo: "texto",
      nome: "nome",
      rotulo: "Nome",
      obrigatorio: true,
      maxLength: 200,
      secao: "Identificacao",
    },
    {
      nome: "descricao",
      rotulo: "Descricao",
      tipo: "area",
      rows: 3,
      maxLength: 1000,
      secao: "Identificacao",
      ajuda: "Uso interno. Nao aparece na nota fiscal.",
    },
    {
      nome: "tipo",
      rotulo: "Tipo",
      tipo: "select",
      secao: "Identificacao",
      opcoes: [
        { value: ProductType.MERCADORIA, rotulo: "Mercadoria" },
        { value: ProductType.SERVICO, rotulo: "Servico" },
        { value: ProductType.COMPOSTO, rotulo: "Composto" },
      ],
    },
    {
      nome: "categoriaId",
      rotulo: "Categoria",
      tipo: "select",
      placeholder: "Sem categoria",
      secao: "Identificacao",
      opcoes: opcoes.categorias,
      ajuda: "Opcional. Serve para agrupar em relatorios e na listagem.",
    },
    {
      nome: "marcaId",
      rotulo: "Marca",
      tipo: "select",
      placeholder: "Sem marca",
      secao: "Identificacao",
      opcoes: opcoes.marcas,
    },
    {
      nome: "unidadeId",
      rotulo: "Unidade de medida",
      tipo: "select",
      obrigatorio: true,
      secao: "Identificacao",
      opcoes: opcoes.unidades,
      // A unica relacao obrigatoria do formulario, e a explicacao fica no campo
      // em vez de na documentacao: e a unica coisa que impede o cadastro de
      // passar, e quem preenche precisa saber por que o campo trava.
      ajuda: "Obrigatorio. Sem unidade nao ha como calcular quantidade nem preco por item.",
    },

    // ---- Preco -------------------------------------------------------------
    {
      nome: "precoVenda",
      rotulo: "Preco de venda",
      tipo: "moeda",
      obrigatorio: true,
      secao: "Preco e estoque",
      ajudaSecao: "O preco de venda e o que a venda usa. Estoque e controlado a parte.",
      placeholder: "0,00",
      ajuda: "Preco unitario. Aceita ate 4 casas — use para kilo com preco fracionado.",
    },
    {
      nome: "margemAlvoPercent",
      rotulo: "Margem alvo (%)",
      tipo: "quantidade",
      secao: "Preco e estoque",
      placeholder: "35,0",
      ajuda: "Opcional. Politica comercial: nao altera o preco de venda.",
    },
    {
      nome: "estoqueMinimo",
      rotulo: "Estoque minimo",
      tipo: "quantidade",
      defaultValue: "0",
      secao: "Preco e estoque",
      ajuda: "Zero = sem controle. Saldo e alterado por entradas e vendas, nunca por aqui.",
    },
    {
      nome: "estoqueMaximo",
      rotulo: "Estoque maximo",
      tipo: "quantidade",
      defaultValue: "0",
      secao: "Preco e estoque",
      ajuda: "Zero = sem teto de reposicao.",
    },
    {
      nome: "permitirNegativo",
      rotulo: "Permitir estoque negativo",
      tipo: "checkbox",
      secao: "Preco e estoque",
      ajuda: "Desmarque para bloquear a venda quando o saldo for insuficiente.",
    },
    {
      nome: "comportamentoNegativo",
      rotulo: "Quando o saldo for negativo",
      tipo: "select",
      secao: "Preco e estoque",
      opcoes: [
        { value: StockNegativeBehavior.BLOQUEAR, rotulo: "Bloquear a venda" },
        { value: StockNegativeBehavior.ALERTAR, rotulo: "Alertar e deixar passar" },
        { value: StockNegativeBehavior.PERMITIR_NEGATIVO, rotulo: "Permitir sem alerta" },
      ],
    },

    // ---- Medidas -----------------------------------------------------------
    {
      nome: "pesoKg",
      rotulo: "Peso (kg)",
      tipo: "quantidade",
      secao: "Medidas",
      ajudaSecao: "Opcional. Usado no calculo de frete por peso e na cubagem.",
    },
    { nome: "comprimentoM", rotulo: "Comprimento (m)", tipo: "quantidade", secao: "Medidas" },
    { nome: "larguraM", rotulo: "Largura (m)", tipo: "quantidade", secao: "Medidas" },
    { nome: "alturaM", rotulo: "Altura (m)", tipo: "quantidade", secao: "Medidas" },

    // ---- Rastreio ----------------------------------------------------------
    {
      nome: "rastrearLote",
      rotulo: "Controlar lote",
      tipo: "checkbox",
      secao: "Rastreio",
      ajudaSecao: "Marque apenas o que a empresa realmente controla na entrada de mercadoria.",
    },
    { nome: "rastrearSerie", rotulo: "Controlar numero de serie", tipo: "checkbox", secao: "Rastreio" },
    { nome: "rastrearValidade", rotulo: "Controlar validade", tipo: "checkbox", secao: "Rastreio" },

    // ---- Fiscal ------------------------------------------------------------
    {
      tipo: "texto",
      nome: "ncmCode",
      rotulo: "NCM",
      maxLength: 12,
      secao: "Fiscal",
      ajudaSecao:
        "Opcional: quem ainda nao emite NFe nao precisa preencher. O contador define o codigo.",
      ajuda: "8 digitos, com ou sem pontos. Ex.: 8471.30.00",
    },
    {
      tipo: "texto",
      nome: "cestCode",
      rotulo: "CEST",
      maxLength: 10,
      secao: "Fiscal",
      ajuda: "7 digitos. Ex.: 28.4100.00",
    },
    {
      nome: "origem",
      rotulo: "Origem",
      tipo: "select",
      placeholder: "Nao informada",
      secao: "Fiscal",
      opcoes: [
        { value: ProductOrigin.NACIONAL, rotulo: "Nacional" },
        {
          value: ProductOrigin.NACIONAL_CI_SUPERIOR_40,
          rotulo: "Nacional,(contentor de importacao) ate 40%",
        },
        {
          value: ProductOrigin.NACIONAL_CI_SUPERIOR_70,
          rotulo: "Nacional, CI acima de 40% e ate 70%",
        },
        {
          value: ProductOrigin.NACIONAL_CI_INFERIOR_40,
          rotulo: "Nacional, CI acima de 70%",
        },
        {
          value: ProductOrigin.NACIONAL_PROCESSOS_PRODUTIVOS_BASICOS,
          rotulo: "Nacional, processos produtivos basicos",
        },
        {
          value: ProductOrigin.ESTRANGEIRA_IMPORTACAO_DIRETA,
          rotulo: "Estrangeira, importacao direta",
        },
        {
          value: ProductOrigin.ESTRANGEIRA_MERCADO_INTERNO,
          rotulo: "Estrangeira, mercado interno",
        },
        {
          value: ProductOrigin.ESTRANGEIRA_SEM_SIMILAR_NACIONAL,
          rotulo: "Estrangeira, sem similar nacional",
        },
        {
          value: ProductOrigin.ESTRANGEIRA_SEM_SIMILAR_MERCADO_INTERNO,
          rotulo: "Estrangeira, sem similar no mercado interno",
        },
      ],
    },
    {
      tipo: "texto",
      nome: "icmsTaxCode",
      rotulo: "CST / CSOSN",
      maxLength: 20,
      secao: "Fiscal",
      ajuda: "Varia por UF e por NCM. Deixe vazio se o contador ainda nao definiu.",
    },
    {
      nome: "tributacaoFederalPercent",
      rotulo: "Tributacao federal (%)",
      tipo: "quantidade",
      secao: "Fiscal",
      placeholder: "0,00",
      ajuda: "PIS/COFINS/IRPJ/CSLL/INSS. Vazio = nao informado, que nao e o mesmo que isento.",
    },
    { nome: "importacaoPercent", rotulo: "Imposto de importacao (%)", tipo: "quantidade", secao: "Fiscal" },
    {
      nome: "icmsStMvaPercent",
      rotulo: "MVA do ICMS ST (%)",
      tipo: "quantidade",
      secao: "Fiscal",
    },
    {
      nome: "aliquotaSt",
      rotulo: "Fracionario do ICMS ST",
      tipo: "numero",
      min: 0,
      max: 4,
      step: 1,
      defaultValue: "0",
      secao: "Fiscal",
      ajuda: "De 0 a 4. Zero significa 1 (sem fracionamento).",
    },

    // ---- Atividade ---------------------------------------------------------
    {
      nome: "ativo",
      rotulo: "Produto ativo",
      tipo: "checkbox",
      defaultValue: "on",
      secao: "Atividade",
      ajudaSecao: "Desmarque para esconder o produto da venda sem apagar o historico.",
    },
  ];
}

/**
 * Registro em edicao -> valores do formulario.
 *
 * Toda a conversao e o INVERSO de `valoresDe`, em `actions.ts`, e a
 * simetria importa: os dois precisam concordar sobre o formato do texto.
 *
 * `precoVenda` e as medidas sao `Decimal` no banco, e `decimalParaCampo` troca
 * o ponto por virgula. Sem essa troca, editar um produto mostraria "1234.56" e a
 * proxima submissao reprovaria no `PADRAO_NUMERO`.
 */
export function valoresDoProduto(produto: Product): Record<string, string> {
  return {
    sku: produto.sku,
    barcode: produto.barcode ?? "",
    nome: produto.name,
    descricao: produto.description ?? "",
    tipo: produto.type,
    categoriaId: produto.categoryId ?? "",
    marcaId: produto.brandId ?? "",
    unidadeId: produto.unitId,
    precoVenda: decimalParaCampo(produto.unitPrice),
    margemAlvoPercent: decimalParaCampo(produto.targetMarginPercent),
    estoqueMinimo: decimalParaCampo(produto.minStock),
    estoqueMaximo: decimalParaCampo(produto.maxStock),
    permitirNegativo: produto.allowNegativeStock ? "on" : "",
    comportamentoNegativo: produto.negativeStockBehavior,
    pesoKg: decimalParaCampo(produto.weightKg),
    comprimentoM: decimalParaCampo(produto.lengthM),
    larguraM: decimalParaCampo(produto.widthM),
    alturaM: decimalParaCampo(produto.heightM),
    rastrearLote: produto.trackBatch ? "on" : "",
    rastrearSerie: produto.trackSerialNumber ? "on" : "",
    rastrearValidade: produto.trackExpiryDate ? "on" : "",
    ncmCode: produto.ncmCode ?? "",
    cestCode: produto.cestCode ?? "",
    origem: produto.productOrigin ?? "",
    icmsTaxCode: produto.icmsTaxCode ?? "",
    tributacaoFederalPercent: decimalParaCampo(produto.nationalTaxPercent),
    importacaoPercent: decimalParaCampo(produto.importTaxPercent),
    icmsStMvaPercent: decimalParaCampo(produto.icmsStMvaPercent),
    aliquotaSt: String(produto.icmsStFraction),
    ativo: produto.active ? "on" : "",
  };
}

/**
 * Linha da listagem -> texto de saldo.
 *
 * A unidade vem junto porque o saldo SEM unidade e um numero que nao diz nada:
 * "0,5" e meia unidade de medida ou meia caixa, e quem le a lista precisa da
 * palavra junto. E o `casasDecimais` da unidade, e nao um `toFixed(2)` fixo —
 * esse ultimo arredondaria "0,125" para "0,13" e esconderia a terceira casa que
 * a unidade existe justamente para permitir.
 */
export function saldoFormatado(produto: ProdutoListagem): string {
  const casas = Math.min(4, Math.max(0, produto.unidade.casasDecimais));
  const texto = Number(produto.currentStock.toString()).toFixed(casas);
  return `${texto} ${produto.unidade.nome}`;
}
