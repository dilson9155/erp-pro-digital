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
import { alternarAtividadeFornecedor } from "@/server/app/fornecedores/actions";
import { listarFornecedores } from "@/server/app/fornecedores/queries";
import { ROTULO_TIPO_PESSOA } from "@/server/app/fornecedores/campos";
import { obterContextoOperacao, podeOperar } from "@/server/app/sessao";
import { valorDoFiltro } from "@/lib/querystring";import { formatMoney } from "@/lib/money";

/**
 * Listagem de fornecedores.
 *
 * A coluna de total NAO pode dizer "Total comprado", como na tela de cliente.
 * `Supplier.totalPurchased` e quanto a EMPRESA comprou do fornecedor, e
 * `Customer.totalPurchased` e quanto a PESSOA comprou da empresa: o mesmo nome
 * de coluna, sentidos opostos. O rotulo aqui e "Comprado de nos" para que as
 * duas telas possam ser lidas na mesma hora sem traducao.
 *
 * Diferente do cliente, NAO ha filtro de saldo nem cor por divida: o
 * `totalDebt` do fornecedor e conta a PAGAR, e quem precisa da fila de trabalho
 * e quem faz o pagamento, no modulo financeiro. O que aparece e o prazo medio
 * de entrega, que e o dado que a equipe de compras consulta para negociar.
 */
export default async function PaginaFornecedores({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string; inativos?: string }>;
}) {
  const params = await searchParams;
  const ctx = await obterContextoOperacao();

  const [podeCriar, podeEditar] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "FORNECEDORES", recurso: "fornecedor", acao: "create" }),
    podeOperar(ctx.rbac, { modulo: "FORNECEDORES", recurso: "fornecedor", acao: "update" }),
  ]);

  const incluirInativos = params.inativos === "1";

  const listagem = await listarFornecedores(ctx.scope, {
    busca: params.q ?? "",
    pagina: Number(params.pagina ?? "1") || 1,
    incluirInativos,
  });

  /** Monta a query inteira, para nenhum filtro se perder ao trocar de pagina. */
  const href = (mudancas: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const busca = mudancas.q ?? listagem.busca;
    if (busca !== "") query.set("q", busca);
    const pagina = mudancas.pagina ?? String(listagem.pagina);
    if (pagina !== "1") query.set("pagina", pagina);
    const inativos = valorDoFiltro(mudancas, "inativos", incluirInativos ? "1" : undefined);
    if (inativos === "1") query.set("inativos", "1");
    const texto = query.toString();
    return texto === "" ? "/cadastros/fornecedores" : `/cadastros/fornecedores?${texto}`;
  };

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Fornecedores"
        descricao="Quem fornece a empresa. O total e o valor que foi COMPRADO deles."
        acao={
          podeCriar ? (
            <Button asChild>
              <Link href="/cadastros/fornecedores/novo">
                <Plus />
                Novo fornecedor
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
              placeholder="Buscar por nome, contato, documento ou telefone"
              className="pl-8"
              aria-label="Buscar fornecedor"
            />
          </div>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>

        <Button asChild variant={incluirInativos ? "default" : "outline"} size="sm">
          <Link href={href({ inativos: incluirInativos ? undefined : "1", pagina: "1" })}>
            {incluirInativos ? "Ocultando inativos" : "Mostrar inativos"}
          </Link>
        </Button>
      </div>

      <CartaoLista>
        {listagem.fornecedores.length === 0 ? (
          <EstadoVazio
            titulo={listagem.busca === "" ? "Nenhum fornecedor cadastrado" : "Nada encontrado"}
            descricao={
              listagem.busca === ""
                ? "Fornecedor com razao social e CNPJ ja serve para registrar compra."
                : `Nenhum fornecedor corresponde a "${listagem.busca}".`
            }
            acao={
              listagem.busca === "" && podeCriar ? (
                <Button asChild>
                  <Link href="/cadastros/fornecedores/novo">
                    <Plus />
                    Novo fornecedor
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
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead className="text-right">Comprado de nos</TableHead>
                  <TableHead className="text-right">Prazo medio</TableHead>
                  <TableHead>Situacao</TableHead>
                  <TableHead className="w-24 text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listagem.fornecedores.map((fornecedor) => (
                  <TableRow key={fornecedor.id}>
                    <TableCell>
                      <span className="block truncate font-medium">{fornecedor.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[ROTULO_TIPO_PESSOA[fornecedor.personType], fornecedor.cidade, fornecedor.uf]
                          .filter((parte) => parte !== undefined)
                          .join(" · ") || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {fornecedor.documentoMascarado || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <span className="block truncate">
                        {[fornecedor.nomeContato, fornecedor.telefone].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(fornecedor.totalPurchased)}</TableCell>
                    {/*
                      Prazo zero = nunca comprou, e nao "entrega no mesmo dia".
                      Por isso o texto e diferente do numero: sem historico, o
                      numero lido como zero seria levado a serio em negociacao.
                    */}
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fornecedor.purchaseCount === 0
                        ? "Sem historico"
                        : `${fornecedor.averageLeadTimeDays} dias`}
                    </TableCell>
                    <TableCell>
                      {fornecedor.active ? (
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Ativo</Badge>
                      ) : (
                        <Badge className="border-border bg-muted text-muted-foreground">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {podeEditar ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/cadastros/fornecedores/${fornecedor.id}`}>Editar</Link>
                          </Button>
                        ) : null}
                        {podeEditar ? (
                          <AlternarAtividade
                            acao={alternarAtividadeFornecedor}
                            id={fornecedor.id}
                            ativo={fornecedor.active}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <RodapeLista total={listagem.total} unidade="fornecedores" />
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
