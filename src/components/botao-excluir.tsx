"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EstadoFormulario } from "@/lib/formulario";

/**
 * Botao de exclusao com confirmacao.
 *
 * `<form>` PROPRIO, E NAO UM BOTAO DENTRO DO FORMULARIO DE EDICAO
 *
 * O HTML nao permite aninhar `<form>`, entao esta precisa ser um formulario
 * separado. Ele convive com o formulario de edicao porque os dois sao
 * independentes: salvar e excluir sao decisoes diferentes, e quem exclui
 * raramente pretendia salvar. Se fossem o mesmo formulario, o `Excluir` teria de
 * enviar todos os campos, e a action de exclusao receberia dados de edicao que
 * nao sao dela.
 *
 * POR QUE A CONFIRMACAO NAO E `window.confirm`
 *
 * `window.confirm` e bloqueante, tem aparencia de sistema operativo e some do
 * historico de tela. Num ERP, quem clica em "Excluir" por engano precisa de uma
 * segunda intencao explicita, e o dialogo precisa poder exibir o NOME do
 * registro: "excluir esta unidade" e "excluir alguma coisa" sao coisas muito
 * diferentes para quem esta decidindo.
 *
 * `confirmacao` e o texto que descreve a CONSEQUENCIA, incluindo a parte chata.
 * Dizer "tem produto usando, vai pedir para desativar" evita a surpresa de um
 * erro numa operacao que a pessoa achava trivial.
 *
 * POR QUE A EXCLUSAO PRECISA DE DOIS ESTADOS, E NAO DE UM
 *
 * `confirmado` e uma tela, e o envio e um pedido. Sao estados diferentes porque
 * a resposta do servidor (recusou por estar em uso) e o terceiro estado, que
 * precisa aparecer SEM voltar para a primeira pergunta — quem recusou por causa
 * de produto vinculado tem de ler o motivo, e nao responder de novo a uma
 * pergunta que ele ja respondeu. Por isso o erro vive em `erro` e o botao
 * permanece no estado de confirmacao.
 */
export function ButtonExcluir({
  acao,
  id,
  rotulo,
  confirmacao,
}: {
  acao: (estado: EstadoFormulario | null, dados: FormData) => Promise<EstadoFormulario>;
  id: string;
  rotulo: string;
  /** Texto do dialogo. Descreva a consequencia, nao apenas o verbo. */
  confirmacao: string;
}) {
  const [confirmado, definirConfirmado] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);
  const [pendente, iniciarEnvio] = useTransition();

  function confirmar() {
    definirErro(null);
    definirConfirmado(true);
  }

  function cancelar() {
    definirErro(null);
    definirConfirmado(false);
  }

  function enviar(dados: FormData) {
    iniciarEnvio(async () => {
      const resultado = await acao(null, dados);
      // A action de excluir redireciona no sucesso, entao chegar aqui significa
      // que o servidor recusou. A tela de confirmacao permanece, e o motivo
      // aparece embaixo.
      if (resultado.tipo === "erro") {
        definirErro(resultado.mensagem);
        return;
      }
      definirErro(null);
    });
  }

  if (!confirmado) {
    return (
      <Button type="button" variant="outline" onClick={confirmar}>
        <Trash2 />
        {rotulo}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <form action={enviar} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <span className="text-sm text-muted-foreground">{confirmacao}</span>
        <Button type="submit" variant="destructive" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : null}
          {pendente ? "Excluindo..." : "Confirmar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancelar} disabled={pendente}>
          Cancelar
        </Button>
      </form>
      {erro ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
