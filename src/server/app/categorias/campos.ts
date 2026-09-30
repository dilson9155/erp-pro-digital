import type { CampoSpec } from "@/components/formulario";

/**
 * Spec dos campos de categoria.
 *
 * `categoriaPaiId` entra como `select` com `placeholder`, e nao como texto: e uma
 * relacao, e digitar o nome do pai num campo de texto permitiria salvar uma
 * categoria apontando para um id que nao existe. O `placeholder` "Sem categoria
 * pai" corresponde ao valor vazio, que o schema transforma em `null` — raiz.
 *
 * A lista de opcoes vem da query e NAO e parte da spec: a spec so diz que o
 * campo e um select. Isso mantem a spec como dado puro (cruza a fronteira
 * server/client) e faz a lista de opcoes viajar pela pagina, que a carrega.
 */
export const CAMPOS_CATEGORIA: readonly CampoSpec[] = [
  {
    tipo: "texto",
    nome: "nome",
    rotulo: "Nome",
    obrigatorio: true,
    maxLength: 140,
    placeholder: "Bebidas",
    ajuda: "Como a categoria aparece na venda.",
  },
  {
    tipo: "texto",
    nome: "codigo",
    rotulo: "Codigo",
    maxLength: 40,
    placeholder: "BEV-01",
    ajuda: "Opcional. Util para integracao com o sistema legado.",
  },
  {
    tipo: "texto",
    nome: "descricao",
    rotulo: "Descricao",
    maxLength: 500,
    largura: "cheia",
    ajuda: "Opcional.",
  },
  {
    tipo: "select",
    nome: "categoriaPaiId",
    rotulo: "Categoria pai",
    placeholder: "Sem categoria pai (raiz)",
    ajuda: "Deixe vazio para categoria de primeiro nivel.",
  },
  {
    tipo: "numero",
    nome: "ordem",
    rotulo: "Ordem",
    min: 0,
    max: 9999,
    defaultValue: 0,
    ajuda: "Define a ordem dentro do mesmo nivel. Menor aparece primeiro.",
  },
  {
    tipo: "checkbox",
    nome: "ativo",
    rotulo: "Categoria ativa",
    defaultValue: "on",
    ajuda: "Inativa nao aparece em novos cadastros de produto.",
  },
];

export function valoresDaCategoria(categoria: {
  name: string;
  code: string | null;
  description: string | null;
  sortOrder: number;
  parentId: string | null;
  active: boolean;
}): Record<string, string> {
  return {
    nome: categoria.name,
    codigo: categoria.code ?? "",
    descricao: categoria.description ?? "",
    categoriaPaiId: categoria.parentId ?? "",
    ordem: String(categoria.sortOrder),
    ativo: categoria.active ? "on" : "",
  };
}

/**
 * Insere as opcoes de categoria pai na spec.
 *
 * Um `map` sobre a spec, e nao uma spec reescrita em cada tela. A alternativa —
 * cada tela declarar os campos com as opcoes — duplicaria os outros cinco campos
 * em dois arquivos, e o dia que um campo novo fosse adicionado, uma das copias
 * ficaria para tras.
 *
 * Estar aqui, e nao na pagina, porque as DUAS telas precisam do mesmo ajuste, e
 * um arquivo de pagina que exporta outra coisa alem do `default` nao pode ser
 * importado — o Next trata todo arquivo de `page.tsx` como entrada de rota.
 */
export function comOpcoesDePai(
  campos: readonly CampoSpec[],
  opcoes: readonly { readonly value: string; readonly rotulo: string }[],
): readonly CampoSpec[] {
  return campos.map((campo) =>
    campo.nome === "categoriaPaiId" && campo.tipo === "select" ? { ...campo, opcoes } : campo,
  );
}
