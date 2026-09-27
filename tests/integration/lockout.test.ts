/**
 * Testes do bloqueio por falhas.
 *
 * A aritmetica de penalidade e testada isolada (`lockoutSecondsFor`), sem
 * banco. O resto do arquivo so verifica as garantias que o banco precisa
 * cumprir: o incremento atomico, o reset no sucesso, e sobretudo a regra de
 * que uma conta pode ser destravada depois - o erro mais caro aqui seria a
 * conta ficar trancada para sempre.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  avaliarBloqueio,
  lockoutSecondsFor,
  registrarFalha,
  registrarSucesso,
} from "@/server/auth/lockout";
import { closeTestDb, createUser, testDb } from "../helpers/factories";
import { readDevDatabaseUrl, testDatabaseUrl, truncateAll } from "../helpers/test-database";

/** URL do banco de teste, para o `truncateAll` (que abre a propria conexao). */
let testUrl = "";

beforeAll(async () => {
  testUrl = testDatabaseUrl(await readDevDatabaseUrl());
});

afterEach(async () => {
  await truncateAll(testUrl);
});

afterAll(async () => {
  await closeTestDb();
});

const conta = () => createUser({ password: "SenhaCorreta1", status: "ATIVO" });

describe("lockoutSecondsFor", () => {
  it("cresce exponencialmente, nao linearmente", () => {
    // A progressao e 1x, 2x, 4x, 8x a partir de 60 s. O que importa e a RAZAO
    // entre ciclos: com crescimento linear, 60 tentativas - 1 por minuto -
    // bastariam para travar a conta por 1 h. Exponencial transforma a mesma
    // hora de tentativa em um cumulo de horas de espera.
    expect(lockoutSecondsFor(1)).toBe(60);
    expect(lockoutSecondsFor(2)).toBe(120);
    expect(lockoutSecondsFor(3)).toBe(240);
    expect(lockoutSecondsFor(4)).toBe(480);
    expect(lockoutSecondsFor(5)).toBe(960);
  });

  it("respeita o teto, para a conta nao ficar inutilizavel", () => {
    // Ciclo 20 sem teto seria 60 * 2^19 s, uns 18 anos. Um `Infinity` aqui
    // significaria que ninguem mais consegue entrar na conta sem um
    // administrador no banco de dados. O teto e o que torna o esquecimento de
    // senha um contratempo, e nao o fim do acesso.
    expect(lockoutSecondsFor(20)).toBe(3600);
    expect(lockoutSecondsFor(60)).toBe(3600);
  });

  it("trata ciclo invalido como o primeiro", () => {
    // `Math.ceil` de uma divisao nunca devolve 0 ou negativo, mas a funcao e
    // exportada e um valor defensivo aqui custa uma linha: nao deve explodir
    // nem devolver 0 s, que liberaria a conta.
    expect(lockoutSecondsFor(0)).toBe(60);
    expect(lockoutSecondsFor(-3)).toBe(60);
  });
});

describe("avaliarBloqueio", () => {
  const agora = new Date("2026-03-01T12:00:00Z");

  it("nao bloqueia conta nunca bloqueada", () => {
    expect(avaliarBloqueio({ failedLoginCount: 0, lockedUntil: null }, agora)).toEqual({
      bloqueado: false,
      restanteSegundos: 0,
      podeTentar: true,
    });
  });

  it("conta os segundos restantes", () => {
    const estado = avaliarBloqueio(
      { failedLoginCount: 5, lockedUntil: new Date("2026-03-01T12:00:30Z") },
      agora,
    );
    expect(estado.bloqueado).toBe(true);
    expect(estado.restanteSegundos).toBe(30);
  });

  it("libera a conta quando o prazo venceu", () => {
    // Este e o caso em que `lockedUntil` no passado NAO precisa ser apagado.
    // Se um `lockedUntil` vencido fosse tratado como bloqueio, a conta ficaria
    // trancada para sempre apos a primeira penalidade.
    const estado = avaliarBloqueio(
      { failedLoginCount: 5, lockedUntil: new Date("2026-03-01T11:00:00Z") },
      agora,
    );
    expect(estado.bloqueado).toBe(false);
    expect(estado.podeTentar).toBe(true);
  });

  it("arredonda o restante para cima", () => {
    // Restar 0,4 s arredondado para baixo daria "0" e o usuario leria que
    // pode tentar, para receber bloqueio de novo meio segundo depois.
    const estado = avaliarBloqueio(
      { failedLoginCount: 5, lockedUntil: new Date("2026-03-01T12:00:00.400Z") },
      agora,
    );
    expect(estado.restanteSegundos).toBe(1);
  });

  it("separa bloqueado de podeTentar", () => {
    // Os dois campos existem porque o login precisa de respostas diferentes:
    // bloqueado exige mostrar o prazo, liberado exige cair no caminho normal.
    const estado = avaliarBloqueio(
      { failedLoginCount: 5, lockedUntil: new Date("2026-03-01T12:05:00Z") },
      agora,
    );
    expect(estado.bloqueado).toBe(true);
    expect(estado.podeTentar).toBe(false);
  });
});

