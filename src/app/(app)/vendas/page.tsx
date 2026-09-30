import Link from "next/link";
import { notFound } from "next/navigation";

import { CartaoLista, CabecalhoPagina, EstadoVazio, RodapeLista, StatusBadge } from "@/components/pagina";
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
import { formatMoney } from "@/lib/money";
import { obterContextoOperacao, podeOperar } from "@/server/app/sessao";
import { ehSituacao, listarVendas, SITUACAO_TODAS } from "@/server/app/vendas/queries";
import { OPCOES_SITUACAO, rotuloDaSituacao, tomDaSituacao } from "@/server/app/vendas/rotulos";

/**
 * Listagem de vendas.
 *
 * A listagem e o ponto de entrada da VENDA COMPLETA: o botao "Nova venda" abre
 * o formulario, que salva um rascunho, e o rascunho so vira venda de verdade
 * quando alguem confirma — a confirmacao que debita estoque, congela custo e
 * gera a conta a receber, tudo em uma transacao.
 *
 * O FORMULARIO E GET DE PROPOSITO
 *
 * Os filtros sao `<input name>` e `<select name>` nativos dentro de um
 * `<form method="get">`. Um filtro de listagem que depende de JavaScript tem
 * tres problemas aqui: nao funciona com o botao direito do navegador, a URL
 *filtrada nao e enviavel para ninguem ("olha essa venda que eu achei"), e o
 * filtro some ao recarregar. Aqui cada combinacao de filtro e um link.
 */
