import { withTenantDb } from "@/server/db/scoped";
import type { TenantScope } from "@/server/db/tenant-scope";
import type { Category } from "@/generated/prisma/client";
import { mesmoNome } from "@/server/app/unicidade";

/**
 * Consultas de categoria.
 *
 * A CATEGORIA E UMA ARVORE, E ISSO MUDA TRÊS COISAS
 *
 * 1. A listagem NAO pode ser uma tabela simples. A tela mostra o nivel, e a
 *    ordem e por caminho (`Alimentos > Congelados > Sorvetes`), nao por nome. Ver
 *    `caminhoDaCategoria`.
 * 2. A unicidade precisa da arvore: duas categorias de nome igual em ramos
 *    diferentes sao legítimas, porque o `@@unique([tenantId, name])` do schema e
 *    global dentro da empresa e nao por ramo. A arvore aqui tem tres niveis de
 *    uso pratico, e o limite de seguranca real e a unicidade do schema.
 * 3. O ciclo tem de ser impedido no servidor. `parentId` apontar para a propria
 *    categoria e um `A -> A`; apontar para um descendente e `A -> B -> C -> A`.
 *    O primeiro o `where` da propria update barra; o segundo barra o
 *    `findFirst` recursivo de `categoriaEhDescendente`.
 *
 * A limitacao assumida: o `@@unique([tenantId, name])` do schema e global. Duas
 * categorias "Bebidas" em ramos distintos colidem no banco. Nao ha como
 * contornar isso sem migracao (indice unico por `(tenantId, parentId, name)`), e
 * a decisao de produto e: enquanto o limite existir, o cadastro avisa com
 * "ja existe uma categoria com este nome" e a empresa escolhe outro nome. Isso e
 * preferivel a categoria "Bebidas" que existe em dois lugares e ninguem sabe qual
 * usar. Migrar o indice fica como evolucao.
 */

export interface CategoriaListagem {
  readonly id: string;
  readonly nome: string;
  readonly codigo: string | null;
  readonly descricao: string | null;
  readonly sortOrder: number;
  readonly active: boolean;
  /** Caminho completo, do raiz ate a categoria. Vazio quando e raiz. */
  readonly caminho: readonly string[];
  readonly nivel: number;
  readonly totalProdutos: number;
  /** Subcategorias imediatamente abaixo. `null` quando a listagem nao contou. */
  readonly subcategorias: number | null;
}

export interface ListagemCategorias {
  readonly categorias: readonly CategoriaListagem[];
  readonly total: number;
  readonly busca: string;
}

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

/**
 * A listagem completa da arvore, ja ordenada.
 *
 * Traz TODAS as categorias do tenant, sem paginacao, e ordena em memoria por
 * caminho. Isso e uma escolha consciente, e o motivo esta no volume: um catalogo
 * de categorias tem dezenas, nao milhares — e a alternativa (paginar uma arvore)
 * e pior em todos os sentidos que importam. Paginar por `name` cortaria o ramo
 * ao meio, e quem esta na pagina 2 veria "Sorvetes" sem "Alimentos > Congelados" ao
 * lado, sem nenhuma pista de que aquilo e um subnivel.
 *
 * O filtro de busca continua valendo, e nesse caso a ordem e por nome: quem
 * procurou "sorvete" quer o resultado, e nao a posicao na arvore.
 */
