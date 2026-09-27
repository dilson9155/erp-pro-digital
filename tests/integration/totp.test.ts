/**
 * Testes de integracao do TOTP contra o banco real.
 *
 * O que SO aqui pode ser verificado, e e o que mais importa:
 *
 *  - o segredo gravado e cifrado, e o texto claro nao esta na coluna;
 *  - o estado pendente (`totpEnabledAt = null` com segredo presente) NAO e
 *    tratado como ativo — o estado em que o telefone tem a chave mas o login
 *    nao exige codigo, e que faria a tela mentir "protegido";
 *  - o passo consumido e gravado, e o mesmo codigo nao passa duas vezes;
 *  - o codigo de recuperacao some da lista ao ser usado, e o mesmo codigo nao
 *    serve duas vezes;
 *  - um segredo ilegivel no banco nao produz 500, e sim recusa limpa.
 *
 * Todos usam um segredo conhecido, gerado aqui com o mesmo algoritmo da
 * producao, para poder calcular o codigo esperado sem depender do relogio do
 * app.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  confirmarAtivacao,
  contarRecuperacoes,
  iniciarAtivacao,
  limpar,
  usarCodigoRecuperacao,
  verificarTotp,
} from "@/server/auth/totp-service";
import { generateTotp, generateTotpSecret } from "@/lib/auth/totp";
import { decryptSecret, encryptSecret, recoveryCodeMatches } from "@/lib/auth/secret-box";
import { closeTestDb, createUser, testDb } from "../helpers/factories";
import { readDevDatabaseUrl, testDatabaseUrl, truncateAll } from "../helpers/test-database";

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

/** Ativa o TOTP de uma conta recem-criada e devolve o segredo e os backups. */
async function contaComTotpAtivo() {
  const user = await createUser({ status: "ATIVO" });
  const { segredo } = await iniciarAtivacao(user.id, user.email);
  const r = await confirmarAtivacao(user.id, generateTotp(segredo));
  expect(r.valido).toBe(true);
  // Os codigos em claro vem do proprio servico: e a unica vez que eles
  // existem fora do papel do usuario, porque o banco guarda so o SHA-256. E
  // por isso que o teste os usa em vez de tentar descobrir um valido por
  // tentativa — o que seria um chute de 27^10 e nao um teste.
  return { user, segredo, codigos: [...r.codigos] };
}

