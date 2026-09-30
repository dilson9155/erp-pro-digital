import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonExcluir } from "@/components/botao-excluir";
import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { atualizarFornecedor, excluirFornecedor } from "@/server/app/fornecedores/actions";
import { camposFornecedor, valoresDoFornecedor } from "@/server/app/fornecedores/campos";
import { buscarFornecedor } from "@/server/app/fornecedores/queries";
import { formatMoney } from "@/lib/money";

/**
 * Edicao de fornecedor.
 *
 * `totalPurchased` e `averageLeadTimeDays` sao DERIVADOS e aparecem como leitura.
 * O prazo medio e a excecao que vale explicar: e media de calculo sobre as
 * compras, e mostrar "0 dias" para quem nunca comprou seria lido como entrega
 * imediata em negociacao. Por isso o card diz "Sem compras registradas" em vez
 * do numero.
 */
export default async function PaginaEditarFornecedor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await obterContextoOperacao();

  const [podeEditar, podeExcluir] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "FORNECEDORES", recurso: "fornecedor", acao: "update" }),
    podeOperar(ctx.rbac, { modulo: "FORNECEDORES", recurso: "fornecedor", acao: "delete" }),
  ]);

  if (!podeEditar) notFound();

  const fornecedor = await buscarFornecedor(ctx.scope, id);
  if (!fornecedor) notFound();

  const semCompras = fornecedor.purchaseCount === 0;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo={`Editar ${fornecedor.name}`}
        descricao={
          fornecedor.tradeName && fornecedor.tradeName !== fornecedor.name
            ? fornecedor.tradeName
            : fornecedor.email ?? undefined
        }
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/fornecedores">Voltar</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Comprado de nos</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(fornecedor.totalPurchased)}</p>
          <p className="text-xs text-muted-foreground">
            {fornecedor.purchaseCount === 1
              ? "1 compra registrada"
              : `${fornecedor.purchaseCount} compras registradas`}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Prazo medio de entrega</p>
          <p className="text-lg font-semibold tabular-nums">
            {semCompras ? "Sem historico" : `${fornecedor.averageLeadTimeDays} dias`}
          </p>
          {semCompras ? (
            <Badge className="mt-1 border-border bg-muted text-muted-foreground">Calculado na compra</Badge>
          ) : null}
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Ultima compra</p>
          <p className="text-lg font-semibold">
            {fornecedor.lastPurchaseAt
              ? fornecedor.lastPurchaseAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Calculado pelo modulo de compras</p>
        </div>
      </div>

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={atualizarFornecedor}
            campos={camposFornecedor()}
            valores={valoresDoFornecedor(fornecedor)}
            camposOcultos={{ id: fornecedor.id }}
            titulo="Editar fornecedor"
            textoEnviar="Salvar alteracoes"
            voltarHref="/cadastros/fornecedores"
            acoesExtras={
              podeExcluir ? (
                <ButtonExcluir
                  acao={excluirFornecedor}
                  id={fornecedor.id}
                  rotulo="Excluir fornecedor"
                  confirmacao={`Excluir o fornecedor "${fornecedor.name}"? Se ja houver compra, nota ou conta a pagar, sera pedido para desativar.`}
                />
              ) : null
            }
          />
        </div>
      </CartaoLista>
    </div>
  );
}
