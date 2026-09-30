import type { ZodType } from "zod";

import { AppError, ErrorCode, isAppError } from "@/lib/errors";
import { type EstadoFormulario } from "@/lib/formulario";

/**
 * Ponte entre o Zod, o `FormData` e o `EstadoFormulario`.
 *
 * POR QUE ISTO E UM MODULO E NAO UM HELPER DENTRO DE CADA ACTION
 *
 * Traduzir "o Zod rejeitou" para "o formulario entende" tem tres passos que
 * toda action precisa fazer igual: ler o campo do `FormData`, anexar o erro no
 * indice certo, e devolver os valores digitados para o formulario nao limpar. Se
 * cada action fizer a traducao a mao, uma delas vai esquecer o terceiro passo — e
 * o sintoma e o pior possivel, porque o cadastro parece funcionar e apaga tudo a
 * cada erro.
 *
 * Alem disso, a forma do `ZodError` (`issue.path` como array) e da chave que o
 * formulario usa (`nomeDoCampo`) nao coincidem sozinhas: `casasDecimais` chega
 * como `["casasDecimais"]`, e o erro tem que virar `{ casasDecimais: ["..."] }`.
 * Fazer isso em um lugar impede que a traducao fique meio feita em algum modulo.
 */

/**
 * Campos que nunca voltam para o formulario.
 *
 * `id` e o unico: e o valor do `<input type="hidden">` que identifica o registro
 * em edicao, e nao um campo que a pessoa digitou. Devolve-lo em `valores` seria
 * inofensivo (o `Formulario` so le campos da spec) e, ainda assim, mixaria
 * identidade de registro com dado digitado.
 */
const CAMPOS_IGNORADOS = new Set(["id"]);

export type ResultadoValidacao<T> =
  | { readonly ok: true; readonly dados: T }
  | { readonly ok: false; readonly estado: EstadoFormulario };

/**
 * Valida o `FormData` e devolve o estado pronto para `useActionState`.
 *
 * O campo de erro e o NOME do campo, nunca a posicao. O Zod usa
 * `issue.path` como array porque o mesmo schema serve para objetos aninhados
 * (`endereco.cidade`); num formulario plano, o caminho e um elemento so, e o
 * primeiro elemento e o nome que o HTML conhece.
 */
export function validarFormulario<T>(
  schema: ZodType<T>,
  dados: FormData,
): ResultadoValidacao<T> {
  const bruto = Object.fromEntries(dados.entries());
  const resultado = schema.safeParse(bruto);

  if (resultado.success) return { ok: true, dados: resultado.data };

  const campos: Record<string, string[]> = {};
  for (const issue of resultado.error.issues) {
    const campo = issue.path[0];
    // Issue sem caminho (`z.string()` solto na raiz) nao tem campo a que se
    // ancorar. Vira erro geral em vez de ser descartado — silenciar um erro de
    // validacao seria pior que exibi-lo no lugar errado.
    if (typeof campo !== "string" || campo === "") continue;
    (campos[campo] ??= []).push(issue.message);
  }

  const temCampo = Object.keys(campos).length > 0;

  return {
    ok: false,
    estado: {
      tipo: "erro",
      mensagem: temCampo
        ? "Verifique os campos destacados."
        : "Dados invalidos.",
      campos: temCampo ? campos : undefined,
      valores: preservarValores(dados),
    },
  };
}

/**
 * Copia do que a pessoa digitou, para o formulario nao voltar vazio.
 *
 * ITERA O `FormData` INTEIRO, E NAO UMA LISTA DE CAMPOS CONHECIDOS.
 *
 * A versao anterior tinha um array `CAMPOS_PRESERVADOS` com uns vinte nomes.
 * Ela silenciosamente apagava o que nao estivesse na lista: ao cadastrar um
 * produto, `sku`, `precoVenda` e `categoriaPaiId` sumiam a cada erro de
 * validacao, e o sintoma — "o formulario apaga o que eu digitei" — parecia um
 * defeito do componente, nao da lista. A lista tambem e uma armadilha de
 * manutencao: todo modulo novo nascia com o bug, e o esquecimento so aparecia
 * depois que alguem reclamasse.
 *
 * Iterar as chaves elimina a categoria inteira do problema. O `FormData` sabe
 * quais campos existem, e nao ha nada a acrescentar quando um modulo novo entra.
 */
