import type { Prisma } from "@/generated/prisma/client";
import type { Product } from "@/generated/prisma/client";

import { withTenantDb } from "@/server/db/scoped";
import type { TenantScope } from "@/server/db/tenant-scope";
import { opcoesCategoria } from "@/server/app/categorias/queries";
import { opcoesMarca } from "@/server/app/marcas/queries";
import { opcoesUnidade } from "@/server/app/unidades/queries";

/**
 * Consultas de produto.
 *
 * DIFERENCAS EM RELACAO AOS OUTROS CADASTROS
 *
 * 1. O `select` da listagem NAO usa `include` de categoria/marca/unidade, e sim
 *    `select` aninhado. Incluir traria o objeto inteiro das tres tabelas para
 *    renderizar tres palavras; o `select` aninhado traz so o necessario.
 *
 * 2. A listagem tem DOIS filtros de grupo, e nao um `OR` so: quem filtra por
 *    "esgotado" nao esta buscando texto, e quem busca texto nao esta filtrando
 *    estoque. Um `OR` misturado devolveria produto esgotado cujo nome contem o
 *    termo, que e o oposto do que a pessoa pediu.
 *
 * 3. `lineDeMesmoSku` recebe o SKU ja normalizado. A comparacao ignora caixa
 *    porque o `@@unique([tenantId, sku])` do Postgres e sensivel a caixa — mas o
 *    schema faz `.toUpperCase()`, entao "abc" nunca chega gravado em minuscula.
 *    A busca e feita mesmo assim para o caso de dado anterior a essa regra.
 */

export interface ProdutoListagem {
  readonly id: string;
  readonly sku: string;
  readonly nome: string;
  readonly barcode: string | null;
  readonly type: Product["type"];
  readonly unitPrice: Product["unitPrice"];
  readonly currentStock: Product["currentStock"];
  readonly minStock: Product["minStock"];
  readonly active: boolean;
  readonly unidade: { readonly nome: string; readonly casasDecimais: number };
  readonly categoria: { readonly id: string; readonly nome: string } | null;
  readonly marca: { readonly id: string; readonly nome: string } | null;
}

export interface ListagemProdutos {
  readonly produtos: readonly ProdutoListagem[];
  readonly total: number;
  readonly pagina: number;
  readonly totalPaginas: number;
  readonly busca: string;
  readonly filtroEstoque: FiltroEstoque;
}

export const TAMANHO_PAGINA = 50;

/**
 * Filtros de situacao de estoque.
 *
 * `esgotado` e `negativo` sao os dois implementaveis com filtro tipado do
 * Prisma, porque comparam `currentStock` com uma CONSTANTE.
 *
 * "ABAIXO DO MINIMO" (`currentStock < minStock`) NAO esta aqui, e a ausencia e
 * deliberada. A comparacao e entre duas COLUNAS da mesma linha, e o Prisma nao
 * a expressa: o `where` tipado so aceita coluna contra constante. As tres
 * saidas possíveis foram avaliadas e as tres sao piores que a ausencia:
 *
 * 1. `minStock: { gt: 0 }` e o que parece funcionar, e esta errado. Filtra
 *    produtos que TEM minimo configurado, nao produtos que estao abaixo dele.
 *    As duas listas se parecem, a segunda e maior, e o erro e silencioso: a tela
 *    funciona e mostra resultado plausivel.
 * 2. Comparar no aplicativo exige trazer a pagina inteira e filtrar depois, o
 *    que quebra a paginacao: a pagina 2 comeca onde a 1 parou antes do filtro.
 * 3. `$queryRaw` resolve, e ai que mora o problema. A extensao de tenant
 *    (`tenant-guard.ts`) injeta `tenantId` em toda query; uma query raw nao
 *    passa por ela, e o filtro de tenant passa a ser responsabilidade de quem
 *    escreve a linha. E o tipo de codigo que, copiado mais tarde para outro
 *    lugar, vaza dados de outra empresa.
 *
 * A solucao correta e no schema, nao na query: coluna gerada no Postgres
 * (`GENERATED ALWAYS AS (current_stock < min_stock) STORED`) com indice, ou uma
 * view. Ambas sao migracao, entao a decisao fica para quem decide o schema.
 */
export const FILTROS_ESTOQUE = {
  todos: "todos",
  esgotado: "esgotado",
  negativo: "negativo",
} as const;

export type FiltroEstoque = (typeof FILTROS_ESTOQUE)[keyof typeof FILTROS_ESTOQUE];

export function ehFiltroEstoque(valor: string): valor is FiltroEstoque {
  return Object.values(FILTROS_ESTOQUE).some((f) => f === valor);
}

export function filtroBusca(busca: string) {
  const termo = busca.trim();
  if (termo === "") return {};
  return {
    OR: [
      { name: { contains: termo, mode: "insensitive" as const } },
      { sku: { contains: termo, mode: "insensitive" as const } },
      { barcode: { contains: termo, mode: "insensitive" as const } },
      { description: { contains: termo, mode: "insensitive" as const } },
    ],
  };
}
/**
 * `currentStock` e `Decimal`, e o filtro passa um numero: o Prisma converte e o
 * Postgres compara numericamente. `Decimal` nao e necessario no filtro porque o
 * valor comparado e constante, e nao o conteudo da coluna.
 *
 * Exportada para teste. E a unica funcao pura da listagem — nao toca em banco e
 * devolve um objeto — e por isso e a que carrega o teste. `listarProdutos`
 * precisa de `TenantScope` e de Postgres, entao um teste dela exigiria banco de
 * verdade; esta aqui trava a parte em que o erro e silencioso, que e a
 * combinacao dos filtros.
 */
