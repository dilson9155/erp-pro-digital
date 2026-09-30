import Link from "next/link";
import { notFound } from "next/navigation";

import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { criarProduto } from "@/server/app/produtos/actions";
import { camposProduto } from "@/server/app/produtos/campos";
import { opcoesProduto } from "@/server/app/produtos/queries";

export default async function PaginaNovoProduto() {
  const ctx = await obterContextoOperacao();

  if (!(await podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "produto", acao: "create" }))) {
    notFound();
  }

  const opcoes = await opcoesProduto(ctx.scope);

  // Sem nenhuma unidade cadastrada, o `<select>` obrigatorio viria vazio e a
  // pessoa nao teria como sair do erro. Dizer o que fazer e melhor que um campo
  // que nao tem como ser preenchido.
  if (opcoes.unidades.length === 0) {
    return (
      <div className="space-y-6">
        <CabecalhoPagina
          titulo="Novo produto"
          descricao="Antes do produto, a unidade de medida."
          acao={
            <Button asChild variant="outline">
              <Link href="/cadastros/produtos">Voltar</Link>
            </Button>
          }
        />
        <CartaoLista>
          <div className="space-y-3 p-6 text-sm">
            <p className="font-medium">Nenhuma unidade de medida cadastrada.</p>
            <p className="text-muted-foreground">
              Unidade e obrigatoria no produto: e ela que diz se o saldo e uma caixa
              inteira ou meio quilo. Cadastre uma unidade e volte.
            </p>
            <Button asChild>
              <Link href="/cadastros/unidades/novo">Cadastrar unidade</Link>
            </Button>
          </div>
        </CartaoLista>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Novo produto"
        descricao="So SKU, nome, unidade e preco sao obrigatorios. O resto e opcional."
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/produtos">Voltar</Link>
          </Button>
        }
      />

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={criarProduto}
            campos={camposProduto(opcoes)}
            titulo="Novo produto"
            textoEnviar="Criar produto"
            voltarHref="/cadastros/produtos"
          />
        </div>
      </CartaoLista>
    </div>
  );
}
