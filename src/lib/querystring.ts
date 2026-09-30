/**
 * Filtros de URL das telas de listagem.
 *
 * `src/lib/money.ts` cuida de dinheiro e `src/lib/documento.ts` de documento,
 * cada um com a sua razao de existir. Este tem uma: as telas de listagem
 * precisam montar a query inteira a cada link, e o jeito obvio de fazer isso
 * erra.
 */

/**
 * Valor de um filtro depois de aplicar uma mudanca pontual.
 *
 * O PROBLEMA QUE ESTA FUNCAO RESOLVE
 *
 * O padrao usado nas listagens para montar o link de paginacao e de toggle e:
 *
 * ```ts
 * const href = (mudancas: Record<string, string | undefined>) => {
 *   const inativos = mudancas.inativos ?? (incluirInativos ? "1" : undefined);
 *   if (inativos === "1") query.set("inativos", "1");
 *   // ...
 * };
 * // Botao de toggle:
 * href({ inativos: incluirInativos ? undefined : "1" })
 * ```
 *
 * A intencao do link e "se agora estou mostrando inativos, passe a esconder:
 * passe `undefined`". So que `undefined` e justamente o valor que o `??` trata
 * como "nao informado" e substitui pelo ATUAL. O `??` devolve `"1"`, o link
 * continua com `?inativos=1`, e o botao que diz "Ocultando inativos" nao
 * oculta nada. Ele funcionava so para LIGAR.
 *
 * Esse bug passou por quatro telas (marcas, clientes, fornecedores, produtos) e
 * por typecheck, lint e 300 testes, porque nenhum dos tres enxerga um link que
 * sai com a query errada: a pagina responde 200 e mostra a lista.
 *
 * A REGUA
 *
 * "O filtro foi MENCIONADO na mudanca" e diferente de "o filtro tem valor".
 * Quem passa a chave quer decidir o que acontece com ela, inclusive apagar.
 * Quem nao passa a chave quer que ela fique como esta. `hasOwnProperty` separa
 * os dois casos; `??` nao separa.
 */
export function valorDoFiltro(
  mudancas: Record<string, string | undefined>,
  chave: string,
  atual: string | undefined,
): string | undefined {
  return Object.prototype.hasOwnProperty.call(mudancas, chave) ? mudancas[chave] : atual;
}
