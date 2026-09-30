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
import { alternarAtividadeCliente } from "@/server/app/clientes/actions";
import { ehFiltroSaldo, FILTROS_SALDO, listarClientes } from "@/server/app/clientes/queries";
import { ROTULO_TIPO_PESSOA } from "@/server/app/clientes/campos";
import { valorDoFiltro } from "@/lib/querystring";import { obterContextoOperacao, podeOperar } from "@/server/app/sessao";
import { formatMoney, moneyEquals } from "@/lib/money";

/**
 * Listagem de clientes.
 *
 * A coluna de saldo em aberto e a que da utilidade a tela: quem abre "Clientes"
 * para cobrar ou para saber quem ainda tem valor a receber ve o numero antes de
 * ler o nome. Por isso ela vem antes da situacao e e a unica celula que recebe
 * cor: vermelho no devedor, neutro no restante.
 */
export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string; saldo?: string; inativos?: string }>;
}) {
  const params = await searchParams;
  const ctx = await obterContextoOperacao();

  const [podeCriar, podeEditar] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "CLIENTES", recurso: "cliente", acao: "create" }),
    podeOperar(ctx.rbac, { modulo: "CLIENTES", recurso: "cliente", acao: "update" }),
  ]);

  const saldo = params.saldo && ehFiltroSaldo(params.saldo) ? params.saldo : FILTROS_SALDO.todos;
  const incluirInativos = params.inativos === "1";

  const listagem = await listarClientes(ctx.scope, {
    busca: params.q ?? "",
    pagina: Number(params.pagina ?? "1") || 1,
    saldo,
    incluirInativos,
  });

  /** Monta a query inteira, para nenhum filtro se perder ao trocar de pagina. */
  const href = (mudancas: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const busca = mudancas.q ?? listagem.busca;
    if (busca !== "") query.set("q", busca);
    const pagina = mudancas.pagina ?? String(listagem.pagina);
    if (pagina !== "1") query.set("pagina", pagina);
    const alvo = mudancas.saldo ?? saldo;
    if (alvo !== FILTROS_SALDO.todos) query.set("saldo", alvo);
    const inativos = valorDoFiltro(mudancas, "inativos", incluirInativos ? "1" : undefined);
    if (inativos === "1") query.set("inativos", "1");
    const texto = query.toString();
    return texto === "" ? "/cadastros/clientes" : `/cadastros/clientes?${texto}`;
  };

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Clientes"
        descricao="Quem compra na loja. Nome e documento sao os unicos obrigatorios."
        acao={
          podeCriar ? (
            <Button asChild>
              <Link href="/cadastros/clientes/novo">
                <Plus />
                Novo cliente
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
              placeholder="Buscar por nome, documento, telefone ou email"
              className="pl-8"
              aria-label="Buscar cliente"
            />
          </div>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>

        <Button asChild variant={saldo !== FILTROS_SALDO.todos ? "default" : "outline"} size="sm">
          <Link href={href({ saldo: saldo === FILTROS_SALDO.todos ? FILTROS_SALDO.comSaldo : FILTROS_SALDO.todos, pagina: "1" })}>
            {saldo === FILTROS_SALDO.comSaldo ? "Mostrando devedores" : "Somente com saldo"}
          </Link>
        </Button>

        <Button asChild variant={incluirInativos ? "default" : "outline"} size="sm">
          <Link href={href({ inativos: incluirInativos ? undefined : "1", pagina: "1" })}>
            {incluirInativos ? "Ocultando inativos" : "Mostrar inativos"}
          </Link>
        </Button>
      </div>

      <CartaoLista>
        {listagem.clientes.length === 0 ? (
          <EstadoVazio
            titulo={listagem.busca === "" ? "Nenhum cliente cadastrado" : "Nada encontrado"}
            descricao={
              listagem.busca === ""
                ? "Cliente com nome e documento ja serve para vender no balcao."
                : `Nenhum cliente corresponde a "${listagem.busca}".`
            }
            acao={
              listagem.busca === "" && podeCriar ? (
                <Button asChild>
                  <Link href="/cadastros/clientes/novo">
                    <Plus />
                    Novo cliente
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
                  <TableHead>Cliente</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead className="text-right">Saldo em aberto</TableHead>
                  <TableHead>Situacao</TableHead>
                  <TableHead className="w-24 text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listagem.clientes.map((cliente) => {
                  const devendo = !moneyEquals(cliente.totalDebt, 0);
                  return (
                    <TableRow key={cliente.id}>
                      <TableCell>
                        <span className="block truncate font-medium">{cliente.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[ROTULO_TIPO_PESSOA[cliente.personType], cliente.cidade, cliente.uf]
                            .filter((parte) => parte !== undefined)
                            .join(" · ") || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{cliente.documentoMascarado || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="block truncate">{cliente.telefone ?? cliente.email ?? "—"}</span>
                        {cliente.email && cliente.telefone ? (
                          <span className="block truncate">{cliente.email}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {/*
                          A cor e o filtro mais util da tela: devedor em vermelho
                          aparece antes de qualquer leitura do numero, e e o que
                          faz a pessoa clicar no cadastro.
                        */}
                        <span className={devendo ? "font-medium text-destructive" : "text-muted-foreground"}>
                          {formatMoney(cliente.totalDebt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {cliente.active ? (
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Ativo</Badge>
                        ) : (
                          <Badge className="border-border bg-muted text-muted-foreground">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {podeEditar ? (
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/cadastros/clientes/${cliente.id}`}>Editar</Link>
                            </Button>
                          ) : null}
                          {podeEditar ? (
                            <AlternarAtividade
                              acao={alternarAtividadeCliente}
                              id={cliente.id}
                              ativo={cliente.active}
                            />
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <RodapeLista total={listagem.total} unidade="clientes" />
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
