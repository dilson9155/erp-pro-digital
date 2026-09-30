import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonExcluir } from "@/components/botao-excluir";
import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { atualizarCategoria, excluirCategoria } from "@/server/app/categorias/actions";
import {
  CAMPOS_CATEGORIA,
  comOpcoesDePai,
  valoresDaCategoria,
} from "@/server/app/categorias/campos";
import { buscarCategoria, opcoesCategoriaPai } from "@/server/app/categorias/queries";

export default async function PaginaEditarCategoria({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await obterContextoOperacao();

  const [podeEditar, podeExcluir] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "categoria", acao: "update" }),
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "categoria", acao: "delete" }),
  ]);

  if (!podeEditar) notFound();
  const categoria = await buscarCategoria(ctx.scope, id);
  if (!categoria) notFound();

  // A propria categoria e seus descendentes saem das opcoes: escolher um
  // descendente como pai criaria um ciclo, e o `<select>` esconde a opcao para
  // nao oferecer uma escolha invalida. O servidor recusa de novo, em
  // `validarArvore` — esconder resolve o caso comum, recusar resolve o resto.
  const opcoesPai = await opcoesCategoriaPai(ctx.scope, categoria.id);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo={`Editar ${categoria.name}`}
        descricao="Renomear a categoria nao altera os produtos que ja apontam para ela."
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/categorias">Voltar</Link>
          </Button>
        }
      />

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={atualizarCategoria}
            campos={comOpcoesDePai(CAMPOS_CATEGORIA, opcoesPai)}
            valores={valoresDaCategoria(categoria)}
            camposOcultos={{ id: categoria.id }}
            titulo="Editar categoria"
            textoEnviar="Salvar alteracoes"
            voltarHref="/cadastros/categorias"
            acoesExtras={
              podeExcluir ? (
                <ButtonExcluir
                  acao={excluirCategoria}
                  id={categoria.id}
                  rotulo="Excluir categoria"
                  confirmacao={`Excluir "${categoria.name}"? Se houver produto, subcategoria ou servico usando, sera pedido para desativar.`}
                />
              ) : null
            }
          />
        </div>
      </CartaoLista>
    </div>
  );
}
