import Link from "next/link";
import { notFound } from "next/navigation";
import type Decimal from "decimal.js";

import { CartaoLista, CabecalhoPagina, StatusBadge } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AcoesVenda } from "@/components/vendas/acoes-venda";
import { formatMoney, formatPercent, quantityToNumber, toDecimal } from "@/lib/money";
import { obterContextoOperacao, podeOperar } from "@/server/app/sessao";
import type { VendaDetalhe } from "@/server/app/vendas/queries";
import { buscarVenda, opcoesVenda } from "@/server/app/vendas/queries";
import { rotuloDaSituacao, tomDaSituacao } from "@/server/app/vendas/rotulos";
import {
  cancelarVenda,
  confirmarVenda,
  excluirRascunhoVenda,
  registrarRecebimentoVenda,
} from "@/server/app/vendas/actions";

/**
 * Detalhe da venda.
 *
 * TRES BLOCOS QUE PARECEM REDUNDANTES E NAO SAO
 *
 * A tela mostra o dinheiro em tres lugares, e a tentacao e juntar em um so:
 *
 * - "Saldo da venda": `total - paidAmount`, calculado aqui.
 * - "Contas a receber": o que o financeiro tem em aberto, por conta e parcela.
 * - "Pagamentos": o que efetivamente entrou, por transacao.
 *
 * Sao tres fontes com tres momentos diferentes, e ver as tres e o que permite
 * responder "por que falta R$ 300". Se a tela mostrasse so o saldo da venda, um
 * adiantamento recebido antes do faturamento apareceria como "falta R$ 300"
 * mesmo tendo o dinheiro na conta. Se mostrasse so as contas a receber, uma
 * venda ainda nao faturada apareceria como sem divida nenhuma. Ver o comentario
 * de `buscarVenda`.
 */