describe("ativacao", () => {
  it("grava o segredo cifrado, nunca em claro", async () => {
    const user = await createUser();
    const { segredo } = await iniciarAtivacao(user.id, user.email);

    const salvo = await testDb().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { totpSecretEncrypted: true, totpEnabledAt: true },
    });

    // A razao de a coluna existir. Um dump de `users` com o segredo em claro
    // permitiria copiar a conta para outro autenticador e entrar sem saber a
    // senha.
    expect(salvo.totpSecretEncrypted).not.toBe(segredo);
    expect(salvo.totpSecretEncrypted).not.toContain(segredo);
    expect(salvo.totpSecretEncrypted).toMatch(/^v1\./);

    // E o que esta gravado tem de voltar a ser o mesmo segredo.
    expect(decryptSecret(salvo.totpSecretEncrypted!)).toBe(segredo);
  });

  it("monta a URI com o issuer do produto", async () => {
    // Sem issuer, o app autenticador mostra so o e-mail, e quem tem conta em
    // duas empresas nao sabe qual esta protegendo.
    const user = await createUser({ email: "ana@empresa.com" });
    const { uri } = await iniciarAtivacao(user.id, user.email);
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("issuer=");
  });

  it("fica PENDENTE ate o primeiro codigo, e nao antes", async () => {
    // Este e o estado perigoso. A tela pode dizer "protegido" e o login nao
    // pedir codigo, se o servidor tratar "segredo existe" como "ativo".
    const user = await createUser();
    const { segredo } = await iniciarAtivacao(user.id, user.email);

    const pendente = await testDb().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { totpSecretEncrypted: true, totpEnabledAt: true },
    });
    expect(pendente.totpSecretEncrypted).not.toBeNull();
    expect(pendente.totpEnabledAt).toBeNull();

    // E um segredo pendente NAO autentica.
    expect(await verificarTotp(user.id, generateTotp(segredo))).toBe(false);

    await confirmarAtivacao(user.id, generateTotp(segredo));

    const ativo = await testDb().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { totpEnabledAt: true },
    });
    expect(ativo.totpEnabledAt).toBeInstanceOf(Date);
  });

  it("entrega os codigos em claro uma unica vez, na confirmacao", async () => {
    // Regressao de design. A primeira versao do servico gerava os codigos,
    // gravava o hash e devolvia so a CONTAGEM — o usuario nunca veria o backup.
    // Um segundo fator sem codigo de recuperacao visivel e, na pratica, um
    // segundo fator que as pessoas desativam quando perdem o aparelho.
    const user = await createUser();
    const { segredo } = await iniciarAtivacao(user.id, user.email);

    const r = await confirmarAtivacao(user.id, generateTotp(segredo));
    expect(r.valido).toBe(true);
    expect(r.codigos).toHaveLength(8);
    // Cada codigo entregue tem de bater com um hash gravado, senao o usuario
    // anotaria algo que nunca vai funcionar.
    const salvo = await testDb().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { totpRecoveryHashes: true },
    });
    const hashes = JSON.parse(salvo.totpRecoveryHashes!) as string[];
    for (const codigo of r.codigos) {
      expect(hashes.some((h) => recoveryCodeMatches(codigo, h))).toBe(true);
    }
  });

  it("nao devolve codigos quando a confirmacao falha", async () => {
    // Uma confirmacao recusada nao pode vir acompanhada de uma lista de
    // backups: o TOTP nao foi ativado, e o usuario anotaria codigos que o
    // sistema nao vai aceitar.
    const user = await createUser();
    await iniciarAtivacao(user.id, user.email);
    const r = await confirmarAtivacao(user.id, "000000");
    expect(r.valido).toBe(false);
    expect(r.codigos).toEqual([]);
  });

  it("gera os codigos de recuperacao na confirmacao", async () => {
    const { user } = await contaComTotpAtivo();
    expect(await contarRecuperacoes(user.id)).toBe(8);
  });

  it("nao guarda os codigos de recuperacao em claro", async () => {
    // Um backup de recuperacao que o proprio backup do banco desfaz nao e um
    // backup: quem le `users` teria todos os codigos.
    const { user } = await contaComTotpAtivo();
    const salvo = await testDb().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { totpRecoveryHashes: true },
    });
    const hashes = JSON.parse(salvo.totpRecoveryHashes!) as string[];
    expect(hashes).toHaveLength(8);
    for (const h of hashes) expect(h).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("recusa um codigo errado na confirmacao", async () => {
    const user = await createUser();
    const { segredo } = await iniciarAtivacao(user.id, user.email);
    expect((await confirmarAtivacao(user.id, "000000")).valido).toBe(false);
    // Recusar o codigo nao pode ativar nada.
    const salvo = await testDb().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { totpEnabledAt: true },
    });
    expect(salvo.totpEnabledAt).toBeNull();
    // E o segredo continua valendo para a proxima tentativa.
    expect((await confirmarAtivacao(user.id, generateTotp(segredo))).valido).toBe(true);
  });

  it("nao confirma contra um segredo que veio do cliente", async () => {
    // A confirmacao usa o segredo do BANCO. Se usasse o que o cliente manda, a
    // tela poderia confirmar um segredo nunca salvo, e o usuario ficaria com um
    // segundo fator que existe no telefone e nao existe no servidor.
    const user = await createUser();
    await iniciarAtivacao(user.id, user.email);
    const outro = generateTotpSecret();
    expect((await confirmarAtivacao(user.id, generateTotp(outro))).valido).toBe(false);
  });

  it("sobrescreve um segredo pendente em vez de acumular", async () => {
    // Duas chaves pendentes fariam o usuario escanear um QR e o telefone ficar
    // com o outro, sem nenhuma forma de sair sem desativar e recomecar.
    const user = await createUser();
    const primeiro = await iniciarAtivacao(user.id, user.email);
    const segundo = await iniciarAtivacao(user.id, user.email);
    expect(segundo.segredo).not.toBe(primeiro.segredo);

    // O codigo tem de ser o do segredo que SOBROU no banco. Se fosse o do
    // primeiro, a confirmacao falharia e o teste passaria a verificar a coisa
    // errada.
    expect((await confirmarAtivacao(user.id, generateTotp(await segredoAtual(user.id)))).valido).toBe(true);
  });
});