export function filtroDeEstoque(filtro: FiltroEstoque): Prisma.ProductWhereInput {
  switch (filtro) {
    case "esgotado":
      return { currentStock: { lte: 0 } };
    case "negativo":
      return { currentStock: { lt: 0 } };
    case "todos":
    default:
      return {};
  }
}

export async function listarProdutos(
  scope: TenantScope,
  entrada: {
    busca?: string;
    pagina?: number;
    incluirInativos?: boolean;
    estoque?: FiltroEstoque;
  } = {},
): Promise<ListagemProdutos> {
  const busca = entrada.busca?.trim() ?? "";
  const pagina = Math.max(1, entrada.pagina ?? 1);
  const estoque = entrada.estoque ?? FILTROS_ESTOQUE.todos;
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(entrada.incluirInativos ? {} : { active: true }),
    ...filtroBusca(busca),
    ...filtroDeEstoque(estoque),
  };

  return withTenantDb(scope, async (db) => {
    const [produtos, total] = await Promise.all([
      db.product.findMany({
        where,
        // Ativo primeiro, depois por nome. `totalStock` vem depois do nome de
        // proposito: a lista e de consulta por nome, e ordenar por saldo
        // embaralharia o resultado a cada movimentacao de estoque.
        orderBy: [{ active: "desc" }, { name: "asc" }],
        skip: (pagina - 1) * TAMANHO_PAGINA,
        take: TAMANHO_PAGINA,
        select: {
          id: true,
          sku: true,
          name: true,
          barcode: true,
          type: true,
          unitPrice: true,
          currentStock: true,
          minStock: true,
          active: true,
          unit: { select: { name: true, decimalPlaces: true } },
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
        },
      }),
      db.product.count({ where }),
    ]);

    return {
      produtos: produtos.map((p) => ({
        id: p.id,
        sku: p.sku,
        nome: p.name,
        barcode: p.barcode,
        type: p.type,
        unitPrice: p.unitPrice,
        currentStock: p.currentStock,
        minStock: p.minStock,
        active: p.active,
        unidade: { nome: p.unit.name, casasDecimais: p.unit.decimalPlaces },
        categoria: p.category ? { id: p.category.id, nome: p.category.name } : null,
        marca: p.brand ? { id: p.brand.id, nome: p.brand.name } : null,
      })),
      total,
      pagina,
      totalPaginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)),
      busca,
      filtroEstoque: estoque,
    };
  });
}

/**
 * Leitura para a tela de edicao, COM a unidade junto.
 *
 * O `include` da unidade nao e conveniência: a tela mostra o saldo com a
 * unidade escrita ao lado ("0,5 kg"), e sem ela o numero aparece solto. Buscar
 * a unidade em uma segunda query funcionaria, e custaria um round trip a cada
 * abertura de tela por causa de um dado que a linha de produto ja referencia.
 */
export async function buscarProduto(
  scope: TenantScope,
  id: string,
): Promise<(Product & { readonly unit: { readonly name: string; readonly decimalPlaces: number } }) | null> {
  return withTenantDb(scope, (db) =>
    db.product.findFirst({
      where: { id, deletedAt: null },
      include: { unit: { select: { name: true, decimalPlaces: true } } },
    }),
  );
}

/**
 * Linha com o MESMO SKU, com ou sem `deletedAt`.
 *
 * Sem filtro de `deletedAt`: e a linha excluida que precisa ser restaurada,
 * porque continua ocupando o `@@unique([tenantId, sku])`. Ver
 * `server/app/unicidade.ts`.
 */
export async function linhaDeMesmoSku(
  scope: TenantScope,
  sku: string,
  ignorarId?: string,
): Promise<{ id: string; deletedAt: Date | null; active: boolean } | null> {
  const alvo = sku.trim().toUpperCase();
  if (alvo === "") return null;

  return withTenantDb(scope, async (db) => {
    const candidatas = await db.product.findMany({
      where: ignorarId ? { id: { not: ignorarId } } : {},
      select: { id: true, sku: true, deletedAt: true, active: true },
    });
    return candidatas.find((p) => p.sku.trim().toUpperCase() === alvo) ?? null;
  });
}

/**
 * Opcoes para os `<select>` do formulario de produto.
 *
 * Todas com `incluirInativas: true`, e o motivo e o mesmo dos outros modulos:
 * produto antigo pode ter categoria desativada, e o formulario de edicao precisa
 * mostrar o valor atual em vez de um select vazio que sugere dado perdido.
 */
export async function opcoesProduto(
  scope: TenantScope,
): Promise<{
  readonly categorias: readonly { readonly value: string; readonly rotulo: string }[];
  readonly marcas: readonly { readonly value: string; readonly rotulo: string }[];
  readonly unidades: readonly { readonly value: string; readonly rotulo: string }[];
}> {
  const [categorias, marcas, unidades] = await Promise.all([
    opcoesCategoria(scope, { incluirInativas: true }),
    opcoesMarca(scope, { incluirInativas: true }),
    opcoesUnidade(scope, { incluirInativas: true }),
  ]);
  return { categorias, marcas, unidades };
}
