import { withTenantDb } from "@/server/db/scoped";
import type { TenantScope } from "@/server/db/tenant-scope";
import type { Brand } from "@/generated/prisma/client";
import { mesmoNome } from "@/server/app/unicidade";

/**
 * Consultas de marca.
 *
 * Estruturalmente igual a `unidades/queries.ts`, com uma diferenca: a marca nao
 * tem `codigo` unico no schema (apenas `name`), entao a busca cobre nome e
 * codigo sem risco de colisao entre dois registros.
 */

export interface MarcaListagem {
  readonly id: string;
  readonly nome: string;
  readonly codigo: string | null;
  readonly logoUrl: string | null;
  readonly active: boolean;
  readonly totalProdutos: number;
}

export interface ListagemMarcas {
  readonly marcas: readonly MarcaListagem[];
  readonly total: number;
  readonly pagina: number;
  readonly totalPaginas: number;
  readonly busca: string;
}

export const TAMANHO_PAGINA = 50;

export function filtroBusca(busca: string) {
  const termo = busca.trim();
  if (termo === "") return {};
  return {
    OR: [
      { name: { contains: termo, mode: "insensitive" as const } },
      { code: { contains: termo, mode: "insensitive" as const } },
    ],
  };
}

export async function listarMarcas(
  scope: TenantScope,
  entrada: { busca?: string; pagina?: number; incluirInativas?: boolean } = {},
): Promise<ListagemMarcas> {
  const busca = entrada.busca?.trim() ?? "";
  const pagina = Math.max(1, entrada.pagina ?? 1);
  const where = {
    deletedAt: null,
    ...(entrada.incluirInativas ? {} : { active: true }),
    ...filtroBusca(busca),
  };

  return withTenantDb(scope, async (db) => {
    const [marcas, total] = await Promise.all([
      db.brand.findMany({
        where,
        orderBy: [{ active: "desc" }, { name: "asc" }],
        skip: (pagina - 1) * TAMANHO_PAGINA,
        take: TAMANHO_PAGINA,
        select: {
          id: true,
          name: true,
          code: true,
          logoUrl: true,
          active: true,
          _count: { select: { products: true } },
        },
      }),
      db.brand.count({ where }),
    ]);

    return {
      marcas: marcas.map((m) => ({
        id: m.id,
        nome: m.name,
        codigo: m.code,
        logoUrl: m.logoUrl,
        active: m.active,
        totalProdutos: m._count.products,
      })),
      total,
      pagina,
      totalPaginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)),
      busca,
    };
  });
}

export async function buscarMarca(scope: TenantScope, id: string): Promise<Brand | null> {
  return withTenantDb(scope, (db) => db.brand.findFirst({ where: { id, deletedAt: null } }));
}

/**
 * Linha com o MESMO nome, com ou sem `deletedAt`.
 *
 * Sem filtro de `deletedAt`: a linha excluida continua ocupando o indice unico e
 * precisa ser restaurada, nao ignorada. Ver `server/app/unicidade.ts`.
 */
export async function linhaDeMesmoNome(
  scope: TenantScope,
  nome: string,
  ignorarId?: string,
): Promise<{ id: string; deletedAt: Date | null; active: boolean } | null> {
  if (nome.trim() === "") return null;

  return withTenantDb(scope, async (db) => {
    const candidatas = await db.brand.findMany({
      where: ignorarId ? { id: { not: ignorarId } } : {},
      select: { id: true, name: true, deletedAt: true, active: true },
    });
    return candidatas.find((m) => mesmoNome(m.name, nome)) ?? null;
  });
}

export async function opcoesMarca(
  scope: TenantScope,
  entrada: { incluirInativas?: boolean } = {},
): Promise<readonly { readonly value: string; readonly rotulo: string }[]> {
  return withTenantDb(scope, async (db) => {
    const marcas = await db.brand.findMany({
      where: { deletedAt: null, ...(entrada.incluirInativas ? {} : { active: true }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    });
    return marcas.map((m) => ({
      value: m.id,
      rotulo: m.active ? m.name : `${m.name} (inativa)`,
    }));
  });
}
