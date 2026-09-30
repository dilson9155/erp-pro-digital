import type { CampoSpec } from "@/components/formulario";

/**
 * Spec dos campos de unidade de medida.
 *
 * POR QUE A SPEC FICA AQUI, E NAO NA PAGINA
 *
 * A spec e dado, nao apresentacao. As tres telas do cadastro — listar, novo,
 * editar — precisam dos MESMOS campos com as MESMAS regras de displayed, e a
 * unica coisa que muda entre elas e o valor. Se a spec estivesse na pagina, a
 * tela de edicao carregaria o formulario do cadastro e o do editor, e uma delas
 * acabaria divergindo — quase sempre na largura da coluna ou no texto de ajuda.
 *
 * E `CampoSpec` so aceita dado que cruza a fronteira server/client: string,
 * numero, booleano e array de opcoes. Nenhuma funcao. Isso e o que permite
 * declara-la num Server Component e passar para o formulario client.
 */

/** Campos, na ordem em que aparecem. `largura` controla o grid de 2 colunas. */
export const CAMPOS_UNIDADE: readonly CampoSpec[] = [
  {
    tipo: "texto",
    nome: "nome",
    rotulo: "Simbolo",
    obrigatorio: true,
    maxLength: 8,
    placeholder: "kg",
    ajuda: "A sigla que aparece na venda. Ate 8 caracteres.",
  },
  {
    tipo: "numero",
    nome: "casasDecimais",
    rotulo: "Casas decimais",
    obrigatorio: true,
    min: 0,
    max: 6,
    defaultValue: 2,
    placeholder: "2",
    ajuda: "Quantas casas o preco unitario aceita. 2 para reais, 4 para kg com grama.",
  },
  {
    tipo: "texto",
    nome: "descricao",
    rotulo: "Descricao",
    maxLength: 80,
    placeholder: "Quilograma",
    largura: "cheia",
    ajuda: "Opcional. Nome por extenso, para quem nao conhece a sigla.",
  },
  {
    tipo: "checkbox",
    nome: "ativo",
    rotulo: "Unidade ativa",
    defaultValue: "on",
    ajuda: "Inativa nao aparece em novos cadastros, mas continua no historico.",
  },
];

/**
 * Valores iniciais para a tela de edicao, a partir do registro do banco.
 *
 * O parmetro e a LINHA do Prisma, com os nomes em ingles, e a saida e o
 * `Record<string, string>` que o `Formulario` entende. A traducao acontece aqui e
 * nao na pagina porque o nome do campo no HTML (`nome`, `casasDecimais`) e o nome
 * do campo no banco (`name`, `decimalPlaces`) so coincidem por acaso em parte dos
 * cadastros — fazer a traducao na pagina seria copiar esse mapa para toda tela
 * nova, e cada copia e uma chance de errar.
 */
export function valoresDaUnidade(unidade: {
  name: string;
  description: string | null;
  decimalPlaces: number;
  active: boolean;
}): Record<string, string> {
  return {
    nome: unidade.name,
    descricao: unidade.description ?? "",
    casasDecimais: String(unidade.decimalPlaces),
    ativo: unidade.active ? "on" : "",
  };
}