export async function listarCategorias(
  scope: TenantScope,
  entrada: { busca?: string; incluirInativas?: boolean } = {},
): Promise<ListagemCategorias> {
  const busca = entrada.busca?.trim() ?? "";
  const where = {
    deletedAt: null,
    ...(entrada.incluirInativas ? {} : { active: true }),
    ...filtroBusca(busca),
  };

  return withTenantDb(scope, async (db) => {
    const [categorias, total] = await Promise.all([
      db.category.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          sortOrder: true,
          active: true,
          parentId: true,
          _count: { select: { products: true, services: true, children: true } },
        },
      }),
      db.category.count({ where }),
    ]);

    if (busca !== "") {
      // Com busca, a arvore deixa de fazer sentido: mostrar "Sorvetes" com 2 de
      // nivel e sem os ancestrais e pior do que mostrar so o nome.
      return {
        categorias: categorias.map((c) => ({
          id: c.id,
          nome: c.name,
          codigo: c.code,
          descricao: c.description,
          sortOrder: c.sortOrder,
          active: c.active,
          caminho: [] as readonly string[],
          nivel: 0,
          totalProdutos: c._count.products + c._count.services,
          subcategorias: null,
        })),
        total,
        busca,
      };
    }

    const caminhos = montarCaminhos(categorias);

    return {
      categorias: categorias
        .map((c) => {
          const caminho = caminhos.get(c.id) ?? [c.name];
          return {
            id: c.id,
            nome: c.name,
            codigo: c.code,
            descricao: c.description,
            sortOrder: c.sortOrder,
            active: c.active,
            caminho: caminho.slice(0, -1),
            nivel: caminho.length - 1,
            totalProdutos: c._count.products + c._count.services,
            subcategorias: c._count.children,
          };
        })
        .sort((a, b) => a.caminho.concat(a.nome).join(" > ").localeCompare(b.caminho.concat(b.nome).join(" > "), "pt-BR")),
      total,
      busca,
    };
  });
}

/**
 * Constroi o caminho de cada categoria a partir de `parentId`.
 *
 * Um `Map` de pai por id e uma passagem. A alternativa — `parent.parent.parent`
 * no Prisma — seria uma query por categoria, e o N+1 em arvore de 200 linhas e
 * 200 round-trips para descobrir o que uma unica passagem em memoria resolve.
 *
 * A protecao contra ciclo esta no `visited`: se os dados ja vierem com um ciclo
 * (importacao manual, edicao direta no banco), a funcao PARA em vez de entrar em
 * laco infinito. Nao corrige o dado — corrige-lo exige decisao de negocio sobre
 * qual no da arvore e o "verdadeiro" — mas nao derruba a tela.
 */
function montarCaminhos(
  categorias: readonly { id: string; name: string; parentId: string | null }[],
): Map<string, string[]> {
  const porId = new Map(categorias.map((c) => [c.id, c]));

  const resolver = (id: string, visited: Set<string>): string[] => {
    if (visited.has(id)) return ["(ciclo)"];
    visited.add(id);

    const categoria = porId.get(id);
    if (!categoria) return ["(orfa)"];
    if (categoria.parentId === null) return [categoria.name];

    const dosPais = resolver(categoria.parentId, visited);
    return [...dosPais, categoria.name];
  };

  const caminhos = new Map<string, string[]>();
  for (const categoria of categorias) {
    caminhos.set(categoria.id, resolver(categoria.id, new Set()));
  }
  return caminhos;
}

export async function buscarCategoria(scope: TenantScope, id: string): Promise<Category | null> {
  return withTenantDb(scope, (db) => db.category.findFirst({ where: { id, deletedAt: null } }));
}

/**
 * Linha com o MESMO nome, com ou sem `deletedAt`.
 *
 * Sem filtro de `deletedAt` pelo mesmo motivo da unidade: a linha excluida
 * continua ocupando o indice unico. Ver `server/app/unicidade.ts`.
 */
export async function linhaDeMesmoNome(
  scope: TenantScope,
  nome: string,
  ignorarId?: string,
): Promise<{ id: string; deletedAt: Date | null; active: boolean } | null> {
  if (nome.trim() === "") return null;

  return withTenantDb(scope, async (db) => {
    const candidatas = await db.category.findMany({
      where: ignorarId ? { id: { not: ignorarId } } : {},
      select: { id: true, name: true, deletedAt: true, active: true },
    });
    return candidatas.find((c) => mesmoNome(c.name, nome)) ?? null;
  });
}

