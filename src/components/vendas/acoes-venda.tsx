"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EstadoFormulario } from "@/lib/formulario";

/**
 * Botoes que agem sobre a venda: confirmar, receber, cancelar, excluir rascunho.
 *
 * Sao Client Components porque chamam Server Actions direto, com
 * `useActionState`: cada acao e um `<form>` proprio, e o resultado e um
 * `redirect` de volta para a propria venda.
 *
 * POR QUE CADA ACAO E UM FORM SEPARADO
 *
 * Uma unica `<form>` com tres botoes teria que descobrir, no servidor, qual
 * botao foi clicado. `FormData` so carrega os campos que TEM valor, e o
 * botao que dispara o envio e o que carregaria `acao` — mas ai o botao
 * "cancelar" do rodape do formulario de edicao, que existe so para voltar a
 * lista, passaria a ser lido como "cancelar a venda". Nomes separados em
 * formularios separados tornam impossivel essa confusao.
 *
 * CADA BOTAO PRECISA DO SEU `<form>`
 *
 * O `formAction` de um `<button>` so funciona quando existe um `<form>`
 * ancestral. Renderizado fora de um, o botao nao envia nada: o clique nao
 * chama a action e nenhum erro aparece — a falha e silenciosa, que e o pior
 * tipo. E o `<input type="hidden">` fica DENTRO do `<button>`, que e um
 * conteudo nao interativo; o navegador nao o associa ao form. Por isso os
 * dois botoes de rascunho estao aqui dentro de `<form action={...}>`, e o
 * `id` e um input irmao do botao, nao filho dele.
 */

export interface PropsAcoesVenda {
  readonly vendaId: string;
  readonly status: string;
  readonly podeEditar: boolean;
  readonly podeCancelar: boolean;
  /** Saldo em aberto ja formatado, usado como valor padrao do recebimento. */
  readonly saldo: string;
  readonly quitada: boolean;
  readonly formasPagamento: readonly { readonly value: string; readonly rotulo: string }[];
  readonly confirmar: (dados: FormData) => Promise<EstadoFormulario>;
  readonly receber: (dados: FormData) => Promise<EstadoFormulario>;
  readonly cancelar: (dados: FormData) => Promise<EstadoFormulario>;
  readonly removerRascunho?: (dados: FormData) => Promise<EstadoFormulario>;
}

