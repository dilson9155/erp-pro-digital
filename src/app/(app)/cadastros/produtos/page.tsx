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
import { alternarAtividadeProduto } from "@/server/app/produtos/actions";
import { ehFiltroEstoque, FILTROS_ESTOQUE, listarProdutos } from "@/server/app/produtos/queries";
import { ROTULO_TIPO, saldoFormatado } from "@/server/app/produtos/campos";
import { obterContextoOperacao, podeOperar } from "@/server/app/sessao";
import { valorDoFiltro } from "@/lib/querystring";import { formatMoney } from "@/lib/money";

/**
 * Listagem de produtos.
 *
 * Os tres filtros de barra (texto, estoque, incluir inativos) viajam juntos na
 * URL. Isso nao e detalhe de `Link`: e o que faz o "voltar" do navegador
 * devolver a tela que a pessoa saiu, e o que faz a pagina 2 manter a busca. Os
 * links de paginacao montam a query inteira de novo pelos mesmos parametros.
 */
export default async function PaginaProdutos({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    pagina?: string;
    estoque?: string;
    inativos?: string;
  }>;
}) {
  const params = await searchParams;
  const ctx = await obterContextoOperacao();

  const [podeCriar, podeEditar] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "produto", acao: "create" }),
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "produto", acao: "update" }),
  ]);

  const estoque = params.estoque && ehFiltroEstoque(params.estoque) ? params.estoque : FILTROS_ESTOQUE.todos;
  const incluirInativos = params.inativos === "1";

  const listagem = await listarProdutos(ctx.scope, {
    busca: params.q ?? "",
    pagina: Number(params.pagina ?? "1") || 1,
    estoque,
    incluirInativos,
  });

  /** Monta a query inteira, para nenhum filtro se perder ao trocar de pagina. */
  const href = (mudancas: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const busca = mudancas.q ?? listagem.busca;
    if (busca !== "") query.set("q", busca);
    const pagina = mudancas.pagina ?? String(listagem.pagina);
    if (pagina !== "1") query.set("pagina", pagina);
    const alvo = mudancas.estoque ?? estoque;
    if (alvo !== FILTROS_ESTOQUE.todos) query.set("estoque", alvo);
    const inativos = valorDoFiltro(mudancas, "inativos", incluirInativos ? "1" : undefined);
    if (inativos === "1") query.set("inativos", "1");
    const texto = query.toString();
    return texto === "" ? "/cadastros/produtos" : `/cadastros/produtos?${texto}`;
  };

  // O rotulo de `tipo` vem do modulo do servidor, e nao de um map local com
  // `ProductType`: a pagina e Server Component, mas ela nao precisa (e nao deve)
  // puxar o enum gerado do Prisma para montar rotulo. A lista de opcoes do
  // formulario ja vive em `camposProduto`, no servidor.
  const rotuloTipo = ROTULO_TIPO;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Produtos"
        descricao="O que a empresa vende. O saldo muda por entradas e vendas, nao por aqui."
        acao={
          podeCriar ? (
            <Button asChild>
              <Link href="/cadastros/produtos/novo">
                <Plus />
                Novo produto
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
              placeholder="Buscar por nome, SKU ou codigo de barras"
              className="pl-8"
              aria-label="Buscar produto"
            />
          </div>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>

        {/*
          Os botoes de filtro precisam ser `Link` e nao `<button>`: cada um e uma
          navegacao com a query montada, e o que mantem o filtro ao voltar.
        */}
        <Button asChild variant={estoque !== FILTROS_ESTOQUE.todos ? "default" : "outline"} size="sm">
          <Link href={href({ estoque: estoque === FILTROS_ESTOQUE.todos ? FILTROS_ESTOQUE.esgotado : FILTROS_ESTOQUE.todos })}>
            {estoque === FILTROS_ESTOQUE.esgotado ? "Mostrando esgotados" : "Somente esgotados"}
          </Link>
        </Button>

        <Button asChild variant={incluirInativos ? "default" : "outline"} size="sm">
          <Link href={href({ inativos: incluirInativos ? undefined : "1" })}>
            {incluirInativos ? "Ocultando inativos" : "Mostrar inativos"}
          </Link>
        </Button>
      </div>

      <CartaoLista>
        {listagem.produtos.length === 0 ? (
          <EstadoVazio
            titulo={listagem.busca === "" ? "Nenhum produto cadastrado" : "Nada encontrado"}
            descricao={
              listagem.busca === ""
                ? "Cadastre a unidade de medida antes — ela e obrigatoria no produto."
                : `Nenhum produto corresponde a "${listagem.busca}".`
            }
            acao={
              listagem.busca === "" && podeCriar ? (
                <Button asChild>
                  <Link href="/cadastros/produtos/novo">
                    <Plus />
                    Novo produto
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
                  <TableHead>Produto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Preco</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Situacao</TableHead>
                  <TableHead className="w-24 text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listagem.produtos.map((produto) => (
                  <TableRow key={produto.id}>
                    <TableCell>
                      <span className="block truncate font-medium">{produto.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[rotuloTipo[produto.type], produto.categoria?.nome, produto.marca?.nome]
                          .filter((parte) => parte !== undefined)
                          .join(" · ") || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{produto.sku}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(produto.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/*
                        A cor do saldo e o filtro mais util da tela: um saldo
                        negativo em vermelho aparece antes de qualquer leitura do
                        numero, e e o que faz a pessoa clicar no item.
                      */}
                      <span className={produto.currentStock.lte(0) ? "font-medium text-destructive" : undefined}>
                        {saldoFormatado(produto)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {produto.active ? (
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Ativo</Badge>
                      ) : (
                        <Badge className="border-border bg-muted text-muted-foreground">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {podeEditar ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/cadastros/produtos/${produto.id}`}>Editar</Link>
                          </Button>
                        ) : null}
                        {podeEditar ? (
                          <AlternarAtividade
                            acao={alternarAtividadeProduto}
                            id={produto.id}
                            ativo={produto.active}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <RodapeLista total={listagem.total} unidade="produtos" />
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
    </div>
  );
}
