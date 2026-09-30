import Link from "next/link";
import { notFound } from "next/navigation";

import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { criarMarca } from "@/server/app/marcas/actions";
import { CAMPOS_MARCA } from "@/server/app/marcas/campos";

export default async function PaginaNovaMarca() {
  const ctx = await obterContextoOperacao();

  if (!(await podeOperar(ctx.rbac, { modulo: "ESTOQUE", recurso: "marca", acao: "create" }))) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Nova marca"
        descricao="Somente o nome e obrigatorio. O resto e para integracao e exibicao."
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/marcas">Voltar</Link>
          </Button>
        }
      />

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={criarMarca}
            campos={CAMPOS_MARCA}
            titulo="Nova marca"
            textoEnviar="Criar marca"
            voltarHref="/cadastros/marcas"
          />
        </div>
      </CartaoLista>
    </div>
  );
}