/**
 * Codigo do proximo passo (30 s a frente).
 *
 * necessario porque `confirmarAtivacao` CONSOME o passo do codigo que ativou o
 * segundo fator. Reusar aquele mesmo codigo no login seguinte seria, com
 * propriety, um replay — e o sistema recusa. Os testes que verificam o caminho
 * do login precisam de um codigo ainda nao consumido, e o passo seguinte cabe
 * na janela de tolerancia de +-1.
 */
function codigoSeguinte(segredo: string): string {
  return generateTotp(segredo, Date.now() + 30_000);
}

/** Le e decifra o segredo pendente da conta, para calcular o codigo esperado. */
async function segredoAtual(userId: string): Promise<string> {
  const salvo = await testDb().user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpSecretEncrypted: true },
  });
  return decryptSecret(salvo.totpSecretEncrypted!);
}

describe("verificacao no login", () => {
  it("aceita o codigo valido e recusa o invalido", async () => {
    const { user, segredo } = await contaComTotpAtivo();
    expect(await verificarTotp(user.id, codigoSeguinte(segredo))).toBe(true);
    expect(await verificarTotp(user.id, "000000")).toBe(false);
  });

  it("impede o replay do MESMO codigo", async () => {
    // O codigo vale por 90 s. Quem o ve na tela da vitima pode reapresenta-lo
    // nessa janela. Consumir o passo e o que fecha isso.
    const { user, segredo } = await contaComTotpAtivo();
    const codigo = codigoSeguinte(segredo);

    expect(await verificarTotp(user.id, codigo)).toBe(true);
    // Segunda apresentacao do MESMO codigo, no mesmo instante.
    expect(await verificarTotp(user.id, codigo)).toBe(false);
  });

  it("recusa o codigo usado na propria ativacao, logo em seguida", async () => {
    // Consequencia de proposito do consumo de passo: a pessoa que acabou de
    // ativar o segundo fator e entra em seguida com o MESMO codigo que digitou
    // na ativacao, e o sistema recusa. E o comportamento correto — se aceitasse,
    // a protecao contra replay nauria no primeiro minuto de uso, que e
    // justamente quando o codigo esta visivel para quem esta perto.
    const user = await createUser({ status: "ATIVO" });
    const { segredo } = await iniciarAtivacao(user.id, user.email);
    const codigo = generateTotp(segredo);
    expect((await confirmarAtivacao(user.id, codigo)).valido).toBe(true);
    expect(await verificarTotp(user.id, codigo)).toBe(false);
  });

  it("grava o passo consumido para o usuario consultar", async () => {
    const { user, segredo } = await contaComTotpAtivo();
    await verificarTotp(user.id, codigoSeguinte(segredo));

    const salvo = await testDb().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { totpLastStep: true },
    });
    expect(salvo.totpLastStep).not.toBeNull();
    // Numero, e nao string: o passo e um contador que a proxima verificacao
    // compara. Guardar como texto daria `Number("...")` silencioso.
    expect(typeof salvo.totpLastStep).toBe("bigint");
  });

  it("nao exige codigo de quem nao ativou", async () => {
    const user = await createUser();
    expect(await verificarTotp(user.id, "123456")).toBe(false);
  });

  it("recusa em vez de estourar quando o segredo esta corrompido", async () => {
    // Um `throw` aqui viraria 500 no login. O usuario nao tem como consertar o
    // banco, entao o caminho util e recusar e dizer que o codigo nao confere.
    const { user } = await contaComTotpAtivo();
    await testDb().user.update({
      where: { id: user.id },
      data: { totpSecretEncrypted: encryptSecret("") },
    });
    expect(await verificarTotp(user.id, "123456")).toBe(false);
  });
});

