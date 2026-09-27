/**
 * Store de rate limit no Upstash Redis, pela API REST.
 *
 * POR QUE `fetch` E NAO O PACOTE `@upstash/ratelimit`
 *
 * Duas razoes, e a segunda e a que manda.
 *
 * 1. Dependencia. O pacote traria o cliente Redis inteiro para usar quatro
 *    comandos. Aqui sao `INCR`, `EXPIRE`, `GET` e `PTTL`.
 * 2. Controle do formato da chave. O `@upstash/ratelimit` monta a chave com um
 *    prefixo e um encoding proprios, e o nome do limitador vai para dentro da
 *    chave. A chave e o que faz a janela; controlar o formato aqui deixa a
 *    janela e o namespace visiveis no `redis-cli`, o que importa no dia em que
 *    alguem precisar responder "por que essa pessoa nao esta limitada".
 *
 * O endpoint de pipeline (`POST {url}/pipeline`) e o que mantem o custo em uma
 * ida e volta: `INCR` e `EXPIRE` sao um comando so no servidor. Sao dois
 * comandos em uma requisicao HTTP, e nao dois comandos em duas requisicoes.
 *
 * A janela e FECHADA, nao deslizante, e a consequencia e aceita de olho aberto.
 *
 * Numa janela deslizante, o limite e recontado a cada requisicao sobre as N
 * fatias que ainda estao dentro da janela. Em REST isso custa uma leitura por
 * fatia — tipicamente 2 a 4 idas e voltas por verificacao, num caminho quente de
 * cada requisicao de API. A janela fechada custa uma, com `INCR` e `EXPIRE` no
 * mesmo pipeline.
 *
 * O preco conhecido: na fronteira entre duas janelas, o cliente pode gastar
 * `limite` em uma e mais `limite` logo em seguida, dentro de um intervalo curto.
 * O limite efetivo no pior caso e o dobro do configurado.
 *
 * Por que isso e aceitavel aqui, e por que nao em todo lugar: o que protege o
 * login contra forca bruta nao e este contador, e o bloqueio de conta, que e
 * persistente e nao zera a cada 15 minutos. O rate limit aqui e a camada barata
 * que derruba o ataque em massa e distribuido, onde cada IP atinge o mesmo
 * limite. Para um teto de vazamento estrito por usuario, o lugar certo e o
 * bloqueio de conta, que tem estado no banco e nao perde com reinicio de
 * instancia.
 */

import type { EstadoJanela, RateLimitStore } from "./store";

const MS_POR_SEGUNDO = 1_000;

/**
 * Prefixo de todo chave criada aqui.
 *
 * Sem prefixo, uma chave de rate limit colide com dado de aplicacao no mesmo
 * Redis: o `INCR` em uma chave que alguem usava como contador de negocio
 * corromperia os dois. O prefixo tambem da um lugar para `FLUSHDB` de emergencia
 * sem risco.
 */
const PREFIXO = "ratelimit:";

export interface OpcoesUpstash {
  readonly url: string;
  readonly token: string;
  /** Prefixo adicional, para separar ambientes que dividem o mesmo Redis. */
  readonly namespace?: string;
  /** Timeout por chamada. O rate limit nao pode segurar uma requisicao. */
  readonly timeoutMs?: number;
}

interface RespostaPipeline {
  result?: unknown;
  error?: string;
}

export function criarStoreUpstash(opcoes: OpcoesUpstash): RateLimitStore {
  const { url, token } = opcoes;
  const timeoutMs = opcoes.timeoutMs ?? 1_500;
  const base = opcoes.namespace ? `${PREFIXO}${opcoes.namespace}:` : PREFIXO;

  function chaveDe(chave: string): string {
    return `${base}${chave}`;
  }

  /**
   * Executa comandos em uma requisicao.
   *
   * O `NX` do `EXPIRE` e o detalhe que impede a janela de ser esticada: sem ele,
   * todo `INCR` renova o TTL e a janela nunca fecha. O erro e LANCADO, e nao
   * engolido, porque quem chama decide o que fazer com indisponibilidade — e a
   * decisao de falhar aberto ou fechado e do `index.ts`, nao de cada store.
   */
  async function pipeline(comandos: (string | number)[][]): Promise<unknown[]> {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), timeoutMs);

    try {
      const resposta = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(comandos),
        signal: controlador.signal,
      });

      if (!resposta.ok) {
        throw new Error(`Upstash respondeu ${resposta.status}`);
      }

      const corpo = (await resposta.json()) as RespostaPipeline[];
      if (!Array.isArray(corpo)) throw new Error("resposta do Upstash fora do formato");

      for (const item of corpo) {
        if (item && typeof item === "object" && "error" in item && item.error) {
          throw new Error(`Upstash: ${item.error}`);
        }
      }
      return corpo.map((item) => (item ? item.result : null));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async incrementar(chave, janelaS): Promise<EstadoJanela> {
      const inteira = chaveDe(chave);
      const [contadorBruto, ttlBruto] = (await pipeline([
        ["INCR", inteira],
        ["EXPIRE", inteira, Math.ceil(janelaS), "NX"],
      ])) as [number, number];

      const contador = Number(contadorBruto ?? 0);

      // `PTTL` de -2 = chave nao existe; -1 = existe sem TTL. O segundo caso
      // nao deveria acontecer com o EXPIRE NX acima, mas se acontecer, cair em
      // `janelaS` e nao em 0 mantem o limite funcionando em vez de liberar
      // tudo. Falhar para o lado permissivo, aqui, e escolher entre "ninguem e
      // limitado" e "ninguem consegue usar"; o primeiro e reversivel.
      const ttlMs = Number(ttlBruto ?? 0) > 0 ? Number(ttlBruto) : janelaS * MS_POR_SEGUNDO;

      return { contador, resetAt: Date.now() + ttlMs };
    },

    async inspecionar(chave): Promise<EstadoJanela | null> {
      const inteira = chaveDe(chave);
      const [valorBruto, ttlBruto] = (await pipeline([
        ["GET", inteira],
        ["PTTL", inteira],
      ])) as [string | null, number];

      if (valorBruto === null || valorBruto === undefined) return null;

      const ttl = Number(ttlBruto ?? -1);
      if (ttl <= 0) return null;

      return { contador: Number(valorBruto), resetAt: Date.now() + ttl };
    },

    async limpar(chave) {
      await pipeline([["DEL", chaveDe(chave)]]);
    },
  };
}
