"use client";

import { useTransition } from "react";
import { Loader2, Power } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Botao que alterna `active` sem sair da listagem.
 *
 * Client Component por causa de `useTransition`: o estado de "alternando" e
 * local, e o `startTransition` faz o React manter a tabela na tela enquanto a
 * action roda, em vez de bloquear a interface. Sem ele, o botao ficaria sem
 * reacao nenhuma durante a escrita — a pessoa clica duas vezes e a segunda
 * desfaz a primeira, que e o pior resultado possivel para um botao de liga e
 * desliga.
 *
 * POR QUE UM `<form>` E NAO `onClick` COM `fetch`
 *
 * A action e uma Server Action, entao o caminho nativo ja seria um `<form
 * action={...}>` e o botao `type="submit"`. O `useTransition` existe para dar
 * o estado de pendencia; a submissao continua sendo o mecanismo do React, sem
 * `fetch`, sem endpoint e sem estado duplicado no cliente.
 *
 * NAO E CONFIRMACAO
 *
 * Desativar e reversivel, entao pedir confirmacao aqui seria atrito sem
 * recompensa. Excluir, que e irreversivel, tem confirmacao — e vive na action de
 * excluir, nao neste botao.
 */
export function AlternarAtividade({
  acao,
  id,
  ativo,
}: {
  acao: (dados: FormData) => Promise<void>;
  id: string;
  ativo: boolean;
}) {
  const [pendente, iniciar] = useTransition();

  return (
    <form
      action={(dados) => {
        iniciar(async () => {
          await acao(dados);
        });
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label={ativo ? "Desativar unidade" : "Ativar unidade"}
        title={ativo ? "Desativar" : "Ativar"}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Power />}
        <span className="sr-only">{ativo ? "Desativar" : "Ativar"}</span>
      </Button>
    </form>
  );
}
