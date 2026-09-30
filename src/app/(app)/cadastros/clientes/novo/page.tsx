import Link from "next/link";
import { notFound } from "next/navigation";

import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { criarCliente } from "@/server/app/clientes/actions";
import { camposCliente } from "@/server/app/clientes/campos";

export default async function PaginaNovoCliente() {
  const ctx = await obterContextoOperacao();

  if (!(await podeOperar(ctx.rbac, { modulo: "CLIENTES", recurso: "cliente", acao: "create" }))) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Novo cliente"
        descricao="Nome e documento bastam. Endereco, inscricoes e telefone podem ficar para depois."
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/clientes">Voltar</Link>
          </Button>
        }
      />

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={criarCliente}
            campos={camposCliente()}
            titulo="Novo cliente"
            textoEnviar="Criar cliente"
            voltarHref="/cadastros/clientes"
          />
        </div>
      </CartaoLista>
    </div>
  );
}