/**
 * Opcoes para o `<select>` de categoria pai.
 *
 * Exclui a propria categoria e toda a sua descendencia, porque escolher um
 * descendente como pai cria o ciclo. A exclusion e feita aqui para o `<select>`
 * nunca oferecer a opcao, e refeita no servidor por `categoriaEhDescendente` —
 * o `<select>` e conveniencia visual, o servidor e o controle.
 */
export async function opcoesCategoriaPai(
  scope: TenantScope,
  ignorarId?: string,
): Promise<readonly { readonly value: string; readonly rotulo: string }[]> {
  return withTenantDb(scope, async (db) => {
    const [todas, descendentes] = await Promise.all([
      db.category.findMany({
        where: { deletedAt: null, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, parentId: true },
      }),
      ignorarId ? descendentesDe(db, ignorarId) : Promise.resolve(new Set<string>()),
    ]);

    const excluidos = new Set<string>(descendentes);
    if (ignorarId) excluidos.add(ignorarId);

    return todas
      .filter((c) => !excluidos.has(c.id))
      .map((c) => ({ value: c.id, rotulo: c.name }));
  });
}

/**
 * Conjunto de ids que sao descendentes de `id` (sem incluir o proprio `id`).
 *
 * A varredura sobe pelo `parentId` a partir de cada categoria. Uma Arvore deste
 * tamanho nao justifica consulta recursiva de banco.
 */
async function descendentesDe(
  db: Parameters<Parameters<typeof withTenantDb>[1]>[0],
  id: string,
): Promise<Set<string>> {
  const todas = await db.category.findMany({ where: { deletedAt: null }, select: { id: true, parentId: true } });
  const filhosDe = new Map<string, string[]>();
  for (const c of todas) {
    if (c.parentId === null) continue;
    const lista = filhosDe.get(c.parentId) ?? [];
    lista.push(c.id);
    filhosDe.set(c.parentId, lista);
  }

  const resultado = new Set<string>();
  const pilha = [...(filhosDe.get(id) ?? [])];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    if (atual === undefined || resultado.has(atual)) continue;
    resultado.add(atual);
    pilha.push(...(filhosDe.get(atual) ?? []));
  }
  return resultado;
}

/**
 * `true` quando `possivelPai` e descendente de `categoriaId` (ou a mesma).
 *
 * E o portao ANTI-CICLO do servidor. A versao do `<select>` esconde as opcoes;
 * esta funcao recusa. O motivo de as duas existirem: esconder resolve o caso
 * comum, e recusa resolve o resto — um `FormData` montado a mao, uma action
 * chamada de outro lugar, ou o navegador com a lista antiga em cache.
 */
export async function categoriaEhDescendente(
  scope: TenantScope,
  categoriaId: string,
  possivelPaiId: string,
): Promise<boolean> {
  if (categoriaId === possivelPaiId) return true;

  return withTenantDb(scope, async (db) => {
    let atual: string | null = possivelPaiId;
    // `visited` evita laco infinito se o banco ja tiver um ciclo, e o teto de
    // passos evita que um dado corrompido trave a acao.
    const visited = new Set<string>();

    while (atual !== null && !visited.has(atual) && visited.size < 50) {
      visited.add(atual);
      const linha: { parentId: string | null } | null = await db.category.findFirst({
        where: { id: atual, deletedAt: null },
        select: { parentId: true },
      });
      if (!linha) return false;
      if (linha.parentId === categoriaId) return true;
      atual = linha.parentId;
    }
    return false;
  });
}

/** Categorias para o `<select>` de produtos: ativas, em ordem de nome. */
export async function opcoesCategoria(
  scope: TenantScope,
  entrada: { incluirInativas?: boolean } = {},
): Promise<readonly { readonly value: string; readonly rotulo: string }[]> {
  return withTenantDb(scope, async (db) => {
    const categorias = await db.category.findMany({
      where: { deletedAt: null, ...(entrada.incluirInativas ? {} : { active: true }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    });
    return categorias.map((c) => ({
      value: c.id,
      rotulo: c.active ? c.name : `${c.name} (inativa)`,
    }));
  });
}