describe("no banco", () => {
  it("nao bloqueia quem erra a senha uma vez", async () => {
    // Regressao. A primeira versao deste modulo aplicava a penalidade em TODA
    // falha, e nao so ao atingir o limite. O efeito era: um unico erro de
    // digitacao deixava a conta esperando um minuto, e qualquer pessoa que
    // soubesse o e-mail de alguem conseguia trancar a conta sem nunca acertar a
    // senha. Uma falha tem de ser apenas uma contagem.
    const u = await conta();
    const estado = await registrarFalha(u.id);

    expect(estado.bloqueado).toBe(false);
    expect(estado.podeTentar).toBe(true);

    const salvo = await testDb().user.findUniqueOrThrow({
      where: { id: u.id },
      select: { failedLoginCount: true, lockedUntil: true },
    });
    expect(salvo.failedLoginCount).toBe(1);
    expect(salvo.lockedUntil).toBeNull();
  });

  it("soma as falhas consecutivemente", async () => {
    const u = await conta();

    await registrarFalha(u.id);
    await registrarFalha(u.id);
    const terceiro = await registrarFalha(u.id);

    // Com `LOGIN_MAX_ATTEMPTS` = 5, tres falhas ainda nao bloqueiam.
    expect(terceiro.bloqueado).toBe(false);

    const salvo = await testDb().user.findUniqueOrThrow({
      where: { id: u.id },
      select: { failedLoginCount: true },
    });
    expect(salvo.failedLoginCount).toBe(3);
  });

  it("bloqueia ao atingir o limite", async () => {
    const u = await conta();
    let ultimo;
    for (let i = 0; i < 5; i += 1) ultimo = await registrarFalha(u.id);

    expect(ultimo?.bloqueado).toBe(true);
    expect(ultimo?.restanteSegundos).toBeGreaterThan(0);

    const salvo = await testDb().user.findUniqueOrThrow({
      where: { id: u.id },
      select: { failedLoginCount: true, lockedUntil: true },
    });
    expect(salvo.failedLoginCount).toBe(5);
    expect(salvo.lockedUntil).toBeInstanceOf(Date);
  });

  it("nao renova a penalidade de quem insiste durante o bloqueio", async () => {
    // Se cada falha renenasse `lockedUntil`, o atacante manteria a conta
    // presa enquanto continuasse tentando - o bloqueio nunca venceria e a
    // vitima nao conseguiria nem registrar o e-mail. E o oposto do que um
    // backoff deve fazer.
    const u = await conta();
    for (let i = 0; i < 5; i += 1) await registrarFalha(u.id);

    const antes = await testDb().user.findUniqueOrThrow({
      where: { id: u.id },
      select: { lockedUntil: true },
    });

    await new Promise((r) => setTimeout(r, 20));
    await registrarFalha(u.id);
    await registrarFalha(u.id);

    const depois = await testDb().user.findUniqueOrThrow({
      where: { id: u.id },
      select: { lockedUntil: true },
    });

    expect(depois.lockedUntil?.getTime()).toBe(antes.lockedUntil?.getTime());
  });

  it("zera o contador no sucesso e marca a atividade", async () => {
    const u = await conta();
    await registrarFalha(u.id);
    await registrarFalha(u.id);
    await registrarFalha(u.id);

    await registrarSucesso(u.id, "203.0.113.9");

    const salvo = await testDb().user.findUniqueOrThrow({
      where: { id: u.id },
      select: { failedLoginCount: true, lockedUntil: true, lastLoginAt: true, lastLoginIp: true },
    });
    expect(salvo.failedLoginCount).toBe(0);
    expect(salvo.lockedUntil).toBeNull();
    expect(salvo.lastLoginIp).toBe("203.0.113.9");
    expect(salvo.lastLoginAt).toBeInstanceOf(Date);
  });

  it("nao quebra quando a conta sumiu no meio do caminho", async () => {
    // Corrida real: o login comeca, o usuario e removido, e o contador de
    // falhas chega depois. Isso nao e erro de aplicacao - e o resultado
    // correto de uma conta que nao existe mais.
    const u = await conta();
    await testDb().user.delete({ where: { id: u.id } });

    const estado = await registrarFalha(u.id);
    expect(estado).toEqual({ bloqueado: false, restanteSegundos: 0, podeTentar: true });
  });

  it("soma falhas de requisicoes simultaneas", async () => {
    // O motivo de `registrarFalha` usar aritmetica no banco. Com read+write,
    // as cinco requisicoes abaixo leriam todas `0` e gravariam `1`: o
    // contador viraria 1 em vez de 5, e uma onda de ataque - exatamente quando
    // a contagem e essencial - nao bloquearia ninguem.
    const u = await conta();

    await Promise.all(Array.from({ length: 5 }, () => registrarFalha(u.id)));

    const salvo = await testDb().user.findUniqueOrThrow({
      where: { id: u.id },
      select: { failedLoginCount: true, lockedUntil: true },
    });
    expect(salvo.failedLoginCount).toBe(5);
    expect(salvo.lockedUntil).toBeInstanceOf(Date);
  });
});
