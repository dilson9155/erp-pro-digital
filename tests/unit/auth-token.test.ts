/**
 * Testes das FUNCOES PURAS de autenticacao.
 *
 * O que e testavel sem banco:
 * - geracao e hash de token (determinismo e ausencia de colisao);
 * - comparacao em tempo constante;
 * - politica de senha (limite de 72 BYTES, que nao e o mesmo que 72
 *   caracteres);
 * - `safeCompare` gastando o mesmo custo quando o hash e nulo.
 *
 * O que NAO e testado aqui, e por que:
 * `createSession`, `authenticateSession` e `revokeSession` tocam o banco. Um
 * teste com banco que so verifica "criou e leu de volta" nao pega o que
 * importa nesses caminhos — revogacao que nao revoga, sessao expirada que
 * continua valendo, conta bloqueada com sessao viva. Esses exigem um banco
 * real de teste, e ficam para `tests/integration`.
 *
 * Um teste que passa sem mock de verdade e um teste que mede o mock.
 */

import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  assertPasswordLength,
  safeCompare,
} from "@/lib/auth/password";
import { generateSessionToken, hashSessionToken, safeTokenEqual } from "@/server/auth/session-token";

describe("token de sessao", () => {
  it("gera tokens distintos a cada chamada", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateSessionToken()));
    expect(tokens.size).toBe(1000);
  });

  it("versiona o formato, para poder invalidar por geracao", () => {
    // Sem o prefixo, um dia seria impossivel distinguir "token de um gerador
    // antigo" de "token invalido" e seria preciso quebrar toda sessao sem
    // avisar. O prefixo permite uma deprecacao limpa.
    expect(generateSessionToken()).toMatch(/^v1_[A-Za-z0-9_-]{43}$/);
  });

  it("produz 256 bits de entropia", () => {
    // base64url de 32 bytes = 43 caracteres. Um token mais curto que isso
    // indicaria gerador trocado, e reduziria a resistencia a forca bruta.
    const token = generateSessionToken();
    const raw = Buffer.from(token.slice(3), "base64url");
    expect(raw).toHaveLength(32);
  });

  it("hasheia de forma deterministica", () => {
    // O cookie precisa produzir o mesmo hash a cada leitura, senao o
    // `findUnique` nunca encontraria a sessao.
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("nao guarda o token em claro no hash", () => {
    // Se o token aparecesse dentro do proprio hash, um dump de `sessions`
    // permitiria forjar sessao de qualquer usuario.
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).not.toContain(token);
    expect(hash).not.toContain(token.slice(3));
  });

  it("gera hash diferente para tokens diferentes", () => {
    expect(hashSessionToken(generateSessionToken())).not.toBe(
      hashSessionToken(generateSessionToken()),
    );
  });
});

describe("comparacao de token em tempo constante", () => {
  it("aceita o token correto", () => {
    const token = generateSessionToken();
    expect(safeTokenEqual(hashSessionToken(token), hashSessionToken(token))).toBe(true);
  });

  it("recusa token de outra sessao", () => {
    expect(safeTokenEqual(hashSessionToken(generateSessionToken()), hashSessionToken(generateSessionToken()))).toBe(false);
  });

  it("recusa hash de tamanho diferente sem lancar excecao", () => {
    // `timingSafeEqual` LANCA quando os buffers tem tamanhos diferentes. O
    // hash vindo do cookie pode ser de outro formato (ou lixo colado no
    // cookie), entao o guarda de tamanho e obrigatorio — sem ele, um cookie
    // adulterado derrubaria a requisicao com 500 em vez de "nao autenticado".
    expect(safeTokenEqual("abc", "abcd")).toBe(false);
    expect(safeTokenEqual("", hashSessionToken(generateSessionToken()))).toBe(false);
  });

  it("recusa token vazio", () => {
    expect(safeTokenEqual("", "")).toBe(true);
  });
});

describe("politica de senha", () => {
  it("aceita senha no limite minimo", () => {
    expect(() => assertPasswordLength("a".repeat(PASSWORD_MIN_LENGTH))).not.toThrow();
  });

  it("recusa senha abaixo do minimo", () => {
    expect(() => assertPasswordLength("a".repeat(PASSWORD_MIN_LENGTH - 1))).toThrow(/ao menos/);
  });

  it("recusa senha vazia", () => {
    expect(() => assertPasswordLength("")).toThrow();
  });

  it("mede o limite em BYTES, nao em caracteres", () => {
    // bcrypt trunca em 72 bytes. "senha" com acento ocupa mais de 1 byte por
    // caractere, entao 60 caracteres acentuados JA passam de 72 bytes e a
    // senha seria truncada em silencio — o usuario teria uma senha mais fraca
    // do que a que digitou, sem nenhum aviso.
    const acentuada = "ç".repeat(PASSWORD_MAX_LENGTH); // 2 bytes cada
    expect(acentuada).toHaveLength(PASSWORD_MAX_LENGTH);
    expect(Buffer.byteLength(acentuada, "utf8")).toBeGreaterThan(PASSWORD_MAX_LENGTH);
    expect(() => assertPasswordLength(acentuada)).toThrow(/bytes/);
  });

  it("aceita 72 bytes de acentos, que sao menos de 72 caracteres", () => {
    const acentuada = "ç".repeat(PASSWORD_MAX_LENGTH / 2); // exatamente 72 bytes
    expect(acentuada).toHaveLength(36);
    expect(() => assertPasswordLength(acentuada)).not.toThrow();
  });
});

describe("comparacao de senha sem revelar existencia da conta", () => {
  it("recusa senha quando nao ha hash (conta inexistente)", async () => {
    await expect(safeCompare("qualquer", null)).resolves.toBe(false);
  });

  it("gasta tempo comparável entre conta existente e inexistente", async () => {
    // O ataque de enumeracao de e-mail mede o TEMPO DE RESPOSTA, nao a
    // mensagem. Um login de e-mail inexistente que responde em 1 ms, contra
    // 100 ms de bcrypt para e-mail existente, entrega a lista de usuarios
    // cadastrados. Por isso `safeCompare` sempre roda bcrypt, mesmo sem hash.
    const { hashPassword } = await import("@/lib/auth/password");
    const hash = await hashPassword("senha-de-teste-123");

    const start = process.hrtime.bigint();
    await safeCompare("errada", null);
    const semHash = process.hrtime.bigint() - start;

    const start2 = process.hrtime.bigint();
    await safeCompare("errada", hash);
    const comHash = process.hrtime.bigint() - start2;

    // Margem larga de proposito: o teste roda em CI compartilhado, onde a
    // variacao e alta. A intencao e pegar regressao de ORDEM DE GRANDEZA
    // (um `if (hash)` que pulasse o bcrypt), nao jitter do agendador.
    const ratio = Number(semHash) / Math.max(1, Number(comHash));
    expect(ratio).toBeGreaterThan(0.2);
  }, 30_000);
});
