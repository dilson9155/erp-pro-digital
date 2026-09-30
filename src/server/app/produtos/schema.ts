import { z } from "zod";

import { ProductOrigin, ProductType, StockNegativeBehavior } from "@/generated/prisma/enums";
import { zCheck, zDinheiro, zOpcional, zPercentual, zQuantidade, zQuantidadeOuZero } from "@/lib/zod-dinheiro";

/**
 * Schema do formulario de produto.
 *
 * O MODELO TEM QUARENTA COLUNAS. ESTE SCHEMA TEM VINTE.
 *
 * As vinte que faltam sao deliberadas, e a divisao importa mais que o numero:
 *
 * - `averageCost`, `totalStock`, `currentStock`, `reservedStock`: sao
 *   DERIVADOS. Custos sao atualizados por job a cada entrada; saldo e soma de
 *   `StockItem`. Um campo de formulario para eles seria um campo que a pessoa
 *   preenche e o sistema sobrescreve — e o pior tipo de campo que existe, porque
 *   o valor digitado some sem aviso.
 * - `salesCount`, `totalRevenue`: sao cache de leitura para ordenar produto por
 *   venda. Sao de `update` por job.
 * - `retailPrice`, `wholesalePrice`: existem no schema e NAO SAO LIDOS por
 *   nenhum model. Quem usa preco na venda e `Product.unitPrice`, copiado para
 *   `SaleItem.unitPrice` no momento do faturamento. Escrever os dois deixaria
 *   dois precos divergentes na tela, sem nenhum consumidor — o pior resultado
 *   possivel para quem cadastra: qual dos dois e o que vale? A decisao de
 *  ligar os dois e de produto, e fica para quando o modulo de venda existir.
 * - `branchId`: produto e global da empresa, com saldo por filial. Cadastrar
 *   "esto existe na loja X" e o caminho mais curto para estoque negativo.
 * - `ncmId` / `ncmCode`: o `Ncm` e tabela de dominio, alimentada por importacao
 *   oficial. O campo aceita o codigo como texto, e a validao contra a tabela
 *   acontece no modulo fiscal.
 *
 * OS QUE FICARAM
 *
 * Identificacao (sku, barcode, nome, tipo, categoria, marca, unidade),
 * preco (unitPrice, margem alvo, estoque minimo/maximo, permitir negativo),
 * medidas e rastreio, e o bloco fiscal. O bloco fiscal e opcional por escolha:
 * uma empresa que ainda nao emite NFe nao deve ser obrigada a saber NCM para
 * cadastrar um produto, entao `ncmCode` e `icmsTaxCode` sao texto livre validado
 * por formato, e o resto do bloco aceita vazio.
 */