function preservarValores(dados: FormData): Record<string, string | undefined> {
  const valores: Record<string, string | undefined> = {};
  for (const campo of dados.keys()) {
    if (CAMPOS_IGNORADOS.has(campo)) continue;
    valores[campo] = valorDigitado(dados, campo);
  }
  return valores;
}

/**
 * O que a pessoa digitou em UM campo, respeitando o par do checkbox.
 *
 * O par marcado/desmarcado e o unico caso em que um mesmo `name` aparece duas
 * vezes no `FormData` (o hidden "" e o "on"). Detectar por contagem resolve sem
 * lista de nomes e sem perguntar ao modulo qual campo e checkbox:
 *
 * - 2+ valores => checkbox marcado, e o valor e "on".
 * - 1 valor     => campo comum. Vazio vira `undefined`, que o formulario le
 *   como "sem valor" e mantem o default.
 *
 * A alternativa era chamar `marcado()` sempre, e ela tem um efeito colateral
 * que so apareceria com SKU "1" ou preco "1": `marcado` trata a string "1" como
 * marcador, e o texto "1" voltaria para o formulario virando "on".
 */
function valorDigitado(dados: FormData, campo: string): string | undefined {
  const entradas = dados.getAll(campo);
  if (entradas.length > 1) return "on";
  const bruto = entradas[0];
  if (typeof bruto !== "string") return undefined;
  const valor = bruto.trim();
  return valor === "" ? undefined : valor;
}

/**
 * Erro de regra de negocio no mesmo formato do erro de validacao.
 *
 * "CNPJ ja cadastrado" e o caso que o Zod nao pega: a entrada e valida, mas o
 * banco recusa por unicidade. Tratar como `EstadoFormulario` mantem um unico
 * caminho de erro no formulario, em vez de dois — e permite ancorar no campo
 * certo, que e onde a pessoa precisa olhar.
 *
 * `valores` e o mesmo parametro que `validarFormulario` preenche sozinho. Aqui
 * ele precisa ser passado: a action ja tem a `entrada` validada em maos, e sem
 * isso o erro de nome duplicado — o mais comum de todos — voltava o formulario
 * vazio, obrigando a pessoa a redigitar preco, unidade e descricao por causa de
 * uma palavra repetida.
 */
export function erroDeRegra(
  mensagem: string,
  campo?: string,
  valores?: Record<string, string | undefined>,
): EstadoFormulario {
  return {
    tipo: "erro",
    mensagem,
    campos: campo ? { [campo]: [mensagem] } : undefined,
    valores,
  };
}

/**
 * Converte qualquer erro em `EstadoFormulario`.
 *
 * E o ultimo portao: `AppError` e `ErroDeNegocio` viram erro de formulario, e o
 * resto vira erro GERAL com texto generico. Esse detalhe de seguranca e
 * deliberado: a mensagem original de uma excecao do Prisma ou do Postgres carrega
 * nome de tabela, coluna e fragmento de SQL, e mostrá-la na tela entrega ao
 * usuario mais do que a interface precisa saber. O log do servidor recebe o
 * detalhe completo.
 */
export function estadoDeErro(erro: unknown, valores?: Record<string, string | undefined>): EstadoFormulario {
  if (erro instanceof AppError) {
    return {
      tipo: "erro",
      mensagem: mensagemDeAppError(erro),
      valores,
    };
  }
  return { tipo: "erro", mensagem: "Nao foi possivel concluir a operacao. Tente novamente.", valores };
}

/** Mensagens que fazem sentido para a pessoa, nunca o texto cru do erro. */
function mensagemDeAppError(erro: AppError): string {
  switch (erro.code) {
    case ErrorCode.DUPLICATED_DOCUMENT:
      return "Ja existe um registro com este valor.";
    case ErrorCode.CONFLICT:
      return "O registro foi alterado por outra pessoa. Recarregue a tela.";
    case ErrorCode.BUSINESS_RULE_VIOLATION:
      return erro.message;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.INSUFFICIENT_PERMISSIONS:
      return "Voce nao tem permissao para esta operacao.";
    case ErrorCode.VALIDATION_FAILED:
    case ErrorCode.INVALID_DOCUMENT:
      return "Dados invalidos. Verifique os campos.";
    default:
      return isAppError(erro) ? erro.message : "Nao foi possivel concluir a operacao.";
  }
}
