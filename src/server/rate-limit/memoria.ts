/**
 * Store de rate limit em memoria do processo.
 *
 * USO PERMITIDO: desenvolvimento, teste, e processo unico sem multiplas
 * instancias. `src/lib/env.ts` REJEITA `RATE_LIMIT_DRIVER=memory` quando
 * `NODE_ENV=production`, e isso e proposital: em memoria, cada instancia tem seu
 * proprio contador, e N instancias atras de um balanceador deixam o atacante
 * passar N vezes o limite. O bloqueio de conta continua valendo, mas a camada
 * barata de protecao deixa de existir sem ninguem perceber.
 *
 * POR QUE O EXPIRO E VARREDURA E NAO UM TIMER POR CHAVE
 *
 * A alternativa obvia e um `setTimeout` por chave para apagar. Em uma tela de
 * login com gente digitando e-mail errado, sao milhares de timers vivos ao mesmo
 * tempo, e cada um mantem sua entrada e seu callback na fila do event loop: a
 * memoria cresce com o numero de IPs tentados, e o processo so limpa o que o
 * timer pagou.
 *
 * Aqui o expirado e filtrado no acesso. O custo e uma varredura O(n) por
 * operacao, que so aparece quando n e grande; a alternativa e memoria
 * crescendo sem limite, que e exatamente o que acontece no ataque que o rate
 * limit existe para impedir.
 */

import type { RateLimitStore } from "./store";

interface Entrada {
  contador: number;
  resetAt: number;
}

const MS_POR_SEGUNDO = 1_000;

/**
 * Abaixo deste numero de chaves vivas, a varredura e pulada.
 *
 * A varredura so e necessaria quando o mapa tem tamanho que compensa pagala.
 * Com poucas dezenas de chaves, percorrer o mapa e mais barato do que a
 * comparacao que a varredura evita.
 */
const LIMIAR_DE_VARREDURA = 1_000;

export function criarStoreMemoria(): RateLimitStore {
  const entradas = new Map<string, Entrada>();

  function agora(): number {
    return Date.now();
  }

  function descartarExpiradas(): void {
    if (entradas.size < LIMIAR_DE_VARREDURA) return;
    const momento = agora();
    for (const [chave, entrada] of entradas) {
      if (entrada.resetAt <= momento) entradas.delete(chave);
    }
  }

  return {
    // Os metodos NAO sao `async`: sao sincronos por dentro e devolvem uma
    // Promise ja resolvida. Isso e o que torna o incremento indivisivel — nao
    // existe ponto de suspension entre ler o contador e escrever o novo valor,
    // entao o event loop nao consegue intercalar outra requisicao no meio.
    // Marcar como `async` sem `await` inventaria uma fronteira de suspension
    // inexistente e esconderia a propria garantia de atomicidade.
    incrementar(chave, janelaS) {
      descartarExpiradas();
      const momento = agora();
      const existente = entradas.get(chave);

      // Janela expirada recomeca. E nao e renovada a partir de agora: se fosse,
      // cada tentativa manteria a janela aberta e o limite nunca venceria, e o
      // atacante que insistsse no login nao sairia nunca do bloqueio.
      if (!existente || existente.resetAt <= momento) {
        const resetAt = momento + janelaS * MS_POR_SEGUNDO;
        entradas.set(chave, { contador: 1, resetAt });
        return Promise.resolve({ contador: 1, resetAt });
      }

      existente.contador += 1;
      return Promise.resolve({ contador: existente.contador, resetAt: existente.resetAt });
    },

    inspecionar(chave) {
      const entrada = entradas.get(chave);
      if (!entrada || entrada.resetAt <= agora()) return Promise.resolve(null);
      return Promise.resolve({ contador: entrada.contador, resetAt: entrada.resetAt });
    },

    limpar(chave) {
      entradas.delete(chave);
      return Promise.resolve();
    },
  };
}
