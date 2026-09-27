/**
 * Testes do store Upstash, com `fetch` substituido.
 *
 * O que pode dar errado aqui NAO e a politica de rate limit, que ja esta
 * coberta contra o store em memoria. E a traducao para a API REST: o formato do
 * pipeline, o `EXPIRE NX` que impede a janela de ser esticada, e a leitura de
 * TTL. Um erro em qualquer um desses passa em todos os testes de politica e
 * falha so contra o Redis real, ou seja, em producao.
 *
 * Nao ha Redis nos testes, e nao deveria: subir um container para testar quatro
 * comandos seria mais lento do que a suite inteira. O `fetch` e a fronteira
 * real deste modulo, entao e la que o teste mora.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { criarStoreUpstash } from "@/server/rate-limit/upstash";

/** Respostas enfileiradas, na ordem em que o store vai pedir. */
function mockFetch(respostas: unknown[]): ReturnType<typeof vi.fn> {
  const fila = [...respostas];
  // Sem `async`: o mock resolve na hora, e `require-await` esta ligado.
  return vi.fn(() => {
    const proximo = fila.shift();
    if (proximo === undefined) throw new Error("fetch chamado alem do esperado");
    const corpo = JSON.stringify(Array.isArray(proximo) ? proximo : [proximo]);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JSON.parse(corpo)),
    } as unknown as Response);
  });
}

function instalar(fn: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal("fetch", fn);
}

const OPCOES = { url: "https://exemplo.upstash.io", token: "token-falso" };

/**
 * Comandos enviados na N-esima chamada.
 *
 * `fn.mock.calls[0]` e `undefined` no tipo do Vitest, porque o mock nao sabe
 * quantas chamadas vao acontecer. Um `!` aqui esconderia um erro real: o store
 * parou de chamar `fetch`, e o teste leria `undefined` e passaria adiante com um
 * `JSON.parse` que estoura. A funcao abaixo falha alto, que e o que um teste
 * deve fazer quando o codigo mudou de comportamento.
 */
function comandosDa(fn: ReturnType<typeof vi.fn>, indice = 0): unknown[] {
  const chamada = fn.mock.calls[indice];
  if (!chamada) throw new Error(`fetch nao foi chamado ${indice + 1}x`);
  return JSON.parse(String(chamada[1].body)) as unknown[];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("incremento", () => {
  it("manda INCR e EXPIRE NX no mesmo pipeline", async () => {
    const fn = mockFetch([
      [{ result: 1 }, { result: 1 }],
      [{ result: 2 }, { result: 1 }],
    ]);
    instalar(fn);

    const store = criarStoreUpstash(OPCOES);
    await store.incrementar("chave", 60);
    await store.incrementar("chave", 60);

    const url = String(fn.mock.calls[0]?.[0]);
    expect(url).toBe("https://exemplo.upstash.io/pipeline");
    expect(comandosDa(fn)).toEqual([
      ["INCR", "ratelimit:chave"],
      ["EXPIRE", "ratelimit:chave", 60, "NX"],
    ]);
  });

  it("usa NX no EXPIRE para nao esticar a janela", async () => {
    // Este e o detalhe de maior consequencia do arquivo. Sem o `NX`, todo
    // `INCR` renova o TTL, e a janela so fecha depois que o atacante PARAR de
    // tentar. O limite deixa de valer no instante em que mais importa, e a
    // pessoa legitima com o IP errado fica bloqueada sem forma de sair.
    const fn = mockFetch([[{ result: 1 }, { result: 1 }]]);
    instalar(fn);

    await criarStoreUpstash(OPCOES).incrementar("chave", 900);

    expect(comandosDa(fn)[1]).toMatchObject({ 3: "NX" });
  });

  it("arredonda a janela para cima", async () => {
    // `EXPIRE` aceita inteiro de segundos. Com janela de 0.5 s, `Math.floor`
    // gravaria 0, e o Redis trata `EXPIRE key 0` como "apagar agora": o
    // contador nunca se acumularia e o limite nao existiria.
    const fn = mockFetch([[{ result: 1 }, { result: 1 }]]);
    instalar(fn);

    await criarStoreUpstash(OPCOES).incrementar("chave", 0.5);
    expect(comandosDa(fn)[1]).toMatchObject({ 2: 1 });
  });

  it("prefixa a chave, para nao colidir com dado de aplicacao", async () => {
    const fn = mockFetch([[{ result: 1 }, { result: 1 }]]);
    instalar(fn);

    await criarStoreUpstash(OPCOES).incrementar("minha-chave", 60);
    expect(comandosDa(fn)[0]).toMatchObject({ 1: "ratelimit:minha-chave" });
  });

  it("aplica o namespace quando informado", async () => {
    // Dois ambientes dividindo o mesmo Redis sem namespace compartilham a
    // janela: o teste de producao contaria os usos do staging e dispararia 429
    // em usuarios reais.
    const fn = mockFetch([[{ result: 1 }, { result: 1 }]]);
    instalar(fn);

    await criarStoreUpstash({ ...OPCOES, namespace: "producao" }).incrementar("k", 60);
    expect(comandosDa(fn)[0]).toMatchObject({ 1: "ratelimit:producao:k" });
  });
});

describe("leitura de TTL", () => {
  it("calcula o resetAt a partir do PTTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const fn = mockFetch([[{ result: 5 }, { result: 30_000 }]]);
    instalar(fn);

    const estado = await criarStoreUpstash(OPCOES).incrementar("k", 60);
    expect(estado.contador).toBe(5);
    expect(estado.resetAt).toBe(new Date("2026-01-01T00:00:30Z").getTime());
    vi.useRealTimers();
  });

  it("cai para a janela cheia quando o Redis devolve TTL negativo", async () => {
    // `PTTL` de -2 = chave nao existe, -1 = existe sem TTL. O segundo nao
    // deveria acontecer com o `EXPIRE NX` acima, mas se acontecer, o
    // `resetAt` em 0 faria o limitador tratar a janela como vencida e liberar
    // tudo. Preferir `janelaS` e o jeito de falhar para o lado restritivo.
    const fn = mockFetch([[{ result: 9 }, { result: -1 }]]);
    instalar(fn);

    const estado = await criarStoreUpstash(OPCOES).incrementar("k", 120);
    expect(estado.resetAt).toBeGreaterThan(Date.now());
  });

  it("trata resposta sem TTL como janela cheia, sem virar NaN", async () => {
    const fn = mockFetch([[{ result: 3 }, {}]]);
    instalar(fn);

    const estado = await criarStoreUpstash(OPCOES).incrementar("k", 60);
    expect(Number.isFinite(estado.resetAt)).toBe(true);
    expect(estado.contador).toBe(3);
  });
});

