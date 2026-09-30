/**
 * Contrato de retorno das Server Actions de formulario.
 *
 * Este tipo e o unico lugar do projeto que decide como um formulario conta ao
 * usuario que algo deu errado. Antes dele havia dois jeitos de fazer a mesma
 * coisa — `throw new Error` e `{ ok: false }` — e cada action escolhia um, o que
 * fazia o formulario tratar os dois de forma diferente e inconsistente.
 *
 * POR QUE "ERRO" E UM ESTADO, E NAO UMA EXCECAO
 *
 * Uma excecao neste fluxo e indistinguivel de um bug: o `error.tsx` de borda
 * assume que a tela quebrou, mostra "algo deu errado" e oferece recarregar. Mas
 * "CNPJ ja cadastrado" nao e bug, e responder a ele com tela de erro faz a pessoa
 * acreditar que o sistema caiu. `EstadoFormulario.tipo` separa os dois: erro de
 * entrada e dados, bug e excecao.
 *
 * POR QUE `mensagem` E OBRIGATORIO NO ERRO
 *
 * Um `mensagem?: string` opcional permitiria devolver `{ tipo: "erro" }` sem
 * dizer nada, e o formulario mostraria um alerta vazio — pior que nao mostrar
 * nada, porque aparenta ter havido uma mensagem. Obrigatoria aqui significa que o
 * compilador cobra o texto no mesmo ponto onde o erro e criado.
 *
 * POR QUE `campos` E `Record<string, string[]>` E NAO `string`
 *
 * `nomeDoCampo: string` e o tipo tentador, mas quebra no primeiro caso real: um
 * CPF tem o formato errado E ja existe. Com `string`, o segundo erro sobrescreve o
 * primeiro, e a pessoa corrige o CPF, envia de novo, e so entao descobre que o
 * CPF estava certo e o conflito que importava. O array mostra os dois de uma vez.
 *
 * `valores` existe pelo mesmo motivo: quando o servidor rejeita, o que a pessoa
 * digitou precisa voltar. Sem ele, todo erro limpa o formulario inteiro e
 * obrigaria a redigitar doze campos para corrigir um.
 */
export type EstadoFormulario =
  | {
      readonly tipo: "erro";
      /** Texto para a pessoa. Vazio nao e permitido: ver o comentario acima. */
      readonly mensagem: string;
      /** Erros por campo, no formato que o Zod devolve. */
      readonly campos?: Readonly<Record<string, readonly string[]>>;
      /** Valores digitados, para o formulario nao limpar o que ja foi preenchido. */
      readonly valores?: Readonly<Record<string, string | undefined>>;
    }
  | {
      readonly tipo: "ok";
      readonly mensagem?: string;
    };

/**
 * Assinatura que `useActionState` exige de uma action.
 *
 * O primeiro parametro e o estado anterior, e nao um detalhe da assinatura: e o
 * que permite a action saber que ja esta sendo reenviada depois de um erro, e
 * nao de uma submissao nova. `Promise` porque toda Server Action e assincrona —
 * mesmo as que so validam texto.
 */
export type AcaoServidor = (
  estadoAnterior: EstadoFormulario | null,
  dados: FormData,
) => Promise<EstadoFormulario>;

/** Erro de regra de negocio, para o mesmo tratamento de "erro" do formulario. */
export class ErroDeNegocio extends Error {
  readonly campo: string | undefined;

  constructor(mensagem: string, campo?: string) {
    super(mensagem);
    this.name = "ErroDeNegocio";
    this.campo = campo;
  }
}
