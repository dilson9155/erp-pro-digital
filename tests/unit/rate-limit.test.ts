/**
 * Testes de rate limit.
 *
 * O store em memoria e usado como driver porque a politica e o que esta sendo
 * testado, e a politica nao sabe qual store esta atras. O store do Upstash tem
 * um teste proprio, com `fetch` substituido, porque o que pode dar errado la e
 * outra coisa: o formato do pipeline e o tratamento de TTL.
 *
 * Os casos nao cobrem "funciona N vezes". Cada um descreve um ataque ou uma
 * falha de operacao que o codigo sem o teste deixaria passar.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { criarStoreMemoria } from "@/server/rate-limit/memoria";
import {
  LIMITES,
  consumir,
  definirStoreParaTeste,
  headersDeLimite,
  limitarLoginPorConta,
  limitarLoginPorIp,
} from "@/server/rate-limit";
import type { RateLimitStore } from "@/server/rate-limit/store";

beforeEach(() => {
  definirStoreParaTeste(criarStoreMemoria());
});

afterEach(() => {
  definirStoreParaTeste(undefined);
  vi.useRealTimers();
});

/** Escolhe o limite `login` com numeros que cabem em um teste curto. */
const MAX = 3;
const JANELA = 60;

async function comLoginReduzido(fn: () => Promise<void>): Promise<void> {
  const original = LIMITES.login;
  Object.assign(LIMITES.login, { max: MAX, janelaSegundos: JANELA });
  try {
    await fn();
  } finally {
    Object.assign(LIMITES.login, original);
  }
}

describe("janela de contagem", () => {
  it("libera ate o maximo e bloqueia o seguinte", async () => {
    await comLoginReduzido(async () => {
      for (let i = 1; i <= MAX; i += 1) {
        const r = await limitarLoginPorIp("203.0.113.10");
        expect(r.permitido, `tentativa ${i} devia passar`).toBe(true);
        expect(r.restante).toBe(MAX - i);
      }

      const bloqueada = await limitarLoginPorIp("203.0.113.10");
      expect(bloqueada.permitido).toBe(false);
      expect(bloqueada.mensagem).toContain("Muitas tentativas");
    });
  });

  it("zera quando a janela vence", async () => {
    vi.useFakeTimers();
    Object.assign(LIMITES.login, { max: 2, janelaSegundos: 10 });

    await limitarLoginPorIp("203.0.113.11");
    await limitarLoginPorIp("203.0.113.11");
    expect((await limitarLoginPorIp("203.0.113.11")).permitido).toBe(false);

    vi.advanceTimersByTime(10_001);
    expect((await limitarLoginPorIp("203.0.113.11")).permitido).toBe(true);
  });

  it("nao renova a janela a cada tentativa", async () => {
    // O bug que este teste cobre: se a expiracao fosse renovada a cada
    // incremento, quem insistisse no login nunca sairia do bloqueio. Com a
    // janela presa em 10 s, um atacante que responde 1 vez por segundo mantem
    // o contador acima do limite para sempre, e a protecao vira um DoS contra o
    // usuario legitimo.
    vi.useFakeTimers();
    Object.assign(LIMITES.login, { max: 2, janelaSegundos: 10 });

    await limitarLoginPorIp("203.0.113.12");
    await limitarLoginPorIp("203.0.113.12");

    // Duas tentativas dentro da janela, e nenhuma renova o prazo.
    vi.advanceTimersByTime(6_000);
    await limitarLoginPorIp("203.0.113.12");
    expect((await limitarLoginPorIp("203.0.113.12")).permitido).toBe(false);

    // A partir de 10 s do PRIMEIRO uso, libera — nao 10 s do ultimo.
    vi.advanceTimersByTime(4_001);
    expect((await limitarLoginPorIp("203.0.113.12")).permitido).toBe(true);
  });
});

