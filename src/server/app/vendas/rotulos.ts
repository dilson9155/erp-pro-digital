import type { SaleChannel, SaleStatus, SaleType } from "@/generated/prisma/enums";
import type { TomBadge } from "@/components/ui/badge";

/**
 * Rotulos de venda para a tela.
 *
 * FICAM AQUI, E NAO NA PAGINA, PORQUE A PAGINA NAO PODE IMPORTAR O ENUM
 *
 * Os enums sao gerados pelo Prisma a partir do `schema.prisma`, e a regra do
 * projeto e que o enum so pode ser importado por modulo de servidor. A pagina
 * precisa do texto "Confirmada", e nao de `SaleStatus.CONFIRMADA`; se a pagina
 * importasse o enum, bastaria um `import { SaleStatus }` para o build passar e
 * a regra ser furada em qualquer tela nova.
 *
 * Este arquivo nao tem `campos.ts` porque venda ainda nao tem formulario: o
 * modulo de criacao depende de decisoes que sao de negocio, nao de layout (ver
 * `vendas/README-decisoes` na conversa de implementacao). Os rotulos ja existem
 * porque a consulta ja existe, e a listagem precisa mostrar a situacao.
 */

/** `SaleStatus` -> texto. O padrao e mostra a situacao, nunca o valor cru. */
export const ROTULO_SITUACAO: Record<SaleStatus, string> = {
  RASCUNHO: "Rascunho",
  PENDENTE: "Pendente",
  CONFIRMADA: "Confirmada",
  CONCLUIDA: "Concluida",
  ENTREGUE: "Entregue",
  CANCELADA: "Cancelada",
  DEVOLVIDA: "Devolvida",
  PARCIALMENTE_DEVOLVIDA: "Parcialmente devolvida",
};

/**
 * `SaleType` -> texto.
 *
 * `type` e a NATUREZA COMERCIAL da venda: o que foi vendido e como o dinheiro
 * entra. Nao e "onde a venda aconteceu" — isso e `channel`.
 */
export const ROTULO_TIPO: Record<SaleType, string> = {
  BALCAO: "Balcao",
  NORMAL: "Normal",
  PDV: "PDV",
  CREDITO: "Credito",
  REMESSA: "Remessa",
  OUTRA: "Outra",
};

/** `SaleChannel` -> texto: de onde a venda entrou no sistema. */
export const ROTULO_CANAL: Record<SaleChannel, string> = {
  PDV: "PDV",
  BALCAO: "Balcao",
  LOJA_ONLINE: "Loja online",
  APP: "App",
  TELEFONE: "Telefone",
  WHATSAPP: "Whatsapp",
  API: "API",
  IMPORTACAO: "Importacao",
};

/**
 * `BALCAO` E `PDV` EXISTEM NOS DOIS ENUMS, E ISSO NAO E DUPLICIDADE
 *
 * Uma venda registrada no terminal do balcao tem `type = BALCAO` (natureza: venda
 * de balcao, o dinheiro entra na hora) e `channel = PDV` (origem: entrou por um
 * terminal). Os dois valores existem em `SaleType` e em `SaleChannel`, e as duas
 * colunas da tela precisam mostrar rotulos DIFERENTES para nao parecer que o
 * mesmo campo se repete.
 *
 * Se um dia esses dois enums virarem um so, a coluna `channel` perde a unica
 * coisa que ela guarda: o canal diz de onde o pedido chegou, e `type` sozinho
 * nao diz.
 */

/**
 * Cor da situacao.
 *
 * A regra de cor nao e "bom/ruim", e "a venda ainda esta em trabalho?". Por isso
 * `RASCUNHO` e `PENDENTE` ficam em atencao, e nao em neutro: sao as duas
 * situacoes em que alguem precisa agir. Confirmada e concluida sao o caminho
 * normal, entao ficam em ok.
 *
 * `DEVOLVIDA` e `CANCELADA` ficam em perigo, e nao em neutro, porque sao as duas
 * unicas situacoes em que o total da venda NAO representa receita: somar uma
 * lista por periodo sem olhar a situacao somaria dinheiro que nao entrou. A cor
 * existe para tornar esse erro visivel antes de alguem olhar o relatorio.
 */
export function tomDaSituacao(situacao: SaleStatus): TomBadge {
  switch (situacao) {
    case "RASCUNHO":
    case "PENDENTE":
      return "atencao";
    case "CONFIRMADA":
    case "CONCLUIDA":
    case "ENTREGUE":
      return "ok";
    case "CANCELADA":
    case "DEVOLVIDA":
      return "perigo";
    case "PARCIALMENTE_DEVOLVIDA":
      return "info";
    default:
      return "neutro";
  }
}

/** Opcoes de situacao para o `<select>` do filtro, com "todas" na frente. */
export const OPCOES_SITUACAO: readonly { readonly value: string; readonly rotulo: string }[] = [
  { value: "todas", rotulo: "Todas as situacoes" },
  ...Object.entries(ROTULO_SITUACAO).map(([value, rotulo]) => ({ value, rotulo })),
];

/**
 * Rotulo de uma situacao, com o tipo do enum escondido.
 *
 * A pagina precisa do texto e nao pode conhecer o `SaleStatus`. Exportar
 * `ROTULO_SITUACAO` como `Record<SaleStatus, string` já resolveria, mas quem
 * chama ainda teria que escrever `ROTULO_SITUACAO[situacao]` e o indice
 * aceitaria qualquer `string` — `ROTULO_SITUACAO["RASCUNHH"]` compila e devolve
 * `undefined` em silencio. Esta funcao mantem o enum do lado do servidor e ainda
 * assim cobre o valor desconhecido, para o caso de um `SaleStatus` novo no
 * schema antes de o rotulo existir aqui.
 */
export function rotuloDaSituacao(situacao: SaleStatus): string {
  return ROTULO_SITUACAO[situacao] ?? situacao;
}