export default async function PaginaVenda({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await obterContextoOperacao();

  if (!(await podeOperar(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "read" }))) {
    notFound();
  }

  const venda = await buscarVenda(ctx.scope, id);
  if (venda === null) notFound();

  // As permissoes sao lidas AQUI, uma vez, e passadas como 0/1 para o client.
  // Repetir `podeOperar` dentro do componente mostraria o botao de confirmar a
  // alguem que so pode ler, e o erro viria como "voce nao tem permissao" —
  // depois de a pessoa ter lido a tela,Montado a venda na cabeca e clicado.
  //
  // Nao ha `acao: "delete"` aqui: `VENDAS.venda` nao tem `delete` no catalogo.
  // Excluir rascunho usa `update`, a mesma permissao da edicao — ver o comentario
  // de `excluirRascunhoVenda`. Pedir `delete` faria `podeOperar` devolver
  // `false` para sempre, e o botao sumiria sem erro nenhum.
  const [podeEditar, podeCancelar, opcoes] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "update" }),
    podeOperar(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "cancel" }),
    opcoesVenda(ctx.scope, venda.filialId),
  ]);

  const saldo = venda.total.minus(venda.recebido);
  // O "quitada?" e calculado AQUI, com `Decimal.isZero()`, e nao no client
  // comparando texto. `formatMoney` produz "R$ 0,00" e nao "0,00", entao a
  // comparacao de string no componente nunca seria verdadeira e o formulario
  // de recebimento continuaria aparecendo numa venda sem saldo.
  const quitada = saldo.isZero() || saldo.isNegative();

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo={venda.serie ? `Venda ${venda.serie}/${venda.numero}` : `Venda ${venda.numero}`}
        descricao={venda.clienteNome ?? "Consumidor final"}
        acao={
          <div className="flex items-center gap-2">
            <StatusBadge tom={tomDaSituacao(venda.status)}>{rotuloDaSituacao(venda.status)}</StatusBadge>
            {venda.status === "RASCUNHO" && podeEditar ? (
              <Button asChild variant="outline">
                <Link href={`/vendas/${venda.id}/editar`}>Editar rascunho</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/vendas">Voltar</Link>
            </Button>
          </div>
        }
      />

      <CartaoLista titulo="Acoes">
        <div className="p-4">
          <AcoesVenda
            vendaId={venda.id}
            status={venda.status}
            podeEditar={podeEditar}
            podeCancelar={podeCancelar}
            saldo={formatMoney(saldo)}
            quitada={quitada}
            formasPagamento={opcoes.formasPagamento}
            confirmar={confirmarVenda}
            receber={registrarRecebimentoVenda}
            cancelar={cancelarVenda}
            removerRascunho={podeEditar ? excluirRascunhoVenda : undefined}
          />
        </div>
      </CartaoLista>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao rotulo="Total" valor={formatMoney(venda.total)} />
        <Cartao rotulo="Recebido" valor={formatMoney(venda.recebido)} />
        <Cartao
          rotulo="Saldo da venda"
          valor={quitada ? "Quitada" : formatMoney(saldo)}
        />
        <Cartao
          rotulo="A receber (financeiro)"
          valor={
            venda.contas.length === 0
              ? "Sem conta"
              : formatMoney(somaRestante(venda))
          }
          observacao={
            venda.contas.length === 0
              ? "Nenhuma conta gerada"
              : `${venda.contas.length} conta(s), ${contaParcelas(venda)} parcela(s)`
          }
        />
      </div>

      <CartaoLista titulo="Itens">
        <ItensDaVenda venda={venda} />
      </CartaoLista>

      <div className="grid gap-4 lg:grid-cols-2">
        <CartaoLista titulo="Pagamentos">
          {venda.pagamentos.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhum pagamento registrado nesta venda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Pago em</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {venda.pagamentos.map((pagamento) => (
                  <TableRow key={pagamento.id}>
                    <TableCell className="tabular-nums">{pagamento.parcela}</TableCell>
                    <TableCell>
                      <span className="block truncate">
                        {pagamento.forma ?? "—"}
                        {pagamento.bandeira && pagamento.ultimosDigitos ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {pagamento.bandeira} ****{pagamento.ultimosDigitos}
                          </span>
                        ) : null}
                      </span>
                      {pagamento.motivoFalha ? (
                        <span className="block truncate text-xs text-destructive">
                          {pagamento.motivoFalha}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {pagamento.pagoEm ? formatarDataHora(pagamento.pagoEm) : (
                        <span className="text-muted-foreground">Pendente</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(pagamento.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CartaoLista>

        <CartaoLista titulo="Contas a receber">
          {venda.contas.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Esta venda ainda nao gerou conta a receber. O lancamento pertence ao modulo financeiro.
            </p>
          ) : (
            <ul className="divide-y">
              {venda.contas.map((conta) => (
                <li key={conta.id} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm">{conta.numero}</span>
                    <span className="text-sm tabular-nums">
                      {formatMoney(conta.restante)}{" "}
                      <span className="text-xs text-muted-foreground">de {formatMoney(conta.total)}</span>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {conta.situacao} · vence {formatarData(conta.vencimento)}
                  </p>
                  {conta.parcelas.length > 1 ? (
                    <ol className="mt-1 space-y-0.5">
                      {conta.parcelas.map((parcela) => (
                        <li key={parcela.numero} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {parcela.numero}/{conta.parcelas.length} · {formatarData(parcela.vencimento)}
                          </span>
                          <span className="tabular-nums">
                            {parcela.restante.isZero() ? "Paga" : formatMoney(parcela.restante)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CartaoLista>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CartaoLista titulo="Fechamento">
          <dl className="divide-y text-sm">
            <Linha rotulo="Subtotal" valor={formatMoney(venda.subtotal)} />
            {venda.desconto.isZero() ? null : <Linha rotulo="Desconto" valor={`- ${formatMoney(venda.desconto)}`} />}
            {venda.frete.isZero() ? null : <Linha rotulo="Frete" valor={formatMoney(venda.frete)} />}
            {venda.tributos.isZero() ? null : <Linha rotulo="Tributos" valor={formatMoney(venda.tributos)} />}
            {venda.retencao.isZero() ? null : <Linha rotulo="Retencao" valor={`- ${formatMoney(venda.retencao)}`} />}
            <Linha rotulo="Total" valor={formatMoney(venda.total)} destaque />
            {/*
              Custo, lucro e margem so aparecem com custo conhecido. Venda de
              rascunho nao tem custo congelado, e mostrar "margem 0%" afirmaria
              que a venda nao deu lucro, que e leitura economica errada — e
              ainda esconderia o caso real: o custo ainda nao foi calculado.
            */}
            {venda.custo.isZero() ? (
              <Linha
                rotulo="Custo e margem"
                valor="Calculado na confirmacao"
                semDestaque
                observacao="Venda sem baixa de estoque"
              />
            ) : (
              <>
                <Linha rotulo="Custo" valor={formatMoney(venda.custo)} />
                <Linha rotulo="Lucro bruto" valor={formatMoney(venda.lucro)} />
                {venda.margem !== null ? (
                  <Linha rotulo="Margem sobre custo" valor={`${formatPercent(venda.margem)}`} />
                ) : null}
              </>
            )}
          </dl>
        </CartaoLista>

        <CartaoLista titulo="Dados da venda">
          <dl className="divide-y text-sm">
            <Linha rotulo="Tipo" valor={venda.tipo} />
            <Linha rotulo="Canal" valor={venda.canal} />
            <Linha rotulo="Filial" valor={venda.filialNome} />
            <Linha rotulo="Vendedor" valor={venda.vendedorNome ?? "—"} />
            <Linha rotulo="Forma de pagamento" valor={venda.formaPagamento ?? "—"} />
            <Linha rotulo="Condicao de pagamento" valor={venda.condicaoPagamento ?? "—"} />
            <Linha rotulo="Data da venda" valor={venda.soldAt ? formatarDataHora(venda.soldAt) : "Sem data"} />
            {venda.entregueEm ? <Linha rotulo="Entregue em" valor={formatarData(venda.entregueEm)} /> : null}
            {venda.canceladaEm ? (
              <Linha
                rotulo="Cancelada em"
                valor={`${formatarData(venda.canceladaEm)}${venda.motivoCancelamento ? ` — ${venda.motivoCancelamento}` : ""}`}
              />
            ) : null}
            <Linha rotulo="Registrada em" valor={formatarDataHora(venda.criadaEm)} />
            {venda.criadaPor ? <Linha rotulo="Registrada por" valor={venda.criadaPor} /> : null}
            {venda.finalidade ? <Linha rotulo="Finalidade" valor={venda.finalidade} /> : null}
            {venda.observacoes ? <Linha rotulo="Observacoes" valor={venda.observacoes} /> : null}
            {venda.observacoesInternas ? (
              <Linha rotulo="Observacoes internas" valor={venda.observacoesInternas} />
            ) : null}
          </dl>
        </CartaoLista>
      </div>

      {venda.notas.length > 0 ? (
        <CartaoLista titulo="Notas fiscais">
          <ul className="divide-y text-sm">
            {venda.notas.map((nota) => (
              <li key={nota.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="font-mono">
                  {nota.serie ? `${nota.serie}/${nota.numero}` : nota.numero}
                  <span className="ml-2 text-xs text-muted-foreground">
                    modelo {nota.modelo} · {nota.direcao}
                  </span>
                </span>
                {/* Tom neutro: a cor por situacao de nota (autorizada, denegada,
                    cancelada) pertence ao modulo fiscal, que e quem define o
                    que cada `FiscalStatus` significa. Aqui a nota e so um
                    referencia — o que a pessoa precisa saber nesta tela e que
                    ela existe, nao a interpretacao do status. */}
                <StatusBadge tom="neutro">{nota.situacao}</StatusBadge>
              </li>
            ))}
          </ul>
        </CartaoLista>
      ) : null}
    </div>
  );
}

/**
 * Itens da venda.
 *
 * A coluna de devolvido existe porque `returnedQuantity` e ACUMULADO e separado
 * do item: um item pode ter sido devolvido parcialmente sem ter saido da venda.
 * Mostrar "2 de 3 devolvidos" no item e melhor que esconder o numero, porque
 * quem olha a venda depois de uma devolucao precisa saber o que ainda vale.
 */
function ItensDaVenda({ venda }: { venda: VendaDetalhe }) {
  if (venda.itens.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        Esta venda nao tem itens gravados.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead className="text-right">Qtd</TableHead>
          <TableHead className="text-right">Preco unit.</TableHead>
          <TableHead className="text-right">Desconto</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Custo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {venda.itens.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <span className="block">{item.descricao}</span>
              {item.produtoSku ? (
                <span className="block font-mono text-xs text-muted-foreground">
                  {item.produtoSku}
                  {item.produtoNome ? ` · ${item.produtoNome}` : ""}
                </span>
              ) : null}
              {item.devolvido.gt(0) ? (
                <span className="block text-xs text-destructive">
                  {formatarQuantidade(item.devolvido)} devolvido
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatarQuantidade(item.quantidade)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(item.precoUnitario)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {item.desconto.isZero() ? "—" : `- ${formatMoney(item.desconto)}`}
            </TableCell>
            <TableCell className="text-right tabular-nums font-medium">{formatMoney(item.total)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {item.custoTotal.isZero() ? "—" : formatMoney(item.custoTotal)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Cartao({
  rotulo,
  valor,
  observacao,
}: {
  rotulo: string;
  valor: string;
  observacao?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {observacao ? <p className="text-xs text-muted-foreground">{observacao}</p> : null}
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  destaque,
  semDestaque,
  observacao,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  semDestaque?: boolean;
  observacao?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-1.5">
      <dt className={destaque ? "font-medium" : "text-muted-foreground"}>
        {rotulo}
        {observacao ? <span className="block text-xs">{observacao}</span> : null}
      </dt>
      <dd className={`text-right tabular-nums ${destaque ? "font-semibold" : ""} ${semDestaque ? "text-xs text-muted-foreground" : ""}`}>
        {valor}
      </dd>
    </div>
  );
}

/** Soma do que falta nas contas a receber desta venda, em Decimal. */
function somaRestante(venda: VendaDetalhe): Decimal {
  return venda.contas.reduce((soma, conta) => soma.plus(conta.restante), toDecimal(0));
}

function contaParcelas(venda: VendaDetalhe): number {
  return venda.contas.reduce((soma, conta) => soma + conta.parcelas.length, 0);
}

/** Quantidade com ate 4 casas, que e a precisao de `Decimal(14,4)`. */
function formatarQuantidade(valor: Decimal): string {
  return quantityToNumber(valor).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Data e hora no fuso de quem fatura. `timeZone` explicito, senão o servidor decide. */
function formatarDataHora(data: Date): string {
  return data.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