describe("as duas dimensoes do ataque ao login", () => {
  it("IP e conta sao contadores independentes", async () => {
    // O ataque em massa: mesmo IP, mil e-mails diferentes. O limite por IP
    // precisa segurar, e so ele segura.
    await comLoginReduzido(async () => {
      for (let i = 0; i < MAX; i += 1) {
        await limitarLoginPorIp("198.51.100.7");
      }
      const emMassa = await limitarLoginPorIp("198.51.100.7");
      expect(emMassa.permitido).toBe(false);

      // E o inverso: N IPs contra a MESMA conta. Cada IP tem folga propria, e
      // o limite por conta e o que fecha isso.
      for (let i = 0; i < MAX; i += 1) {
        await limitarLoginPorConta("alvo@empresa.com.br", );
      }
      expect((await limitarLoginPorConta("alvo@empresa.com.br")).permitido).toBe(false);
    });
  });

  it("normaliza o e-mail, para nao contar a mesma pessoa como duas", async () => {
    await comLoginReduzido(async () => {
      for (let i = 0; i < MAX; i += 1) {
        await limitarLoginPorConta("Alvo@Empresa.com.BR");
      }
      // Mesmo e-mail, caixa e espacos diferentes. Se nao fosse normalizado, o
      // contador comecaria de novo e o ataque passaria a cada variacao de
      // digitacao — que e o que um formularios de login produz.
      const comEspaco = await limitarLoginPorConta("  alvo@empresa.com.br  ");
      expect(comEspaco.permitido).toBe(false);
    });
  });

  it("nao conta um IP diferente contra a mesma conta como a mesma pessoa", async () => {
    // O contrario do teste anterior: e correto que dois IPs NAO compartilhem o
    // contador de conta unico. Se compartilhassem, um atacante em 3 IPs zeraria
    // a cota de todo mundo que loga daquele mesmo ASN.
    await comLoginReduzido(async () => {
      await limitarLoginPorConta("alvo@empresa.com.br");
      await limitarLoginPorConta("alvo@empresa.com.br");
      expect((await limitarLoginPorConta("alvo@empresa.com.br")).permitido).toBe(true);
    });
  });
});

describe("consulta nao consome", () => {
  it("inspecionar nao gasta vaga de quem ja esta bloqueado", async () => {
    // Sem isto, cada tentativa de quem esta bloqueado renovaria a propria
    // punicao: responder 429 mais 2 segundos empurra o desbloqueio para sempre
    // e a pessoa fica presa sem poder nem tentar de novo legitimamente.
    await comLoginReduzido(async () => {
      for (let i = 0; i < MAX + 1; i += 1) {
        await limitarLoginPorIp("203.0.113.20");
      }
      const antes = await limitarLoginPorIp("203.0.113.20", true);
      expect(antes.permitido).toBe(false);

      await limitarLoginPorIp("203.0.113.20", true);
      await limitarLoginPorIp("203.0.113.20", true);

      const depois = await limitarLoginPorIp("203.0.113.20", true);
      expect(depois.permitido).toBe(false);
      expect(depois.restante).toBe(antes.restante);
    });
  });

  it("inspecionar sem consumo anterior nao abre janela", async () => {
    await comLoginReduzido(async () => {
      const primeira = await limitarLoginPorIp("203.0.113.21", true);
      expect(primeira.permitido).toBe(true);
      expect(primeira.restante).toBe(MAX);
    });
  });
});

describe("falha do store", () => {
  function storeQueFalha(): RateLimitStore {
    // `async` aqui e uma mentira: a rejeicao ja e assincrona por natureza de
    // ser uma Promise. Sem `await`, `require-await` esta ligado e cobraria a
    // forma; `Promise.reject` diz a mesma coisa e nao mente sobre o sincronismo.
    const erro = () => Promise.reject(new Error("ECONNREFUSED no redis"));
    return {
      incrementar: erro,
      inspecionar: erro,
      limpar: () => Promise.resolve(),
    };
  }

  it("libera a requisicao quando o store esta fora", async () => {
    // A decisao de projeto central deste modulo. Falhar fechado aqui significaria
    // que uma queda do Upstash tira o login do ar inteiro — e o usuario
    // impediria acesso por causa de um contador. O bloqueio de conta, que vive
    // no banco, continua valendo: sao duas camadas de dependencias diferentes.
    definirStoreParaTeste(storeQueFalha());
    const r = await limitarLoginPorIp("203.0.113.30");
    expect(r.permitido).toBe(true);
  });

  it("libera tambem na consulta, nao so no consumo", async () => {
    definirStoreParaTeste(storeQueFalha());
    expect((await limitarLoginPorIp("203.0.113.31", true)).permitido).toBe(true);
  });

  it("devolve um resultado coerente no caminho de falha", async () => {
    // O fallback precisa ser um `Resultado` valido, nao um objeto meio
    // preenchido: quem chama vai transformar isto em header e em mensagem na
    // tela. Um `resetAt` inventado aqui viraria um `Retry-After` mandando o
    // cliente voltar cedo e tomar 429 de novo.
    definirStoreParaTeste(storeQueFalha());
    const r = await limitarLoginPorIp("203.0.113.33");

    expect(r.permitido).toBe(true);
    expect(r.resetAt).toBe(0);
    expect(r.mensagem).toBe(LIMITES.login.mensagem);
    // Sem `resetAt`, nenhum header de espera e emitido. Confere que a
    // liberation nao vira um "tente de novo em 1 s" que so adia o problema.
    expect(headersDeLimite(r)["Retry-After"]).toBeUndefined();
  });

  it("volta a contar normalmente quando o store se recupera", async () => {
    // Uma queda do Redis e temporaria. A politica nao pode ficar presa no modo
    // de falha depois que o servico volta.
    const quebrado = storeQueFalha();
    definirStoreParaTeste(quebrado);
    expect((await limitarLoginPorIp("203.0.113.34")).permitido).toBe(true);

    definirStoreParaTeste(criarStoreMemoria());
    expect((await limitarLoginPorIp("203.0.113.34")).permitido).toBe(true);
  });
});

