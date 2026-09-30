import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonExcluir } from "@/components/botao-excluir";
import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { atualizarMarca, excluirMarca } from "@/server/app/marcas/actions";
import { CAMPOS_MARCA, valoresDaMarca } from "@/server/app/marcas/campos";
import { buscarMarca } from "@/server/app/marcas/queries";

export default async function PaginaEditarMarca({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await obterContextoOperacao();

  const [podeEditar, podeExcluir] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "marca", acao: "update" }),
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "marca", acao: "delete" }),
  ]);

  if (!podeEditar) notFound();
  const marca = await buscarMarca(ctx.scope, id);
  if (!marca) notFound();

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo={`Editar ${marca.name}`}
        descricao="Renomear a marca nao altera os produtos que ja apontam para ela."
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/marcas">Voltar</Link>
          </Button>
        }
      />

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={atualizarMarca}
            campos={CAMPOS_MARCA}
            valores={valoresDaMarca(marca)}
            camposOcultos={{ id: marca.id }}
            titulo="Editar marca"
            textoEnviar="Salvar alteracoes"
            voltarHref="/cadastros/marcas"
            acoesExtras={
              podeExcluir ? (
                <ButtonExcluir
                  acao={excluirMarca}
                  id={marca.id}
                  rotulo="Excluir marca"
                  confirmacao={`Excluir a marca "${marca.name}"? Se houver produto usando, sera pedido para desativar.`}
                />
              ) : null
            }
          />
        </div>
      </CartaoLista>
    </div>
  );
}
