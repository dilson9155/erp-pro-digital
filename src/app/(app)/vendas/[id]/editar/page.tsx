import Link from "next/link";
import { notFound } from "next/navigation";

import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { FormularioVenda } from "@/components/vendas/formulario-venda";
import type { ItemVendaForm } from "@/components/vendas/formulario-venda";
import { quantityToNumber } from "@/lib/money";
import { obterContextoOperacao, podeOperar } from "@/server/app/sessao";
import { atualizarVendaRascunho } from "@/server/app/vendas/actions";
import { buscarRascunhoVenda, opcoesVenda } from "@/server/app/vendas/queries";

/**
 * Edicao de rascunho.
 *
 * So RASCUNHO abre esta tela. Uma venda confirmada nao e "editada": e cancelada
 * e refeita. A distincao nao e preciosismo de documento — e que o rascunho nao
 * mexeu em estoque, custo, conta a receber nem parcelas, entao trocar os itens
 * e seguro; depois da confirmacao, trocar os itens exigiria estornar a baixa,
 * recalcular custo congelado e refazer o financeiro, e o numero de documento
 * teria que mudar junto.
 *
 * A tela nao formata os valores para edicao: o `FormData` volta do servidor em
 * pt-BR ("1.234,56") porque foi assim que entrou, e `toFixed` produziria
 * "1234.56", que o `CampoMoeda` exibiria cru. Os `Decimal` do banco servem para
 * a aritmetica; a tela precisa do texto.
 */
export default async function PaginaEditarVenda({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await obterContextoOperacao();

  if (!(await podeOperar(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "update" }))) {
    notFound();
  }

  // `null` cobre os dois casos de "nao da para editar": a venda nao existe e a
  // venda ja foi confirmada. O comentario de `buscarRascunhoVenda` explica por
  // que a tela responde `notFound()` para os dois.
  const rascunho = await buscarRascunhoVenda(ctx.scope, id);
  if (rascunho === null) notFound();

  const opcoes = await opcoesVenda(ctx.scope, rascunho.branchId);

  const valores: Record<string, string | undefined> = {
    id: rascunho.id,
    tipo: rascunho.type,
    canal: rascunho.channel,
    clienteId: rascunho.customerId ?? undefined,
    vendedorId: rascunho.sellerId ?? undefined,
    condicaoPagamentoId: rascunho.paymentTermsId ?? undefined,
    formaPagamentoId: rascunho.paymentMethodId ?? undefined,
    data: rascunho.soldAt ? formatarDataInput(rascunho.soldAt) : undefined,
    observacoes: rascunho.notes ?? undefined,
  };

  // Um rascunho sem item nao deveria existir (o schema exige ao menos um), mas
  // se existir por qualquer motivo, a tela abre com uma linha em branco em vez
  // de uma tabela vazia que a pessoa teria de adivinhar como preencher.
  const itens: readonly ItemVendaForm[] =
    rascunho.items.length > 0
      ? rascunho.items.map((item) => ({
          productId: item.productId,
          serviceId: item.serviceId,
          descricao: item.description,
          quantidade: formatarNumero(quantityToNumber(item.quantity), 4),
          precoUnitario: formatarNumero(item.unitPrice.toNumber(), 2),
          desconto: formatarNumero(item.discountAmount.toNumber(), 2),
        }))
      : [
          {
            productId: null,
            serviceId: null,
            descricao: "",
            quantidade: "1",
            precoUnitario: "0,00",
            desconto: "0,00",
          },
        ];

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo={`Editar rascunho ${rascunho.number}`}
        descricao="Itens, valores e condicoes de pagamento. Estoque e financeiro continuam esperando a confirmacao."
        acao={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href={`/vendas/${rascunho.id}`}>Ver venda</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/vendas">Voltar</Link>
            </Button>
          </div>
        }
      />

      <CartaoLista>
        <div className="p-6">
          <FormularioVenda
            acao={atualizarVendaRascunho}
            opcoes={opcoes}
            titulo="Editar rascunho"
            textoEnviar="Salvar rascunho"
            voltarHref={`/vendas/${rascunho.id}`}
            valores={valores}
            itensIniciais={itens}
          />
        </div>
      </CartaoLista>
    </div>
  );
}

/**
 * `1234.5` -> `"1.234,5"`, com no maximo as casas pedidas.
 *
 * O `minimumFractionDigits: 0` e deliberado: a descricao do item recebe "10" e
 * nao "10,0000", e o `<input>` de quantidade precisa mostrar o que o vendedor
 * digitou. O que o campo mostra e para a pessoa conferir; quem compara com
 * precisao e o Zod e o `Decimal`, no servidor.
 */
function formatarNumero(valor: number, casas: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/** `Date` -> `"2024-03-15"`, o que `<input type="date">` espera. */
function formatarDataInput(data: Date): string {
  return data.toISOString().slice(0, 10);
}