export const schemaProduto = z.object({
  sku: z
    .string({ error: "Informe o codigo interno (SKU)" })
    .trim()
    .min(1, "Informe o codigo interno (SKU)")
    .max(60, "Use no maximo 60 caracteres")
    .transform((valor) => valor.toUpperCase()),
  barcode: z
    .string()
    .trim()
    // So digitos. O schema grava "apenas digitos para nao ter variacoes por tipo
    // de codigo" (comentario do proprio schema.prisma), entao deixar a pessoa
    // digitar "789 1000 3188" gravaria 12 digitos com espacos e o preco de
    // bipagem deixaria de casar.
    .refine((valor) => valor === "" || /^\d{8,14}$/.test(valor), {
      error: "Codigo de barras deve ter de 8 a 14 digitos, so numeros",
    })
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  nome: z
    .string({ error: "Informe o nome do produto" })
    .trim()
    .min(2, "Use pelo menos 2 caracteres")
    .max(200, "Use no maximo 200 caracteres"),
  descricao: z
    .string()
    .trim()
    .max(1000, "Use no maximo 1000 caracteres")
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  // O enum vem de `generated/prisma/enums`, nao de uma union escrita a mao. Uma
  // union nao compila contra o tipo do Prisma: se o `schema.prisma` ganhar um
  // valor novo, o `z.enum` escrito a mao aceitaria o valor e o Prisma recusaria
  // em runtime, com um erro que so apareceria ao cadastrar o primeiro produto do
  // tipo novo. Importando, o erro vira de compilacao.
  tipo: z.enum(ProductType).default(ProductType.MERCADORIA),
  categoriaId: z
    .string()
    .trim()
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  marcaId: z
    .string()
    .trim()
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  // UNICA relacao obrigatoria. `Product.unitId` e `NOT NULL` e o
  // `onDelete: Restrict` diz que produto impede apagar unidade em uso. Sem
  // unidade, o item nao tem quantidade nem preco unitario — e nao existe.
  unidadeId: z
    .string({ error: "Informe a unidade de medida" })
    .trim()
    .min(1, "Informe a unidade de medida"),

  // ---- Preco ---------------------------------------------------------------
  // `unitPrice` e o preco que a venda usa. `Decimal(14,4)`, entao aceita ate 4
  // casas: e o que permite vender kilo a R$ 12,3456 sem arredondar no cadastro e
  // perder o resto na venda.
  precoVenda: zDinheiro.refine((valor) => valor.gte(0), {
    error: "Informe um valor maior ou igual a zero",
  }),
  margemAlvoPercent: zOpcional(zPercentual),
  // `minStock` e `maxStock` sao `Decimal @default(0)`, ou seja, NAO-NULAVEIS no
  // schema. Entao os dois usam `zQuantidadeOuZero`, e 0 significa "sem controle".
  // A primeira versao deste arquivo tratava `estoqueMaximo` como opcional e
  // devolvia `null`; o Prisma recusou com "Type 'null' is not assignable", o
  // que e a forma do compilador dizer que a coluna nao aceita nulo. A leitura
  // certa do schema e que 0 e o valor legitimo — e o proprio banco ja usa 0
  // como padrao.
  estoqueMinimo: zQuantidadeOuZero,
  estoqueMaximo: zQuantidadeOuZero,
  // `false` quando ausente: estoque negativo e excecao, nao padrao.
  permitirNegativo: zCheck(false),
  comportamentoNegativo: z.enum(StockNegativeBehavior).default(StockNegativeBehavior.BLOQUEAR),

  // ---- Medidas -------------------------------------------------------------
  pesoKg: zOpcional(zQuantidade),
  comprimentoM: zOpcional(zQuantidade),
  larguraM: zOpcional(zQuantidade),
  alturaM: zOpcional(zQuantidade),

  // ---- Rastreio -----------------------------------------------------------
  // Checks e nao selects porque o controle e binario: ou o produto tem lote, ou
  // nao tem. Um `select` de "Nao / Lote / Lote e validade" criaria o caso
  // "lote sem validade" que o schema proibe com `trackExpiryDate`.
  // Todos com `false` como padrao: rastreio e opt-in, e um produto sem lote que
  // aparecesse com lote habilitado faria a entrada de mercadoria exigir campo
  // de validade que ninguem preencheu.
  rastrearLote: zCheck(false),
  rastrearSerie: zCheck(false),
  rastrearValidade: zCheck(false),

  // ---- Fiscal -------------------------------------------------------------
  // NCM tem 8 digitos, escritos de duas formas oficiais: "84713000" e
  // "8471.30.00" (a separacao 4.2.2 da tabela). As duas sao aceitas porque quem
  // consulta a tabela do IBGE usa a segunda e quem importa planilha usa a
  // primeira. A coluna e `VarChar(12)`, que comporta as duas.
  ncmCode: z
    .string()
    .trim()
    .refine((valor) => valor === "" || /^\d{8}$|^\d{4}\.\d{2}\.\d{2}$/.test(valor), {
      error: "NCM deve ter 8 digitos (ex.: 8471.30.00)",
    })
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  cestCode: z
    .string()
    .trim()
    .refine((valor) => valor === "" || /^\d{2}\.?\d{6}\.?\d$/.test(valor), {
      error: "CEST deve ter 7 digitos (ex.: 28.4100.00)",
    })
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  // As origens sao as do enum, e cada uma tem efeito em ICMS ST. `NACIONAL` e
  // o padrao porque e a grande maioria do cadastro; as demais so fazem sentido
  // para empresa que importa ou produz com regime especial.
  origem: zOpcional(z.enum(ProductOrigin)),
  icmsTaxCode: z
    .string()
    .trim()
    .max(20, "Use no maximo 20 caracteres")
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  tributacaoFederalPercent: zOpcional(zPercentual),
  importacaoPercent: zOpcional(zPercentual),
  icmsStMvaPercent: zOpcional(zPercentual),
  aliquotaSt: z.coerce
    .number()
    .int("Use um numero inteiro")
    .min(0, "Minimo 0")
    .max(4, "Maximo 4, o fracionario tem de 0 a 4 digitos")
    .default(0),

  // `true` quando ausente: e o que o `Product.active` tem no banco, e um
  // produto novo que nasce inativo some da venda sem ninguem perceber o motivo.
  ativo: zCheck(true),
});

export type DadosProduto = z.infer<typeof schemaProduto>;
