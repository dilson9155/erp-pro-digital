import Link from "next/link";
import { CornerDownRight, Plus, Search } from "lucide-react";

import { obterContextoOperacao, podeOperar } from "@/server/app/sessao";
import { listarCategorias } from "@/server/app/categorias/queries";
import { alternarAtividadeCategoria } from "@/server/app/categorias/actions";
import { AlternarAtividade } from "@/components/alternar-atividade";
import { CartaoLista, CabecalhoPagina, EstadoVazio, RodapeLista } from "@/components/pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Listagem de categorias, em arvore.
 *
 * O NIVEL VIRÁ COMO RECUO, E NAO COMO COLUNA
 *
 * Uma coluna "nivel" comecaria em 0, 1, 2 e a pessoa contaria a distancia a
 * olho. Recuo e o que uma arvore e: o mesmo que o explorador de arquivos faz, e
 * o que faz o agrupamento ser lido sem esforço. O texto `sr-only` no mesmo
 * `<td>` e o que anuncia a profundidade para leitor de tela, que nao enxerga
 * recuo visual.
 */
export default async function PaginaCategorias({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inativas?: string }>;
}) {
  const params = await searchParams;
  const ctx = await obterContextoOperacao();

  const [podeCriar, podeEditar, podeExcluir] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "categoria", acao: "create" }),
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "categoria", acao: "update" }),
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "categoria", acao: "delete" }),
  ]);

  const listagem = await listarCategorias(ctx.scope, {
    busca: params.q ?? "",
    incluirInativas: params.inativas === "1",
  });

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Categorias"
        descricao="Agrupamento de produtos e servicos. Categorias podem ter subcategorias."
        acao={
          podeCriar ? (
            <Button asChild>
              <Link href="/cadastros/categorias/novo">
                <Plus />
                Nova categoria
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <form method="get" className="flex max-w-md flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={listagem.busca}
              placeholder="Buscar por nome ou codigo"
              className="pl-8"
              aria-label="Buscar categoria"
            />
          </div>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>

        {/* Inativas ficam fora por padrao: uma categoria desativada continua no
            produto antigo, e mostrala junto com as ativas faz a lista parecer
            ter duplicata. O parametro vai na URL para o filtro ser
            compartilhavel. */}
        <Button asChild variant={params.inativas === "1" ? "default" : "outline"} size="sm">
          <Link href={params.inativas === "1" ? "/cadastros/categorias" : "/cadastros/categorias?inativas=1"}>
            {params.inativas === "1" ? "Ocultando inativas" : "Mostrar inativas"}
          </Link>
        </Button>
      </div>

      <CartaoLista>
        {listagem.categorias.length === 0 ? (
          <EstadoVazio
            titulo={listagem.busca === "" ? "Nenhuma categoria cadastrada" : "Nada encontrado"}
            descricao={
              listagem.busca === ""
                ? "Comece pelas familias de produto que a sua empresa vende."
                : `Nenhuma categoria corresponde a "${listagem.busca}".`
            }
            acao={
              listagem.busca === "" && podeCriar ? (
                <Button asChild>
                  <Link href="/cadastros/categorias/novo">
                    <Plus />
                    Nova categoria
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Codigo</TableHead>
                  <TableHead className="text-right">Produtos</TableHead>
                  <TableHead className="text-right">Subcategorias</TableHead>
                  <TableHead>Situacao</TableHead>
                  <TableHead className="w-24 text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listagem.categorias.map((categoria) => (
                  <TableRow key={categoria.id}>
                    <TableCell>
                      <span
                        className="flex items-center gap-1.5"
                        style={{ paddingLeft: `${categoria.nivel * 16}px` }}
                      >
                        {categoria.nivel > 0 ? (
                          <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                        ) : null}
                        <span className="truncate font-medium" title={categoria.nome}>
                          {categoria.nome}
                        </span>
                      </span>
                      <span className="sr-only">
                        {categoria.caminho.length > 0
                          ? `Nivel ${categoria.nivel + 1}, dentro de ${categoria.caminho.join(", ")}`
                          : "Nivel 1, categoria raiz"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {categoria.codigo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{categoria.totalProdutos}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {categoria.subcategorias === null || categoria.subcategorias === 0
                        ? "—"
                        : categoria.subcategorias}
                    </TableCell>
                    <TableCell>
                      {categoria.active ? (
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Ativa</Badge>
                      ) : (
                        <Badge className="border-border bg-muted text-muted-foreground">Inativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {podeEditar ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/cadastros/categorias/${categoria.id}`}>Editar</Link>
                          </Button>
                        ) : null}
                        {podeEditar ? (
                          <AlternarAtividade
                            acao={alternarAtividadeCategoria}
                            id={categoria.id}
                            ativo={categoria.active}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <RodapeLista total={listagem.total} unidade="categorias" />
          </>
        )}
      </CartaoLista>

      {podeExcluir ? null : (
        <p className="text-xs text-muted-foreground">
          Voce pode consultar e alterar categorias, mas nao pode excluir.
        </p>
      )}
    </div>
  );
}