describe("inspecao", () => {
  it("devolve null quando a chave nao existe", async () => {
    const fn = mockFetch([[{ result: null }, { result: -2 }]]);
    instalar(fn);

    expect(await criarStoreUpstash(OPCOES).inspecionar("inexistente")).toBeNull();
  });

  it("devolve null quando a chave existe mas o TTL acabou", async () => {
    // `GET` e `PTTL` sao lidos no mesmo pipeline, entao nao ha corrida entre
    // eles. Ainda assim, um TTL de 0 significa janela encerrada, e devolver
    // `{contador: N}` faria o chamador bloquear quem ja pode voltar.
    const fn = mockFetch([[{ result: "7" }, { result: 0 }]]);
    instalar(fn);

    expect(await criarStoreUpstash(OPCOES).inspecionar("k")).toBeNull();
  });
});

describe("falhas", () => {
  it("propaga erro do pipeline, para a politica decidir", async () => {
    // O store nao engole erro. Quem decide e `index.ts`, e a decisao la e
    // falhar aberto. Um store que engolisse deixaria essa politica Morta sem
    // que ninguem percebesse.
    const fn = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ result: 1 }, { error: "ERR syntax error" }]),
      } as unknown as Response),
    );
    instalar(fn);

    await expect(criarStoreUpstash(OPCOES).incrementar("k", 60)).rejects.toThrow(/ERR syntax error/);
  });

  it("propaga HTTP 401, que a maioria das vezes e token expirado", async () => {
    const fn = vi.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) } as unknown as Response),
    );
    instalar(fn);

    await expect(criarStoreUpstash(OPCOES).incrementar("k", 60)).rejects.toThrow(/401/);
  });

  it("respeita o timeout, para nao segurar a requisicao", async () => {
    // O rate limit fica no caminho de TODA requisicao. Um `fetch` pendurado
    // sem timeout segura a conexao ate o limite do runtime, e o sintoma no
    // servidor e "a aplicacao esta lenta", nao "o redis esta lento".
    const fn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("abortado")));
        }),
    );
    instalar(fn);

    await expect(
      criarStoreUpstash({ ...OPCOES, timeoutMs: 20 }).incrementar("k", 60),
    ).rejects.toThrow(/abortado/);
  });
});
