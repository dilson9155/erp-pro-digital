import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonExcluir } from "@/components/botao-excluir";
import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { atualizarCliente, excluirCliente } from "@/server/app/clientes/actions";
import { camposCliente, valoresDoCliente } from "@/server/app/clientes/campos";
import { buscarCliente } from "@/server/app/clientes/queries";
import { formatMoney, moneyEquals } from "@/lib/money";

/**
 * Edicao de cliente.
 *
 * Os DERIVADOS ficam visiveis e explicitamente fora do formulario: total
 * comprado, saldo em aberto e numero de compras. Sao recalculados por job a
 * partir de `Sale`, e aceita-los no formulario criaria dois verdadeiros — o
 * pior deles e o "cliente sem saldo" que existe porque alguem digitou zero, e que
 * some no primeiro recebimento.
 */
export default async function PaginaEditarCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await obterContextoOperacao();

  const [podeEditar, podeExcluir] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "CLIENTES", recurso: "cliente", acao: "update" }),
    podeOperar(ctx.rbac, { modulo: "CLIENTES", recurso: "cliente", acao: "delete" }),
  ]);

  if (!podeEditar) notFound();

  const cliente = await buscarCliente(ctx.scope, id);
  if (!cliente) notFound();

  const semSaldo = moneyEquals(cliente.totalDebt, 0);
  const semCompras = cliente.purchaseCount === 0;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo={`Editar ${cliente.name}`}
        descricao={
          cliente.tradeName && cliente.tradeName !== cliente.name
            ? cliente.tradeName
            : cliente.email ?? undefined
        }
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/clientes">Voltar</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Saldo em aberto</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(cliente.totalDebt)}</p>
          {semSaldo ? (
            <Badge className="mt-1 border-border bg-muted text-muted-foreground">Sem debito</Badge>
          ) : null}
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Total comprado</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(cliente.totalPurchased)}</p>
          <p className="text-xs text-muted-foreground">
            {cliente.purchaseCount === 1 ? "1 compra registrada" : `${cliente.purchaseCount} compras registradas`}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Limite de credito</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(cliente.creditLimit)}</p>
          {semCompras ? (
            <Badge className="mt-1 border-border bg-muted text-muted-foreground">Sem historico</Badge>
          ) : null}
        </div>
      </div>

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={atualizarCliente}
            campos={camposCliente()}
            valores={valoresDoCliente(cliente)}
            camposOcultos={{ id: cliente.id }}
            titulo="Editar cliente"
            textoEnviar="Salvar alteracoes"
            voltarHref="/cadastros/clientes"
            acoesExtras={
              podeExcluir ? (
                <ButtonExcluir
                  acao={excluirCliente}
                  id={cliente.id}
                  rotulo="Excluir cliente"
                  confirmacao={`Excluir o cliente "${cliente.name}"? Se ja houver venda, nota ou conta a receber, sera pedido para desativar.`}
                />
              ) : null
            }
          />
        </div>
      </CartaoLista>
    </div>
  );
}
