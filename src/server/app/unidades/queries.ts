import { withTenantDb } from "@/server/db/scoped";
import type { TenantScope } from "@/server/db/tenant-scope";
import type { Unit } from "@/generated/prisma/client";

/**
 * Consultas de unidade de medida.
 *
 * Todas exigem `TenantScope` como PARAMETRO, e nao o obtem sozinhas. A razao e
 * verificacao: uma query que recebe o escopo nao tem como ser chamada sem ele,
 * enquanto uma que chama `obterContextoOperacao()` internamente esconde o
 * requisito do codigo que a chama — e o teste da query passaria a depender de
 * cookie e de sessao, em vez de um objeto de duas linhas.
 *
 * TODAS filtram `deletedAt: null`.
 *
 * A extensao de tenant (ver `tenant-guard.ts`) injeta `tenantId` sozinha, mas
 * `deletedAt` e um filtro de NEGOCIO, nao de seguranca: ele nao e automatizado, e
 * o motivo e que o campo serve a dois propositos diferentes. Excluir de verdade
 * quebraria o historico — `Product` guarda `unitId`, e um item de venda do mes
 * passado aponta para a unidade que estava em uso na epoca. A solucao de apagar
 * em definitivo deixaria a venda antiga sem simbolo de unidade, e o relatorio
 * "vendido por unidade" nao fecharia. Entao a exclusao e logica, e o filtro tem
 * de ser explicito em cada consulta.
 */

export interface UnidadeListagem {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly decimalPlaces: number;
  readonly active: boolean;
  /** Quantos produtos usam esta unidade. `null` quando a listagem nao contou. */
  readonly totalProdutos: number | null;
}

export interface ListagemUnidades {
  readonly unidades: readonly UnidadeListagem[];
  readonly total: number;
  readonly pagina: number;
  readonly totalPaginas: number;
  readonly busca: string;
}

/** Cadastros sao pequenos; paginar a partir de 51 nao justifica a query extra. */
export const TAMANHO_PAGINA = 50;

/**
 * `Prisma.contain` com `mode: "insensitive"`.
 *
 * Postgres resolve isso com `ILIKE`, que nao usa indice. Em um cadastro de 30
 * unidades e irrelevante; o dia que esta lista passar de alguns milhares, o
 * correto e trocar por busca com `pg_trgm`. A alternativa — buscar so por
 * `startsWith` — e mais rapida e pior para a pessoa, que digita "quilo" e nao
 * acha "kg" de jeito nenhum.
 */
export function filtroBusca(busca: string) {
  const termo = busca.trim();
  if (termo === "") return {};
  return {
    OR: [{ name: { contains: termo, mode: "insensitive" as const } },
      { description: { contains: termo, mode: "insensitive" as const } }],
  };
}

export async function listarUnidades(
  scope: TenantScope,
  entrada: { busca?: string; pagina?: number } = {},
): Promise<ListagemUnidades> {
  const busca = entrada.busca?.trim() ?? "";
  const pagina = Math.max(1, entrada.pagina ?? 1);
  const where = { deletedAt: null, ...filtroBusca(busca) };

  return withTenantDb(scope, async (db) => {
    const [unidades, total] = await Promise.all([
      db.unit.findMany({
        where,
        orderBy: [{ active: "desc" }, { name: "asc" }],
        skip: (pagina - 1) * TAMANHO_PAGINA,
        take: TAMANHO_PAGINA,
        select: {
          id: true,
          name: true,
          description: true,
          decimalPlaces: true,
          active: true,
          _count: { select: { products: true } },
        },
      }),
      db.unit.count({ where }),
    ]);

    return {
      unidades: unidades.map((u) => ({
        id: u.id,
        nome: u.name,
        descricao: u.description,
        decimalPlaces: u.decimalPlaces,
        active: u.active,
        totalProdutos: u._count.products,
      })),
      total,
      pagina,
      totalPaginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)),
      busca,
    };
  });
}

/** Leitura por id para a tela de edicao. `null` quando nao existe ou foi excluida. */
export async function buscarUnidade(scope: TenantScope, id: string): Promise<Unit | null> {
  return withTenantDb(scope, (db) => db.unit.findFirst({ where: { id, deletedAt: null } }));
}

/**
 * Linha com o MESMO simbolo, com ou sem `deletedAt`.
 *
 * O filtro NAO exclui `deletedAt`, e isso e deliberado: a linha excluida e
 * justamente a que precisa ser restaurada, porque continua ocupando o indice
 * unico. Filtrar aqui devolveria `null`, a action tentaria criar, e o banco
 * recusaria com `P2002`. Ver `server/app/unicidade.ts`.
 */
export async function linhaDeMesmoSimbolo(
  scope: TenantScope,
  nome: string,
  ignorarId?: string,
): Promise<{ id: string; deletedAt: Date | null; active: boolean } | null> {
  const alvo = nome.trim().toLowerCase();
  if (alvo === "") return null;

  return withTenantDb(scope, async (db) => {
    // `findMany` e nao `findFirst`: Postgres nao tem indice unico em `lower(name)`,
    // entao a comparacao acontece no aplicacao. Em um cadastro pequeno isso e
    // irrelevante, e o resultado e sempre uma linha.
    const candidatas = await db.unit.findMany({
      where: ignorarId ? { id: { not: ignorarId } } : {},
      select: { id: true, deletedAt: true, active: true, name: true },
    });
    const achada = candidatas.find((u) => u.name.trim().toLowerCase() === alvo);
    return achada ?? null;
  });
}

/**
 * Opcoes para o `<select>` de produtos.
 *
 * Separado de `listarUnidades` porque temDUAS diferencas que importam: nao
 * pagina (o select precisa de todas, e um produto nunca tem mais que algumas
 * dezenas de unidades), e inclui as inativas quando `incluirInativas` e true.
 * Uma unidade desativada continua precisam ser escolhida para produto ja
 * cadastrado — sem isso, editar um produto antigo ficaria sem unidade valida.
 */
export async function opcoesUnidade(
  scope: TenantScope,
  entrada: { incluirInativas?: boolean } = {},
): Promise<readonly { readonly value: string; readonly rotulo: string }[]> {
  return withTenantDb(scope, async (db) => {
    const unidades = await db.unit.findMany({
      where: {
        deletedAt: null,
        ...(entrada.incluirInativas ? {} : { active: true }),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    });
    return unidades.map((u) => ({
      value: u.id,
      rotulo: u.active ? u.name : `${u.name} (inativa)`,
    }));
  });
}

/** Unidades ATIVAS, para validar importacao e relatorio. */
export async function unidadesAtivas(scope: TenantScope): Promise<readonly { id: string; name: string }[]> {
  return withTenantDb(scope, async (db) => {
    const unidades = await db.unit.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return unidades;
  });
}
