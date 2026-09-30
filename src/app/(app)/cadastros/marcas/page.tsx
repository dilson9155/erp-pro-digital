import Link from "next/link";
import { Plus, Search } from "lucide-react";

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
import { alternarAtividadeMarca } from "@/server/app/marcas/actions";
import { listarMarcas } from "@/server/app/marcas/queries";
import { valorDoFiltro } from "@/lib/querystring";import { obterContextoOperacao, podeOperar } from "@/server/app/sessao";

export default async function PaginaMarcas({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string; inativas?: string }>;
}) {
  const params = await searchParams;
  const ctx = await obterContextoOperacao();

  const [podeCriar, podeEditar, podeExcluir] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "marca", acao: "create" }),
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "marca", acao: "update" }),
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "marca", acao: "delete" }),
  ]);

  const listagem = await listarMarcas(ctx.scope, {
    busca: params.q ?? "",
    pagina: Number(params.pagina ?? "1") || 1,
    incluirInativas: params.inativas === "1",
  });

  /**
   * Monta a query inteira a partir do filtro atual.
   *
   * A versao anterior montava `?pagina=N` na mao. O efeito era que buscar
   * "Bosch", ir para a pagina 2 e voltar para a pagina 1 trazia a lista sem a
   * busca — e o mesmo no botao de inativas. Quem filtrava perdia o filtro sem
   * aviso, e a lista "comprovava" que a busca nao existia. Aqui nenhum filtro
   * se perde: a pagina 2 mantem `q`, e o toggle mantem `q` e volta para a
   * pagina 1 (trocar de filtro sobre a pagina 3 mostraria vazio).
   */
  const href = (mudancas: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const busca = mudancas.q ?? listagem.busca;
    if (busca !== "") query.set("q", busca);
    const pagina = mudancas.pagina ?? String(listagem.pagina);
    if (pagina !== "1") query.set("pagina", pagina);
    const inativas = valorDoFiltro(mudancas, "inativas", params.inativas === "1" ? "1" : undefined);
    if (inativas === "1") query.set("inativas", "1");
    const texto = query.toString();
    return texto === "" ? "/cadastros/marcas" : `/cadastros/marcas?${texto}`;
  };

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Marcas"
        descricao="Fabricante do produto. Opcional no cadastro de item."
        acao={
          podeCriar ? (
            <Button asChild>
              <Link href="/cadastros/marcas/novo">
                <Plus />
                Nova marca
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
              aria-label="Buscar marca"
            />
          </div>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>

        <Button asChild variant={params.inativas === "1" ? "default" : "outline"} size="sm">
          <Link
            href={href({
              inativas: params.inativas === "1" ? undefined : "1",
              pagina: "1",
            })}
          >
            {params.inativas === "1" ? "Ocultando inativas" : "Mostrar inativas"}
          </Link>
        </Button>
      </div>

      <CartaoLista>
        {listagem.marcas.length === 0 ? (
          <EstadoVazio
            titulo={listagem.busca === "" ? "Nenhuma marca cadastrada" : "Nada encontrado"}
            descricao={
              listagem.busca === ""
                ? "Marca e opcional: um produto sem marca continua valendo."
                : `Nenhuma marca corresponde a "${listagem.busca}".`
            }
            acao={
              listagem.busca === "" && podeCriar ? (
                <Button asChild>
                  <Link href="/cadastros/marcas/novo">
                    <Plus />
                    Nova marca
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
                  <TableHead>Marca</TableHead>
                  <TableHead>Codigo</TableHead>
                  <TableHead className="text-right">Produtos</TableHead>
                  <TableHead>Situacao</TableHead>
                  <TableHead className="w-24 text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listagem.marcas.map((marca) => (
                  <TableRow key={marca.id}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {/*
                          A imagem usa `<img>` puro e nao `next/image`: e uma URL
                          de terceiro, de largura e altura desconhecidas, e o
                          `next/image` exigiria liberar o dominio na configuracao
                          para cada novo host. Uma marca sem logo — o caso comum —
                          nao gera requisicao nenhuma, porque o `src` so existe
                          quando ha URL.
                        */}
                        {marca.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={marca.logoUrl}
                            alt=""
                            className="size-6 shrink-0 rounded object-contain"
                            loading="lazy"
                          />
                        ) : null}
                        <span className="truncate font-medium">{marca.nome}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{marca.codigo ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{marca.totalProdutos}</TableCell>
                    <TableCell>
                      {marca.active ? (
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Ativa</Badge>
                      ) : (
                        <Badge className="border-border bg-muted text-muted-foreground">Inativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {podeEditar ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/cadastros/marcas/${marca.id}`}>Editar</Link>
                          </Button>
                        ) : null}
                        {podeEditar ? (
                          <AlternarAtividade
                            acao={alternarAtividadeMarca}
                            id={marca.id}
                            ativo={marca.active}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <RodapeLista total={listagem.total} unidade="marcas" />
          </>
        )}
      </CartaoLista>

      {listagem.totalPaginas > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Paginacao">
          {listagem.pagina > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href({ pagina: String(listagem.pagina - 1) })}>Anterior</Link>
            </Button>
          ) : null}
          <span className="text-muted-foreground">
            {listagem.pagina} de {listagem.totalPaginas}
          </span>
          {listagem.pagina < listagem.totalPaginas ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href({ pagina: String(listagem.pagina + 1) })}>Proxima</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}

      {podeExcluir ? null : (
        <p className="text-xs text-muted-foreground">
          Voce pode consultar e alterar marcas, mas nao pode excluir.
        </p>
      )}
    </div>
  );
}
