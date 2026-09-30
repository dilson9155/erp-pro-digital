import Link from "next/link";
import { notFound } from "next/navigation";

import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { FormularioVenda } from "@/components/vendas/formulario-venda";
import { obterContextoOperacao, podeOperar } from "@/server/app/sessao";
import { criarVenda } from "@/server/app/vendas/actions";
import { opcoesVenda } from "@/server/app/vendas/queries";

/**
 * Nova venda.
 *
 * A tela nasce em RASCUNHO e nao em CONFIRMADA, e a diferenca e de responsabilidade:
 * a pessoa que abriu a tela pode nao ter o cliente na frente, pode aindaestar
 * negociando o preco, e um "salvar" que ja baixa estoque e cria conta a receber
 * transformaria cada rascunho em compromisso financeiro.
 *
 * O fluxo e: preencher, "Criar rascunho", conferir na tela de detalhe,
 * "Confirmar venda". Confirmar e o unico ponto em que o estoque e o financeiro
 * entram.
 */
export default async function PaginaNovaVenda() {
  const ctx = await obterContextoOperacao();

  if (!(await podeOperar(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "create" }))) {
    notFound();
  }

  // `ctx.branchId` e sempre preenchido dentro de `(app)`: `obterContextoOperacao`
  // exige sessao com empresa E filial, e redireciona se faltar uma. Nao ha
  // guarda para "filial nao escolhida" aqui, e a razao e que o guarda seria
  // codigo morto: a unica forma de chegar nesta pagina sem filial e nao chegar.
  // A venda nasce na filial ativa — a mesma em que o `stock_items` sera
  // debitado na confirmacao.
  const opcoes = await opcoesVenda(ctx.scope, ctx.branchId);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Nova venda"
        descricao="A venda e salva como rascunho. Estoque e financeiro entram na confirmacao."
        acao={
          <Button asChild variant="outline">
            <Link href="/vendas">Voltar</Link>
          </Button>
        }
      />

      <CartaoLista>
        <div className="p-6">
          <FormularioVenda
            acao={criarVenda}
            opcoes={opcoes}
            titulo="Nova venda"
            textoEnviar="Criar rascunho"
            voltarHref="/vendas"
          />
        </div>
      </CartaoLista>
    </div>
  );
}