export default async function PaginaVendas({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    situacao?: string;
    de?: string;
    ate?: string;
    pagina?: string;
  }>;
}) {
  const params = await searchParams;
  const ctx = await obterContextoOperacao();

  if (!(await podeOperar(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "read" }))) {
    // A pagina inteira some, e nao a tabela. Ver `nav-lateral.tsx`: o menu e
    // literal de proposito, entao quem chega aqui sem permissao precisa receber
    // a mesma resposta de quem clica em uma tela que nao existe.
    notFound();
  }

  // O filtro de situacao vem da URL, e `ehSituacao` valida: sem isso, qualquer
  // pessoa poderia escrever `?situacao=QUALQUER_COISA` e o Prisma receberia um
  // valor que nao existe no enum. O tipo do enum protege em tempo de
  // compilacao, nao em tempo de execucao — a URL e entrada do usuario.
  const situacaoBruta = params.situacao ?? SITUACAO_TODAS;
  const situacao = ehSituacao(situacaoBruta) ? situacaoBruta : SITUACAO_TODAS;
  const pagina = Math.max(1, Number(params.pagina ?? "1") || 1);

  // O botao de criar e lido do RBAC, e nao escondido por convencao: quem pode
  // ler e nao pode criar ve a consulta sem o botao, e quem pode criar ve o
  // caminho. Esconder por `podeOperar(...) && <Button>` dentro do JSX daria o
  // mesmo resultado com uma leitura a menos do que a que a pessoa leu.
  const podeCriar = await podeOperar(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "create" });

  const listagem = await listarVendas(ctx.scope, {
    busca: params.q ?? "",
    pagina,
    situacao,
    de: dataValida(params.de),
    ate: dataValida(params.ate),
  });

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Vendas"
        descricao="Venda salva em rascunho e depois confirmada, quando entra no estoque e no financeiro."
        acao={
          podeCriar ? (
            <Button asChild>
              <Link href="/vendas/nova">Nova venda</Link>
            </Button>
          ) : null
        }
      />

      <FiltrosVendas
        busca={listagem.busca}
        situacao={situacao}
        de={listagem.de}
        ate={listagem.ate}
      />

      <CartaoLista>
        {listagem.vendas.length === 0 ? (
          <EstadoVazio
            titulo={temFiltro(listagem) ? "Nenhuma venda encontrada" : "Nenhuma venda registrada"}
            descricao={
              temFiltro(listagem)
                ? "Nenhuma venda corresponde aos filtros. Uma venda cancelada continua na lista por padrao, entao vale conferir o periodo."
                : podeCriar
                  ? "Nenhuma venda registrada ainda. Comece por 'Nova venda'."
                  : "Nenhuma venda registrada."
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Situacao</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listagem.vendas.map((venda) => (
                  <TableRow key={venda.id}>
                    <TableCell>
                      {/* O numero e o identificador que a pessoa usa para citar a
                          venda em conversa. A serie entra antes quando existe,
                          porque dois numeros iguais em series diferentes sao
                          vendas diferentes. */}
                      <Link
                        href={`/vendas/${venda.id}`}
                        className="font-mono text-sm font-medium hover:underline"
                      >
                        {venda.serie ? `${venda.serie}/${venda.numero}` : venda.numero}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="block truncate">
                        {venda.clienteNome ?? (
                          <span className="text-muted-foreground">Consumidor final</span>
                        )}
                      </span>
                      {venda.vendedorNome ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {venda.vendedorNome}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {venda.soldAt ? formatarDataHora(venda.soldAt) : (
                        <span className="text-muted-foreground">Sem data</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{venda.quantidadeItens}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(venda.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {venda.saldo.isZero() ? (
                        <span className="text-muted-foreground">Quitada</span>
                      ) : (
                        formatMoney(venda.saldo)
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tom={tomDaSituacao(venda.status)}>{rotuloSituacao(venda.status)}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <RodapeLista total={listagem.total} unidade="vendas" />
          </>
        )}
      </CartaoLista>

      {listagem.totalPaginas > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Paginacao">
          {listagem.pagina > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={hrefDaPagina(listagem, listagem.pagina - 1)}>Anterior</Link>
            </Button>
          ) : null}
          <span className="text-muted-foreground">
            {listagem.pagina} de {listagem.totalPaginas}
          </span>
          {listagem.pagina < listagem.totalPaginas ? (
            <Button asChild variant="outline" size="sm">
              <Link href={hrefDaPagina(listagem, listagem.pagina + 1)}>Proxima</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

/**
 * Filtros de venda: busca, situacao e periodo.
 *
 * Nao ha campo de "valor minimo" nem "cliente" separado, e a razao e a mesma de
 * `clientes/queries.ts`: o que nao cabe num filtro simples entra na busca, e
 * duplicar o campo aqui criaria dois lugares para a mesma consulta divergirem.
 */
function FiltrosVendas({
  busca,
  situacao,
  de,
  ate,
}: {
  busca: string;
  situacao: string;
  de: string;
  ate: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1 space-y-1">
        <label htmlFor="filtro-busca" className="text-xs text-muted-foreground">
          Buscar
        </label>
        <Input
          id="filtro-busca"
          type="search"
          name="q"
          defaultValue={busca}
          placeholder="Numero, cliente ou documento"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="filtro-situacao" className="text-xs text-muted-foreground">
          Situacao
        </label>
        <select
          id="filtro-situacao"
          name="situacao"
          defaultValue={situacao}
          className="flex h-9 w-44 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {OPCOES_SITUACAO.map((opcao) => (
            <option key={opcao.value} value={opcao.value}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="filtro-de" className="text-xs text-muted-foreground">
          De
        </label>
        <Input id="filtro-de" type="date" name="de" defaultValue={de} className="w-40" />
      </div>

      <div className="space-y-1">
        <label htmlFor="filtro-ate" className="text-xs text-muted-foreground">
          Ate
        </label>
        <Input id="filtro-ate" type="date" name="ate" defaultValue={ate} className="w-40" />
      </div>

      <Button type="submit" variant="outline">
        Filtrar
      </Button>
    </form>
  );
}

/**
 * Link de paginação, montado a partir do estado JÁ RESOLVIDO da listagem.
 *
 * O helper nao recebe um objeto de "mudancas" com fallback para o valor atual
 * como os outros cadastros fazem. Aqui ele recebe a pagina e reconstroi a query
 * com os filtros que a listagem devolveu.
 *
 * A razao e um bug concreto que ja existiu no modulo de marcas: o padrão
 * `mudancas.inativas ?? valorAtual` nao consegue DESLIGAR um filtro, porque
 * passar `undefined` faz o `??` devolver o valor atual, e o link "Ocultando
 * inativas" continuava mostrando as inativas. Neste modulo nao ha toggle, so
 * paginacao, entao nao ha como o valor ser "nao informado": os filtros vem
 * sempre resolvidos e a URL e montada do zero.
 */
function hrefDaPagina(listagem: { busca: string; situacao: string; de: string; ate: string }, pagina: number): string {
  const query = new URLSearchParams();
  if (listagem.busca !== "") query.set("q", listagem.busca);
  if (listagem.situacao !== SITUACAO_TODAS) query.set("situacao", listagem.situacao);
  if (listagem.de !== "") query.set("de", listagem.de);
  if (listagem.ate !== "") query.set("ate", listagem.ate);
  if (pagina > 1) query.set("pagina", String(pagina));
  const texto = query.toString();
  return texto === "" ? "/vendas" : `/vendas?${texto}`;
}

/** Data vinda da URL so entra no filtro se estiver no formato do `<input type="date">`. */
function dataValida(valor: string | undefined): string {
  if (valor === undefined) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : "";
}

function temFiltro(listagem: { busca: string; situacao: string; de: string; ate: string }): boolean {
  return listagem.busca !== "" || listagem.situacao !== SITUACAO_TODAS || listagem.de !== "" || listagem.ate !== "";
}

/** Rótulo da situação, resolvido no módulo server para não vazar o enum para a página. */
function rotuloSituacao(situacao: Parameters<typeof rotuloDaSituacao>[0]): string {
  return rotuloDaSituacao(situacao);
}

/** Data e hora no fuso de quem fatura. `timeZone` explicito, senão o servidor decide. */
function formatarDataHora(data: Date): string {
  return data.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
