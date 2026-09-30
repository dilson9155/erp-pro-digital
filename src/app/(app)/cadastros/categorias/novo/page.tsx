import Link from "next/link";
import { notFound } from "next/navigation";

import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { criarCategoria } from "@/server/app/categorias/actions";
import { CAMPOS_CATEGORIA, comOpcoesDePai } from "@/server/app/categorias/campos";
import { opcoesCategoriaPai } from "@/server/app/categorias/queries";

/**
 * Cadastro de categoria.
 *
 * As opcoes de categoria pai sao carregadas AQUI e passadas para a spec, e nao
 * buscadas dentro de `CAMPOS_CATEGORIA`. A spec precisa continuar sendo dado puro
 * — e o que a permite atravessar a fronteira server/client e o que impede uma
 * lista de categorias de entrar no bundle do navegador junto com a tela.
 */
export default async function PaginaNovaCategoria() {
  const ctx = await obterContextoOperacao();

  if (!(await podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "categoria", acao: "create" }))) {
    notFound();
  }

  const opcoesPai = await opcoesCategoriaPai(ctx.scope);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Nova categoria"
        descricao="Deixe a categoria pai vazia para criar uma categoria de primeiro nivel."
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/categorias">Voltar</Link>
          </Button>
        }
      />

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={criarCategoria}
            campos={comOpcoesDePai(CAMPOS_CATEGORIA, opcoesPai)}
            titulo="Nova categoria"
            textoEnviar="Criar categoria"
            voltarHref="/cadastros/categorias"
          />
        </div>
      </CartaoLista>
    </div>
  );
}
