"use client";

import { Fragment, useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import {
  AcaoFormulario,
  CampoArea,
  CampoCheckbox,
  CampoData,
  CampoMoeda,
  CampoNumero,
  CampoQuantidade,
  CampoSelect,
  CampoTexto,
} from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { EstadoFormulario } from "@/lib/formulario";
import type { AcaoServidor } from "@/lib/formulario";

/**
 * Formulario generico, dirigido por um array de spec.
 *
 * POR QUE UM COMPONENTE E NAO UM FORMULARIO POR CADASTRO
 *
 * Sao vinte e poucos cadastros neste ERP, e cada um precisa do mesmo que o
 * anterior: rótulo, campo, ajuda, erro por campo, botão de enviar com estado de
 * envio e o valor digitado de volta quando o servidor rejeita. Escritos um a um,
 * sao vinte e poucos arquivos quase identicos — e o Divergir entre eles e certo:
 * o primeiro ganha "voltar" no canto, o quinto esquece, e o padrao se dissolve.
 *
 * A spec resolve isso sem criar uma linguagem de formulario: e um array de
 * objetos com dados que ja atravessam a fronteira server/client (strings,
 * numeros, booleanos, arrays de opcoes). O que NAO atravessa e funcao, o que
 * mantem a regra no servidor — o formulario nao valida nada, so mostra o que o
 * servidor/devolveu.
 *
 * O QUE ESTE COMPONENTE NAO FAZ, E POR QUE
 *
 * Nao valida. Quem valida e a Server Action, com Zod, e a resposta volta em
 * `EstadoFormulario.campos`. Validar aqui tambem daria a quem quiser burlar a
 * interface um caminho mais facil: e so nao enviar.
 *
 * Nao mascarada entrada. `CampoMoeda` e `type="text"` justamente para o texto
 * digitado voltar intacto; a conversao pt-BR acontece na action.
 *
 * POR QUE SER CLIENT COMPONENT
 *
 * `useActionState` e o que mantem o estado entre envios e devolve os valores
 * digitados quando o servidor rejeita. Sem ele, a pagina de formulario teria de
 * ser re-renderizada do zero pelo servidor a cada erro, e o valor do campo
 *Navigation se perderia. O resto do formulario e markup puro, que o navegador
 * renderiza sem qualquer JavaScript nosso — o `action` continua sendo uma Server
 * Action, entao o dado nao depende de o bundle carregar.
 */
export interface CampoSpec {
  readonly tipo: "texto" | "numero" | "moeda" | "quantidade" | "data" | "select" | "area" | "checkbox";
  readonly nome: string;
  readonly rotulo: string;
  readonly ajuda?: string;
  readonly obrigatorio?: boolean;
  readonly defaultValue?: string | number | undefined;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly autoComplete?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly rows?: number;
  readonly opcoes?: readonly { readonly value: string; readonly rotulo: string }[];
  /** `cheia` ocupa a linha; `metade` divide com o vizinho em telas medias. */
  readonly largura?: "cheia" | "metade";
  /**
   * Cabecalho de secao. O primeiro campo com `secao` diferente da anterior abre
   * um grupo novo.
   *
   * Existe por causa do produto, que tem quase quarenta colunas. Sem secao, o
   * formulario vira uma parede de campos sem hierarquia, e o preco — que e o
   * que quem cadastra vem buscar — fica entre NCM e lote. A alternativa seria
   * uma tela de produto com abas, e abas escondem o conteudo: quem abre "Cadastro"
   * para corrigir um campo fiscal tem de clicar numa aba para descobrir que o
   * campo nao esta la.
   */
  readonly secao?: string;
  /** Texto de apoio no cabecalho da secao. */
  readonly ajudaSecao?: string;
}

export interface PropsFormulario {
  readonly acao: AcaoServidor;
  readonly campos: readonly CampoSpec[];
  /** Valores iniciais, para edicao. Ausente = formulario de cadastro. */
  readonly valores?: Readonly<Record<string, string | number | undefined>>;
  readonly titulo: string;
  readonly descricao?: string;
  readonly textoEnviar?: string;
  /** Link de "cancelar". Ausente = sem botao de cancelar. */
  readonly voltarHref?: string;
  /** Acoes extras abaixo do formulario (ex.: "excluir"). */
  readonly acoesExtras?: React.ReactNode;
  /**
   * Campos ocultos renderizados DENTRO do `<form>`.
   *
   * O `id` do registro em edicao e o caso. Ele precisa viajar junto com o
   * `FormData` da submissao, entao tem que estar dentro do `<form>` — e nao da
   * para a pagina so "colocar um input escondido ao lado" do componente, porque
   * ai ele fica fora do formulario e a action recebe um `FormData` sem `id`.
   * Passar pelo componente tambem evita a duplicacao entre a tela de edicao e a
   * tela de cadastro, que precisam do mesmo par.
   */
  readonly camposOcultos?: Readonly<Record<string, string>>;
  /** Esconde o cabecalho interno, para reaproveitar o card dentro de outro layout. */
  readonly semCard?: boolean;
}

export function Formulario(props: PropsFormulario) {
  const [estado, formAction] = useActionState<EstadoFormulario | null, FormData>(
    props.acao,
    null,
  );

  // Estreita o uniao: so o formato de erro tem `campos` e `mensagemDeCampo`.
  // Acessar direto compilaria com `estado?.tipo === "ok" ? ... : estado.mensagem`
  // e esconderia o caso `null` (estado inicial), que e o estado de tela nova.
  const erro = estado?.tipo === "erro" ? estado : null;
  // `erroGeral` e o erro SEM campo: erro de regra de negocio (nome duplicado,
  // registro nao encontrado) que o servidor nao consegue ancorar em um input.
  //
  // A condicao anterior era `!estado.campos`, e `campos` e `undefined` tambem
  // quando o objeto existe mas esta vazio — `{}`. Nesse caso o servidor tinha
  // saido de `validarFormulario` com `campos: undefined` deliberadamente (ver o
  // `temCampo ? campos : undefined`), e o resultado era: nenhuma mensagem de
  // erro em lugar nenhum, com o formulario recusando a submissao. Agora a
  // mensagem so e escondida quando existe pelo menos um campo com erro, e o
  // erro geral aparece sempre que nao ha erro ancorado.
  const erroGeral = estado?.tipo === "erro" ? estado.mensagem : null;
  const erroAncorado = erro?.campos ? Object.keys(erro.campos).length > 0 : false;
  const sucesso = estado?.tipo === "ok" ? estado.mensagem : null;

  const valor = (campo: CampoSpec): string | undefined => {
    // Ordem de prioridade, e cada degrau existe por um motivo:
    //
    // 1. `estado.valores` — o que o servidor devolveu. Precisa vir primeiro: e o
    //    que a pessoa digitou na tentativa anterior, e perder isso ao corrigir
    //    um campo e a razao de `EstadoFormulario` carregar os valores de volta.
    // 2. `props.valores` — o registro em edicao.
    // 3. `campo.defaultValue` — o que a spec declara.
    //
    // O terceiro degrau faltava, e o efeito era que `defaultValue` na spec era
    // letra morta para todo campo que nao fosse checkbox: `casasDecimais: 2` na
    // unidade e `ordem: 0` na categoria nunca chegavam ao input, e o cadastro
    // insistia em um valor que a propria spec ja tinha respondido.
    const nome = campo.nome;
    const doEstado = estado?.tipo === "erro" ? estado.valores?.[nome] : undefined;
    if (doEstado !== undefined) return doEstado;
    if (props.valores?.[nome] !== undefined) return String(props.valores[nome]);
    if (campo.defaultValue !== undefined) return String(campo.defaultValue);
    return undefined;
  };

  const erroDoCampo = (nome: string): string | undefined => {
    const lista = erro?.campos?.[nome];
    return lista && lista.length > 0 ? lista[0] : undefined;
  };

  const conteudo = (
    <form action={formAction} className="space-y-6" noValidate>
      {props.camposOcultos
        ? Object.entries(props.camposOcultos).map(([nome, valor]) => (
            <input key={nome} type="hidden" name={nome} value={valor} />
          ))
        : null}

      {erroGeral && !erroAncorado ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {erroGeral}
        </div>
      ) : null}

      {sucesso ? (
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {sucesso}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {props.campos.map((campo, indice) => {
          const largura =
            campo.largura === "cheia" || campo.tipo === "area" || campo.tipo === "checkbox"
              ? "md:col-span-2"
              : "";

          // Abre a secao quando o campo traz `secao` e ela mudou em relacao ao
          // campo anterior. O `indice === 0` cobre a primeira secao, que nao tem
          // campo anterior para comparar.
          const secaoAnterior = props.campos[indice - 1]?.secao;
          const abreSecao = campo.secao !== undefined && campo.secao !== secaoAnterior;

          const comum = {
            nome: campo.nome,
            rotulo: campo.rotulo,
            ajuda: campo.ajuda,
            erro: erroDoCampo(campo.nome),
            obrigatorio: campo.obrigatorio,
            className: largura,
          };

          return (
            <Fragment key={campo.nome}>
              {abreSecao ? (
                <div className="md:col-span-2">
                  <h3 className="border-b pb-1.5 text-sm font-semibold">{campo.secao}</h3>
                  {campo.ajudaSecao ? (
                    <p className="pt-1.5 text-xs text-muted-foreground">{campo.ajudaSecao}</p>
                  ) : null}
                </div>
              ) : null}
              {renderizarCampo(campo, comum, valor(campo), erroDoCampo(campo.nome))}
            </Fragment>
          );
        })}
      </div>

      <AcaoFormulario erro={undefined}>
        <BotaoEnviar texto={props.textoEnviar ?? "Salvar"} />
        {props.voltarHref ? (
          <Button asChild variant="outline">
            <Link href={props.voltarHref}>Cancelar</Link>
          </Button>
        ) : null}
        {props.acoesExtras}
      </AcaoFormulario>
    </form>
  );

  if (props.semCard) return conteudo;

  return (
    <Card>
      <CardContent className="pt-6">{conteudo}</CardContent>
    </Card>
  );
}

/**
 * Um campo da spec, no componente correspondente.
 *
 * A funcao esta fora do `Formulario` de proposito: o `switch` gerava um
 * componente anonimo dentro do corpo, e o React trataria cada render como um
 * elemento novo, remontando os campos a cada `useActionState`. Com a funcao no
 * escopo do modulo, a estrutura do elemento e estavel entre renders — o que e o
 * que faz o campo "lembrar" o que foi digitado sem estado proprio.
 */
function renderizarCampo(
  campo: CampoSpec,
  comum: {
    nome: string;
    rotulo: string;
    ajuda: string | undefined;
    erro: string | undefined;
    obrigatorio: boolean | undefined;
    className: string;
  },
  valorAtual: string | undefined,
  erro: string | undefined,
): React.ReactNode {
  switch (campo.tipo) {
    case "numero":
      return (
        <CampoNumero
          {...comum}
          defaultValue={valorAtual}
          min={campo.min}
          max={campo.max}
          step={campo.step}
        />
      );
    case "moeda":
      return <CampoMoeda {...comum} defaultValue={valorAtual} placeholder={campo.placeholder} />;
    case "quantidade":
      return <CampoQuantidade {...comum} defaultValue={valorAtual} />;
    case "data":
      return <CampoData {...comum} defaultValue={valorAtual} />;
    case "select":
      return (
        <CampoSelect
          {...comum}
          defaultValue={valorAtual}
          placeholder={campo.placeholder}
          opcoes={campo.opcoes ?? []}
        />
      );
    case "area":
      return (
        <CampoArea {...comum} defaultValue={valorAtual} rows={campo.rows} maxLength={campo.maxLength} />
      );
    case "checkbox":
      // O valor vem da MESMA funcao `valor()` dos outros campos, e nao de
      // `campo.defaultValue`. Ler o default diretamente ignorava o registro em
      // edicao: abrir um produto desativado marcava a caixa "Ativo", porque a
      // spec diz `defaultValue: "on"` e o `props.valores` dizia `""`. Salvar sem
      // tocar em nada reativava o produto.
      return (
        <CampoCheckbox
          nome={campo.nome}
          rotulo={campo.rotulo}
          ajuda={campo.ajuda}
          erro={erro}
          defaultChecked={valorAtual === "on" || valorAtual === "true" || valorAtual === "1"}
          className={comum.className}
        />
      );
    case "texto":
    default:
      return (
        <CampoTexto
          {...comum}
          defaultValue={valorAtual}
          placeholder={campo.placeholder}
          maxLength={campo.maxLength}
          autoComplete={campo.autoComplete}
        />
      );
  }
}

/**
 * Botao que desabilita durante o envio.
 *
 * `useFormStatus` precisa estar num FILHO do `<form>`: o hook le a submissao mais
 * proxima acima dele. Sem `pending`, o botao segue clicavel e a pessoa salva duas
 * vezes — em cadastro, isso significa dois clientes com o mesmo e-mail, e o
 * segundo termina em erro de duplicidade que ela nao causede.
 */
function BotaoEnviar({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? "Salvando..." : texto}
    </Button>
  );
}
