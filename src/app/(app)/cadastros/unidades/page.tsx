import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { obterContextoOperacao, podeOperar } from "@/server/app/sessao";
import { listarUnidades } from "@/server/app/unidades/queries";
import { alternarAtividadeUnidade } from "@/server/app/unidades/actions";
import { AlternarAtividade } from "@/components/alternar-atividade";
import { CartaoLista, CabecalhoPagina, EstadoVazio, RodapeLista } from "@/components/pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Listagem de unidades de medida.
 *
 * Server Component. A busca e `<form method="get">` — o texto vai para a URL e a
 * query roda no servidor. Filtrar no cliente exigiria trazer TODAS as unidades para
 * o navegador para entao mostrar oito, e em um ERP o filtro de lista nunca e
 * apenas cosmetico: a lista que o navegador filtra e a lista que ele baixou, e o
 * que ele baixou e o que a consulta devolveu. Com `get`, a URL passa a ser
 * compartilhavel — "olha a lista de unidades de kg" e um link, nao um
 * procedimento.
 */
export default async function PaginaUnidades({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const ctx = await obterContextoOperacao();

  const [podeCriar, podeEditar, podeExcluir] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "unidade", acao: "create" }),
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "unidade", acao: "update" }),
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "unidade", acao: "delete" }),
  ]);

  const listagem = await listarUnidades(ctx.scope, {
    busca: params.q ?? "",
    pagina: Number(params.pagina ?? "1") || 1,
  });

  const base = params.q ? `/cadastros/unidades?q=${encodeURIComponent(params.q)}` : "/cadastros/unidades";

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Unidades de medida"
        descricao="Simbolos usados em produtos e servicos, e quantas casas decimais o preco aceita."
        acao={
          podeCriar ? (
            <Button asChild>
              <Link href="/cadastros/unidades/novo">
                <Plus />
                Nova unidade
              </Link>
            </Button>
          ) : null
        }
      />

      <form method="get" className="flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={listagem.busca}
            placeholder="Buscar por simbolo ou descricao"
            className="pl-8"
            aria-label="Buscar unidade de medida"
          />
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      <CartaoLista>
        {listagem.unidades.length === 0 ? (
          <EstadoVazio
            titulo={listagem.busca === "" ? "Nenhuma unidade cadastrada" : "Nada encontrado"}
            descricao={
              listagem.busca === ""
                ? "Cadastre as unidades que sua empresa usa: kg, un, cx, lt. Os produtos dependem delas."
                : `Nenhuma unidade corresponde a "${listagem.busca}".`
            }
            acao={
              listagem.busca === "" && podeCriar ? (
                <Button asChild>
                  <Link href="/cadastros/unidades/novo">
                    <Plus />
                    Nova unidade
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
                  <TableHead>Simbolo</TableHead>
                  <TableHead>Descricao</TableHead>
                  <TableHead className="text-right">Casas decimais</TableHead>
                  <TableHead className="text-right">Produtos</TableHead>
                  <TableHead>Situacao</TableHead>
                  <TableHead className="w-24 text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listagem.unidades.map((unidade) => (
                  <TableRow key={unidade.id}>
                    <TableCell className="font-medium">{unidade.nome}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {unidade.descricao ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{unidade.decimalPlaces}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {unidade.totalProdutos ?? 0}
                    </TableCell>
                    <TableCell>
                      {unidade.active ? (
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Ativa</Badge>
                      ) : (
                        <Badge className="border-border bg-muted text-muted-foreground">Inativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {podeEditar ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/cadastros/unidades/${unidade.id}`}>Editar</Link>
                          </Button>
                        ) : null}
                        {podeEditar ? (
                          <AlternarAtividade
                            acao={alternarAtividadeUnidade}
                            id={unidade.id}
                            ativo={unidade.active}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <RodapeLista total={listagem.total} unidade="unidades" />
          </>
        )}
      </CartaoLista>

      {listagem.totalPaginas > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Paginacao">
          {listagem.pagina > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}&pagina=${listagem.pagina - 1}`}>Anterior</Link>
            </Button>
          ) : null}
          <span className="text-muted-foreground">
            {listagem.pagina} de {listagem.totalPaginas}
          </span>
          {listagem.pagina < listagem.totalPaginas ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}&pagina=${listagem.pagina + 1}`}>Proxima</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}

      {podeExcluir ? null : (
        <p className="text-xs text-muted-foreground">
          Voce pode consultar e alterar unidades, mas nao pode excluir.
        </p>
      )}
    </div>
  );
}