describe("codigos de recuperacao", () => {
  it("consome o codigo e o retira da lista", async () => {
    const { user, codigos } = await contaComTotpAtivo();
    const codigo = codigos[0]!;

    expect(await usarCodigoRecuperacao(user.id, codigo)).toBe(true);
    expect(await contarRecuperacoes(user.id)).toBe(7);
    // O mesmo codigo nao serve duas vezes: e o que garante que o backup de
    // papel tenha exatamente o numero de usos que a tela mostrou.
    expect(await usarCodigoRecuperacao(user.id, codigo)).toBe(false);
  });

  it("cada codigo do conjunto serve uma vez, e o total cai de um em um", async () => {
    // O backup de papel tem 8 usos. Se um codigo fosse consumido sem sair da
    // lista, a tela continuaria mostrando 8 e o usuario so descobriria que os
    // ultimos nao funcionam no momento em que precisasse deles.
    const { user, codigos } = await contaComTotpAtivo();
    for (let i = 0; i < codigos.length; i += 1) {
      expect(await usarCodigoRecuperacao(user.id, codigos[i]!)).toBe(true);
      expect(await contarRecuperacoes(user.id)).toBe(codigos.length - i - 1);
    }
  });

  it("recusa um codigo que nao existe", async () => {
    const { user } = await contaComTotpAtivo();
    expect(await usarCodigoRecuperacao(user.id, "XXXXX-XXXXX")).toBe(false);
    expect(await contarRecuperacoes(user.id)).toBe(8);
  });

  it("recusa se o TOTP nao esta ativo", async () => {
    // Usar um codigo de recuperacao com o TOTP desligado nao faz sentido: nao
    // ha nada a recuperar, e aceitar aqui daria uma via de acesso que ignora a
    // desativacao.
    const user = await createUser();
    await iniciarAtivacao(user.id, user.email);
    expect(await usarCodigoRecuperacao(user.id, "ABCDE-FGHJK")).toBe(false);
  });

  it("aguenta coluna de hashes invalida", async () => {
    // Dado corrompido nao pode virar 500 na tela de recuperacao — justamente
    // a tela que precisa funcionar. Lista vazia e a resposta segura.
    const { user } = await contaComTotpAtivo();
    await testDb().user.update({ where: { id: user.id }, data: { totpRecoveryHashes: "nao-e-json" } });
    expect(await contarRecuperacoes(user.id)).toBe(0);
    expect(await usarCodigoRecuperacao(user.id, "ABCDE-FGHJK")).toBe(false);
  });

  it("aguenta JSON valido que nao e lista", async () => {
    const { user } = await contaComTotpAtivo();
    await testDb().user.update({ where: { id: user.id }, data: { totpRecoveryHashes: '{"a":1}' } });
    expect(await contarRecuperacoes(user.id)).toBe(0);
  });
});

describe("desativacao", () => {
  it("apaga o segredo e volta a aceitar login sem codigo", async () => {
    const { user, segredo } = await contaComTotpAtivo();
    expect(await verificarTotp(user.id, codigoSeguinte(segredo))).toBe(true);

    await limpar(user.id);

    const salvo = await testDb().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { totpSecretEncrypted: true, totpEnabledAt: true, totpRecoveryHashes: true, totpLastStep: true },
    });
    expect(salvo.totpSecretEncrypted).toBeNull();
    expect(salvo.totpEnabledAt).toBeNull();
    expect(salvo.totpRecoveryHashes).toBeNull();
    expect(salvo.totpLastStep).toBeNull();
    // E um codigo qualquer deixa de valer: nada de segundo fator fantasma.
    expect(await verificarTotp(user.id, "123456")).toBe(false);
  });
});