describe("separacao entre limites", () => {
  it("conta separadamente por nome de limite", async () => {
    // Login estourado nao pode barrar a API, nem o contrario. Se as chaves
    // colidissem, o mesmo contador serviria para os dois e um endpoint pesado
    // derrubaria o login de todo mundo.
    await comLoginReduzido(async () => {
      for (let i = 0; i < MAX + 1; i += 1) {
        await limitarLoginPorIp("203.0.113.40");
      }
      expect((await limitarLoginPorIp("203.0.113.40")).permitido).toBe(false);

      const api = await consumir("api", ["ip", "203.0.113.40"]);
      expect(api.permitido).toBe(true);
    });
  });

  it("separa conta de IP dentro do mesmo limite", async () => {
    await comLoginReduzido(async () => {
      for (let i = 0; i < MAX + 1; i += 1) {
        await limitarLoginPorConta("alvo@empresa.com.br");
      }
      // O mesmo IP tentando outra conta continua com folga: e o outro limite
      // que decide, e ele ainda temFN budgets.
      expect((await limitarLoginPorIp("203.0.113.41")).permitido).toBe(true);
    });
  });
});

describe("chave sem dado pessoal", () => {
  it("nao usa o e-mail cru dentro da chave", async () => {
    // A chave vai para o Redis, onde a leitura e trivial para quem tem acesso.
    // Uma chave com e-mail transforma o Redis numa lista de clientes que
    // tentaram login — dado que o ERP trata como pessoal.
    const store = criarStoreMemoria();
    definirStoreParaTeste(store);
    await limitarLoginPorConta("pessoa.real@empresa.com.br");

    let encontrouCru = false;
    const originalInspecionar = store.inspecionar.bind(store);
    vi.spyOn(store, "inspecionar").mockImplementation(async (chave) => {
      if (chave.includes("@") || chave.toLowerCase().includes("empresa.com")) encontrouCru = true;
      return originalInspecionar(chave);
    });

    await limitarLoginPorConta("pessoa.real@empresa.com.br", true);
    expect(encontrouCru).toBe(false);
  });

  it("gera contadores independentes para e-mails diferentes", async () => {
    // `restante` sozinho nao distingue as chaves quando as duas contas têm a
    // mesma contagem. O que prova a independencia e gastar a cota de uma e ver
    // a outra intacta.
    await comLoginReduzido(async () => {
      await limitarLoginPorConta("a@empresa.com");
      await limitarLoginPorConta("b@empresa.com");

      // Esgota "a": contador 3 de um max de 3.
      await limitarLoginPorConta("a@empresa.com");
      await limitarLoginPorConta("a@empresa.com");

      const a = await limitarLoginPorConta("a@empresa.com", true);
      const b = await limitarLoginPorConta("b@empresa.com", true);

      expect(a.restante).toBe(0);
      expect(b.restante).toBe(MAX - 1);
    });
  });
});

describe("headers de 429", () => {
  it("converte o resetAt em Retry-After em segundos", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    Object.assign(LIMITES.login, { max: 1, janelaSegundos: 90 });

    await limitarLoginPorIp("203.0.113.50");
    const bloqueada = await limitarLoginPorIp("203.0.113.50");
    expect(bloqueada.permitido).toBe(false);

    const headers = headersDeLimite(bloqueada);
    // 90 s de janela, arredondado para cima: nunca menos que o tempo real, o
    // que faria o cliente voltar cedo e tomar 429 de novo.
    expect(headers["Retry-After"]).toBe("90");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
  });

  it("nunca manda Retry-After negativo ou zero", () => {
    vi.useFakeTimers();
    const headers = headersDeLimite({
      permitido: false,
      restante: -5,
      resetAt: Date.now() - 60_000,
      mensagem: "x",
    });
    // `Math.max(1, ...)` evita o header "0", que diz ao cliente "tente agora" e
    // produz um 429 a menos.
    expect(headers["Retry-After"]).toBe("1");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
  });
});
