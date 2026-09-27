/**
 * Contrato do armazenamento de janelas de rate limit.
 *
 * A interface e pequena de proposito: um contador com expiracao, e o incremento
 * atomico. Tudo que a politica de janela precisa cabe nesses tres metodos, e a
 * interface pequena e o que permite trocar `memory` por `upstash` sem tocar na
 * politica.
 *
 * POR QUE O STORE NAO FALA DE "LIMITE"
 *
 * Nenhum metodo recebe `limite`. O store conta usos em uma janela; se ele
 * tambem decidisse quando o contador "estourou", cada store teria de reimplementar
 * a politica, e os dois passariam a divergir. `contador > limite` e uma linha em
 * `index.ts`, testada uma vez, vale para os dois backends.
 *
 * POR QUE `incrementar` NAO E `ler` + `escrever`
 *
 * Separar as duas operacoes abre uma corrida entre requisicoes simultaneas, e
 * em rate limit essa corrida e o bug inteiro. Duas requisicoes que leem 4, cada
 * uma escreve 5, e o contador fica 5 quando duas passaram: o limite de 5 foi
 * furado por um. `INCR` do Redis e atomico; o store em memoria usa `Map` com
 * operacao sincrona, que tambem e indivisivel dentro do event loop.
 *
 * O `+1` do nome e o contrato. Quem implementa precisa somar de forma
 * indivisivel, nao "fazer o incremento".
 */

/** Estado de uma janela, como o store consegue saber. */
export interface EstadoJanela {
  /** Quantos usos ja ocorreram na janela. */
  readonly contador: number;
  /** Epoch ms em que a janela zera. `0` quando nao ha janela aberta. */
  readonly resetAt: number;
}

export interface RateLimitStore {
  /**
   * Consome um uso em `chave` e devolve o estado resultante.
   *
   * @param janelaS Segundos ate a janela fechar. Quem chama ja ajustou pela
   *                janela ja begunada.
   */
  incrementar(chave: string, janelaS: number): Promise<EstadoJanela>;

  /**
   * Le sem consumir.
   *
   * Existe para responder 429 sem gastar uma vaga de quem ja esta bloqueado. Se
   * o 429 consumisse, o bloqueio se renovaria a cada tentativa e a janela nunca
   * deixaria a pessoa voltar sozinha.
   */
  inspecionar(chave: string): Promise<EstadoJanela | null>;

  /** Usado pelos testes e por operacao. */
  limpar(chave: string): Promise<void>;
}
