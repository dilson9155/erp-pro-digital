/**
 * Unicidade em cadastro com exclusao logica.
 *
 * O PROBLEMA
 *
 * Todo cadastro deste ERP tem `deletedAt`, e o `@@unique([tenantId, name])` do
 * schema nao sabe nada sobre isso. Excluir "KG" marca `deletedAt` e desativa a
 * linha, mas a LINHA CONTINUA NO BANCO — e continua ocupando o indice unico. O
 * resultado e que a empresa nao consegue recadastrar a unidade que ela acabou de
 * apagar, e o unico sintoma e um `P2002` ("unique constraint failed") chegando
 * como erro de banco.
 *
 * Isso nao e hipotetico. Apagar e recadastrar e o ciclo normal de um cadastro
 * com engano: alguem cria "CX" quando queria "CX12", apaga, e tenta de novo.
 *
 * AS TRES SAIDAS, E POR QUE SAO TRES
 *
 * 1. Apagar de verdade (sem `deletedAt`). Descartada: quebra o historico.
 *    `Product.unitId` aponta para a unidade, e venda antiga continua existindo.
 * 2. Manter o indice apenas para linhas ativas (indice unico parcial, via
 *    migracao). A solucao correta, e a unica que resolve o problema na raiz —
 *    mas exige migracao em todos os catalogs, e cada `@@unique` e diferente.
 *    Fica como evolucao; enquanto isso, o codigo abaixo faz o workaround certo.
 * 3. RESTAURAR a linha em vez de criar outra. A linha volta com o mesmo `id`,
 *    entao todo o que apontava para ela continua valendo, e a unicidade passa
 *    a ser garantida pelo proprio indice.
 *
 * O workaround e o (3), e a funcao abaixo e a decisao pura dele — sem banco, sem
 * Prisma, testavel. O porque de ser funcao e nao um `if` espalhado nas actions:
 * essa decisao tem de ser identica em unidade, categoria e marca, e tres
 * copias de um `if` de tres linhas divergem no primeiro cadastro novo.
 */

/** O minimo que a decisao precisa saber sobre a linha ja existente. */
export interface LinhaComExclusaoLogica {
  readonly id: string;
  readonly deletedAt: Date | null;
  readonly active: boolean;
}

export type DecisaoUnicidade =
  | { readonly tipo: "criar" }
  | { readonly tipo: "restaurar"; readonly id: string }
  | { readonly tipo: "duplicado" };

/**
 * Decide o que fazer quando o nome ja existe.
 *
 * `linhaIgual` e a linha encontrada com o MESMO nome, com ou sem `deletedAt` —
 * a query deste modulo NAO filtra `deletedAt`, e esse e o ponto: filtrar seria
 * esconder exatamente a linha que precisa ser restaurada.
 */
export function decidirUnicidade(linhaIgual: LinhaComExclusaoLogica | null): DecisaoUnicidade {
  // Nenhuma linha com esse nome: o caminho normal.
  if (linhaIgual === null) return { tipo: "criar" };

  // Linha viva com esse nome: e duplicidade de verdade, e a mensagem vai para o
  // campo, porque o que a pessoa precisa corrigir e o campo que ela digitou.
  if (linhaIgual.deletedAt === null) return { tipo: "duplicado" };

  // Linha excluida: restaurar e o unico caminho que respeita o indice unico e
  // mantem o `id` — e o `id` que produto e venda historica referenciam.
  return { tipo: "restaurar", id: linhaIgual.id };
}

/**
 * Comparacao de nome de cadastro.
 *
 * Minuscula e sem espacos nas pontas. Sem isso, "KG" e "kg" seriam duas linhas
 * diferentes para o banco e duas para quem cadastro, e o preco do produto
 * apareceria com a unidade errada num dos casos. O `@@unique` do schema e
 * sensivel a caixa, entao essa comparacao roda no aplicacao — em um cadastro de
 * algumas dezenas de linhas e irrelevante, e o preco de errar aqui e alto.
 */
export function mesmoNome(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