export function AcoesVenda(props: PropsAcoesVenda) {
  // `useActionState` exige `(estado, FormData)`. As actions de venda recebem so
  // o `FormData` e o estado anterior e `_` — mas o HOOK ainda precisa dos dois
  // argumentos, entao cada action e embrulhada em um adaptador. Sem o adaptador
  // o `estado` viraria o `FormData` na chamada, e a action leria `dados.get` de
  // um objeto que nao tem `get`.
  const [estadoConfirmar, confirmar] = useActionState<EstadoFormulario | null, FormData>(
    (_estado, dados) => props.confirmar(dados),
    null,
  );
  const [estadoReceber, receber] = useActionState<EstadoFormulario | null, FormData>(
    (_estado, dados) => props.receber(dados),
    null,
  );
  const [estadoCancelar, cancelar] = useActionState<EstadoFormulario | null, FormData>(
    (_estado, dados) => props.cancelar(dados),
    null,
  );
  // Rascunho excluido e o caso raro: o botao so existe quando a action foi
  // passada. Sem `removerRascunho`, o `useActionState` precisaria de uma action
  // de qualquer forma — e a de cancelar serviria, porque o botao nao e
  // renderizado. E uma action que nunca e chamada, nao um stub silencioso.
  const [estadoRemover, remover] = useActionState<EstadoFormulario | null, FormData>(
    (_estado, dados) => (props.removerRascunho ?? props.cancelar)(dados),
    null,
  );

  const erro = estadoConfirmar !== null && estadoConfirmar.tipo === "erro" ? estadoConfirmar : null;
  const erroReceber = estadoReceber !== null && estadoReceber.tipo === "erro" ? estadoReceber : null;
  const erroCancelar = estadoCancelar !== null && estadoCancelar.tipo === "erro" ? estadoCancelar : null;
  const erroRemover = estadoRemover !== null && estadoRemover.tipo === "erro" ? estadoRemover : null;

  // `PENDENTE` entra como rascunho: nao baixou estoque e ainda nao gerou
  // financeiro, entao confirmar e cancelar valem exatamente como no rascunho.
  const eRascunho = props.status === "RASCUNHO" || props.status === "PENDENTE";
  const eConfirmada =
    props.status === "CONFIRMADA" || props.status === "CONCLUIDA" || props.status === "ENTREGUE";

  return (
    <div className="space-y-3">
      {erro ? <Alerta>{erro.mensagem}</Alerta> : null}
      {erroReceber ? <Alerta>{erroReceber.mensagem}</Alerta> : null}
      {erroCancelar ? <Alerta>{erroCancelar.mensagem}</Alerta> : null}
      {erroRemover ? <Alerta>{erroRemover.mensagem}</Alerta> : null}

      {/*
        Confirmar e excluir sao UM form so, com um botao por action. Um `<form>`
        tem UM `action`; o botao que declara `formAction` sobrepoe. Isso mantem o
        `id` num unico input irmao dos dois botoes — em vez de duplicado em dois
        forms, onde os dois botoes de rascunho precisariam de `id` proprio.

        O checkbox "Receber agora" e a forma sao do BOTAO de confirmar: quando
        marcados, `confirmarVenda` baixa o estoque E registra o pagamento da
        primeira parcela na mesma transacao — o caminho do balcao, em que
        confirmar e receber nao sao dois momentos. Excluir ignora os dois, e o
        `FormData` de um form so carrega os campos com valor, entao um rascunho
        confirmado SEM o checkbox continua indo so para o recebimento posterior.
      */}
      {eRascunho && props.podeEditar ? (
        <form action={confirmar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={props.vendaId} />
          {props.formasPagamento.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name="receberAgora"
                  value="on"
                  aria-label="Registrar recebimento junto com a confirmacao"
                />
                Receber agora
              </label>
              <label className="space-y-0.5">
                <span className="block text-xs text-muted-foreground">Forma de entrada</span>
                <select
                  name="formaPagamentoId"
                  aria-label="Forma de pagamento do recebimento imediato"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue=""
                >
                  <option value="">Selecione</option>
                  {props.formasPagamento.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <BotaoConfirmar />
          {props.removerRascunho ? <BotaoExcluir action={remover} /> : null}
        </form>
      ) : null}

      {eConfirmada && !props.quitada ? (
        <form action={receber} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={props.vendaId} />
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-muted-foreground">Receber agora (R$)</span>
            <input
              name="valor"
              inputMode="decimal"
              defaultValue={props.saldo}
              aria-label="Valor a receber"
              className="h-9 w-36 rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-muted-foreground">Forma</span>
            <select
              name="formaPagamentoId"
              aria-label="Forma de pagamento do recebimento"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue=""
            >
              <option value="">Selecione</option>
              {props.formasPagamento.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </label>
          <Botao type="submit" texto="Registrar recebimento" nome="registrar" />
        </form>
      ) : null}

      {props.podeCancelar && (eRascunho || eConfirmada) ? (
        <form action={cancelar} className="flex flex-wrap items-end gap-2 border-t pt-3">
          <input type="hidden" name="id" value={props.vendaId} />
          <label className="min-w-64 flex-1 space-y-1 text-sm">
            <span className="block text-xs text-muted-foreground">Motivo do cancelamento</span>
            <input
              name="motivo"
              required
              placeholder="Obrigatorio: fica registrado no historico da venda"
              aria-label="Motivo do cancelamento"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
          <Botao type="submit" texto="Cancelar venda" nome="cancelar" variante="destructive" />
        </form>
      ) : null}

      {/*
        A mensagem de "quitada" fica no lugar do formulario de recebimento, e
        nao some: e a resposta a pergunta que a pessoa abriu a tela para fazer.
      */}
      {eConfirmada && props.quitada ? (
        <p className="text-sm text-muted-foreground">Esta venda nao tem saldo a receber.</p>
      ) : null}
    </div>
  );
}

function Alerta({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  );
}

/**
 * Botao de confirmacao: usa o `action` do form, sem `formAction` proprio.
 */
function BotaoConfirmar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? "Confirmando..." : "Confirmar venda"}
    </Button>
  );
}

/**
 * Botao de exclusao, que chama a OUTRA action do mesmo form.
 *
 * O `formAction` do botao sobrepoe o `action` do `<form>`, que e exatamente o
 * mecanismo para duas acoes num form so. E preciso AGORA porque o form existe:
 * o `id` e um input irmao do botao, entao acompanha a submissao, e o
 * `formAction` decide para qual action vai.
 */
function BotaoExcluir({ action }: { action: (dados: FormData) => void }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" formAction={action} variant="destructive" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? "Excluindo..." : "Excluir rascunho"}
    </Button>
  );
}

function Botao({
  type,
  texto,
  nome,
  variante,
}: {
  type: "submit";
  texto: string;
  nome: string;
  variante?: "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type={type} name={nome} variant={variante} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? "Aguarde..." : texto}
    </Button>
  );
}
