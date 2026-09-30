import Link from "next/link";

import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { criarUnidade } from "@/server/app/unidades/actions";
import { CAMPOS_UNIDADE } from "@/server/app/unidades/campos";
import { notFound } from "next/navigation";

/**
 * Cadastro de unidade de medida.
 *
 * A checagem de permissao acontece AQUI, na pagina, e nao so na action. Sao
 * dois portoes com funcoes diferentes:
 *
 * - a action e quem BLOQUEIA a escrita (`requirePermission` lanca 403);
 * - a pagina e quem esconde a TELA.
 *
 * Sem a checagem na pagina, um usuario sem permissao de criacao veria o
 * formulario, preencheria tudo e so descobriria o 403 ao enviar. Com ela, a tela
 * nao existe para quem nao pode usa-la — e `notFound()` em vez de uma tela de
 * "sem acesso" e deliberado: para quem nao tem permissao, a informacao de que a
 * rota existe ja e mais do que o necessario.
 */
export default async function PaginaNovaUnidade() {
  const ctx = await obterContextoOperacao();

  if (!(await podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "unidade", acao: "create" }))) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Nova unidade de medida"
        descricao="A sigla usada em produtos e servicos. Cadastre antes de criar produtos."
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/unidades">Voltar</Link>
          </Button>
        }
      />

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={criarUnidade}
            campos={CAMPOS_UNIDADE}
            titulo="Nova unidade de medida"
            textoEnviar="Criar unidade"
            voltarHref="/cadastros/unidades"
          />
        </div>
      </CartaoLista>
    </div>
  );
}
