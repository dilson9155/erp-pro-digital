import Link from "next/link";
import { notFound } from "next/navigation";

import { Formulario } from "@/components/formulario";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { podeOperar, obterContextoOperacao } from "@/server/app/sessao";
import { criarFornecedor } from "@/server/app/fornecedores/actions";
import { camposFornecedor } from "@/server/app/fornecedores/campos";

export default async function PaginaNovoFornecedor() {
  const ctx = await obterContextoOperacao();

  if (
    !(await podeOperar(ctx.rbac, { modulo: "FORNECEDORES", recurso: "fornecedor", acao: "create" }))
  ) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Novo fornecedor"
        descricao="Razao social e CNPJ bastam. Banco e PIX so se a empresa ainda pagar por eles."
        acao={
          <Button asChild variant="outline">
            <Link href="/cadastros/fornecedores">Voltar</Link>
          </Button>
        }
      />

      <CartaoLista>
        <div className="p-6">
          <Formulario
            acao={criarFornecedor}
            campos={camposFornecedor()}
            titulo="Novo fornecedor"
            textoEnviar="Criar fornecedor"
            voltarHref="/cadastros/fornecedores"
          />
        </div>
      </CartaoLista>
    </div>
  );
}
