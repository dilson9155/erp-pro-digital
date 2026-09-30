import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonExcluir } from "@/components/botao-excluir";
import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { atualizarProduto, excluirProduto } from "@/server/app/produtos/actions";
import { camposProduto, valoresDoProduto } from "@/server/app/produtos/campos";
import { buscarProduto, opcoesProduto } from "@/server/app/produtos/queries";
import { formatMoney, moneyEquals } from "@/lib/money";
import { toQuantity } from "@/lib/money";

/**
 * Quantidade com a unidade.
 *
 * `formatMoney` arredonda para 2 casas (`MONEY_SCALE`), e um saldo de kilo nao
 * cabe em 2 casas: "0,125 kg" viraria "0,13 kg" na tela, e a pessoa leria um
 * numero diferente do que o saldo tem. `toQuantity` preserva as 4 casas de
 * `QUANTITY_SCALE`, que e a precisao que o saldo e gravado.
 */
function saldo(valor: Parameters<typeof toQuantity>[0], unidade: string): string {
  return `${toQuantity(valor).toString().replace(".", ",")} ${unidade}`;
}

export default async function PaginaEditarProduto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await obterContextoOperacao();

  const [podeEditar, podeExcluir] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "produto", acao: "update" }),
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "produto", acao: "delete" }),
  ]);

  if (!podeEditar) notFound();

  const [produto, opcoes] = await Promise.all([buscarProduto(ctx.scope, id), opcoesProduto(ctx.scope)]);
  if (!produto) notFound();

  // Os numeros derivados ficam visiveis e explicitamente fora do formulario.
  // Esconder o saldo de quem esta editando o preco leva a mudanca de preco sem
  // ninguem perceber que mexeu no item errado; e mostrar um campo editable que o
  // job sobrescreve invites o erro oposto.
  const semPreco = moneyEquals(produto.unitPrice, 0);
  const semEstoque = moneyEquals(produto.totalStock, 0);
  const unidades = produto.unit.name;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo={`Editar ${produto.name}`}
        descricao={`SKU ${produto.sku}`}
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/produtos">Voltar</Link>
          </Button>
        }
      />

      {/*
        Os derivados sao mostrados, e nao editaveis. Esta e a unica forma de a
        pessoa ver que o saldo real diverge do que ela espera depois de uma
        movimentacao, sem abrir o modulo de estoque.
      */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Preco cadastrado</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(produto.unitPrice)}</p>
          {semPreco ? (
            <Badge className="mt-1 border-amber-200 bg-amber-50 text-amber-800">Sem preco</Badge>
          ) : null}
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Saldo total</p>
          <p className="text-lg font-semibold tabular-nums">
            {saldo(produto.totalStock, unidades)}
          </p>
          <p className="text-xs text-muted-foreground">
            nesta filial: {saldo(produto.currentStock, unidades)}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Custo medio</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(produto.averageCost)}</p>
          {semEstoque ? (
            <Badge className="mt-1 border-border bg-muted text-muted-foreground">Sem movimentacao</Badge>
          ) : null}
        </div>
      </div>

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={atualizarProduto}
            campos={camposProduto(opcoes)}
            valores={valoresDoProduto(produto)}
            camposOcultos={{ id: produto.id }}
            titulo="Editar produto"
            textoEnviar="Salvar alteracoes"
            voltarHref="/cadastros/produtos"
            acoesExtras={
              podeExcluir ? (
                <ButtonExcluir
                  acao={excluirProduto}
                  id={produto.id}
                  rotulo="Excluir produto"
                  confirmacao={`Excluir o produto "${produto.name}"? Se ja houver venda ou movimentacao de estoque, sera pedido para desativar.`}
                />
              ) : null
            }
          />
        </div>
      </CartaoLista>
    </div>
  );
}
