import Link from "next/link";
import { notFound } from "next/navigation";

import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { ButtonExcluir } from "@/components/botao-excluir";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { atualizarUnidade, excluirUnidade } from "@/server/app/unidades/actions";
import { CAMPOS_UNIDADE, valoresDaUnidade } from "@/server/app/unidades/campos";
import { buscarUnidade } from "@/server/app/unidades/queries";

/**
 * Edicao de unidade de medida.
 *
 * O `id` vai em campo OCULTO do formulario, e nao na URL da action. E o que
 * permite a tela de edicao e a de cadastro compartilharem o mesmo componente
 * `Formulario` e a mesma action base: o que muda e so quem supply os valores.
 *
 * A URL continua sendo a fonte da verdade de QUAL registro — a action nunca
 * aceita o id que veio do navegador sem antes conferir que ele existe no tenant
 * (`findFirst` com `deletedAt: null`). Confiar no id escondido porque "ninguem
 * consegue editar os outros" seria exatamente o tipo de bug que o guard existe
 * para impedir, e a interface nao e a fronteira de confianca.
 */
export default async function PaginaEditarUnidade({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await obterContextoOperacao();

  const [podeEditar, podeExcluir] = await Promise.all([
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "unidade", acao: "update" }),
    podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "unidade", acao: "delete" }),
  ]);

  // `notFound()` e nao um "registro nao encontrado" estilizado. A rota existe e o
  // registro nao, entao a resposta 404 e a que o roteador espera — e uma pagina
  // de erro com HTTP 200 faria o buscador indexar uma tela que so existe por
  // causa de um id apagado.
  if (!podeEditar) notFound();
  const unidade = await buscarUnidade(ctx.scope, id);
  if (!unidade) notFound();

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo={`Editar unidade ${unidade.name}`}
        descricao="O simbolo aparece nas vendas e nos relatorios a partir de agora."
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/unidades">Voltar</Link>
          </Button>
        }
      />

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={atualizarUnidade}
            campos={CAMPOS_UNIDADE}
            valores={valoresDaUnidade(unidade)}
            camposOcultos={{ id: unidade.id }}
            titulo="Editar unidade de medida"
            textoEnviar="Salvar alteracoes"
            voltarHref="/cadastros/unidades"
            acoesExtras={
              podeExcluir ? (
                <ButtonExcluir
                  acao={excluirUnidade}
                  id={unidade.id}
                  rotulo="Excluir unidade"
                  confirmacao={`Excluir a unidade "${unidade.name}"? Se houver produto usando, sera pedido para desativar.`}
                />
              ) : null
            }
          />
        </div>
      </CartaoLista>
    </div>
  );
}
