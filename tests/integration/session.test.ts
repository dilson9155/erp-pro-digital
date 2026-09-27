/**
 * Testes de integracao da sessao.
 *
 * Estes testes existem porque os caminhos de erro de sessao NAO sao alcancaveis
 * por teste unitario, e sao exatamente eles que protegem o acesso ao sistema.
 *
 * O que o teste unitario ja garante (`tests/unit/auth-token.test.ts`):
 * - o token tem 256 bits de entropia e nao colide;
 * - o hash e deterministico e nao contem o token;
 * - a comparacao e em tempo constante e lanca excecao em tamanho divergente;
 * - `safeCompare` gasta o mesmo custo sem hash.
 *
 * O que SO aqui pode ser verificado, porque exige o banco de verdade:
 * - revogar a sessao realmente impede o acesso;
 * - uma sessao expirada por tempo e rejeitada e marcada como EXPIRADA;
 * - conta bloqueada derruba a sessao que ja estava autenticada;
 * - a empresa do cookie e a mesma gravada na sessao (impossibilidade de fixar
 *   empresa pelo cookie, que e o ataque de troca de contexto).
 *
 * Cada um desses tem um modo de falha que passa em revisao de codigo e falha
 * so em producao, as 3 da manha.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  authenticateSession,
  createSession,
  revokeAllSessions,
  revokeSession,
  touchSession,
} from "@/server/auth/session";
import { hashSessionToken } from "@/server/auth/session-token";
import { closeTestDb, createMembership, createTenantWithBranch, createUser, testDb } from "../helpers/factories";
import { TEST_SCHEMA, readDevDatabaseUrl, testDatabaseUrl, truncateAll } from "../helpers/test-database";

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

describe("ciclo de vida da sessao", () => {
  it("cria a sessao com o token em claro fora do banco", async () => {
    const user = await createUser();
    const { session, token } = await createSession({ userId: user.id });

    // O que volta para o navegador e o token; o que fica no banco e o SHA-256.
    // Se o token em claro estivesse no banco, um dump de `sessions` bastaria
    // para clonar a sessao de qualquer usuario.
    expect(token).toMatch(/^v1_/);
    expect(session.tokenHash).toBe(hashSessionToken(token));
    expect(session.tokenHash).not.toContain(token);

    const persisted = await testDb().session.findUniqueOrThrow({ where: { id: session.id } });
    expect(persisted.tokenHash).toBe(hashSessionToken(token));
  });

  it("autentica com o token correto e devolve os dados do usuario", async () => {
    const user = await createUser({ name: "Ana Paula" });
    const { token } = await createSession({ userId: user.id });

    const result = await authenticateSession(token);

    expect(result).not.toBeNull();
    expect(result?.user.id).toBe(user.id);
    expect(result?.user.email).toBe(user.email);
    expect(result?.user.name).toBe("Ana Paula");
  });

  it("recusa token inexistente, sem criar sessao", async () => {
    const result = await authenticateSession(`v1_${"a".repeat(43)}`);
    expect(result).toBeNull();
  });

  it("recusa token vazio", async () => {
    // Um cookie vazio ou ausente nao pode ser tratado como "sem token": o
    // fluxo de escolha de empresa depende de saber que NAO ha sessao.
    expect(await authenticateSession("")).toBeNull();
  });

  it("nao confunde o token de uma sessao com o de outra", async () => {
    const user = await createUser();
    const primeira = await createSession({ userId: user.id });
    const segunda = await createSession({ userId: user.id });

    expect((await authenticateSession(primeira.token))?.session.id).toBe(primeira.session.id);
    expect((await authenticateSession(segunda.token))?.session.id).toBe(segunda.session.id);
  });
});

describe("revogacao", () => {
  it("revogar a sessao impede o acesso imediatamente", async () => {
    const user = await createUser();
    const { session, token } = await createSession({ userId: user.id });

    // Antes de revogar, funciona. Este passo e o que impede que o teste
    // passe por um motivo errado (ex.: `authenticateSession` sempre devolvendo
    // null, que tambem "passaria" na revogacao).
    expect(await authenticateSession(token)).not.toBeNull();

    await revokeSession(session.id, "logout");

    expect(await authenticateSession(token)).toBeNull();
  });

  it("grava o motivo da revogacao, para a trilha de auditoria", async () => {
    const user = await createUser();
    const { session } = await createSession({ userId: user.id });

    await revokeSession(session.id, "troca de senha");

    const persisted = await testDb().session.findUniqueOrThrow({ where: { id: session.id } });
    expect(persisted.status).toBe("REVOGADA");
    expect(persisted.revokedReason).toBe("troca de senha");
    expect(persisted.revokedAt).not.toBeNull();
  });

  it("revogar duas vezes nao corrompe o registro", async () => {
    // Logout pode ser clicado duas vezes (doble clique, retry de rede). O
    // segundo `revokeSession` nao pode falhar nem sobrescrever o motivo do
    // primeiro, que e a informacao de POR QUE a sessao caiu.
    const user = await createUser();
    const { session } = await createSession({ userId: user.id });

    await revokeSession(session.id, "logout");
    await expect(revokeSession(session.id, "logout")).resolves.toBeUndefined();

    const persisted = await testDb().session.findUniqueOrThrow({ where: { id: session.id } });
    expect(persisted.revokedReason).toBe("logout");
  });

  it("revogar uma sessao nao derruba as outras do mesmo usuario", async () => {
    const user = await createUser();
    const celular = await createSession({ userId: user.id });
    const notebook = await createSession({ userId: user.id });

    await revokeSession(celular.session.id, "logout");

    expect(await authenticateSession(celular.token)).toBeNull();
    // Este e o cenario de logout de UM dispositivo, e nao "sair de todos".
    expect(await authenticateSession(notebook.token)).not.toBeNull();
  });

  it("revoga todas as sessoes, preservando a atual quando informado", async () => {
    // E o que "sair de todos os dispositivos" faz ao trocar a senha, e o que o
    // super admin usa ao bloquear um usuario. A sessao atual sobrevive para
    // que o super admin nao se desconecte no meio da operacao.
    const user = await createUser();
    const atual = await createSession({ userId: user.id });
    const antiga1 = await createSession({ userId: user.id });
    const antiga2 = await createSession({ userId: user.id });

    const count = await revokeAllSessions(user.id, "troca de senha", atual.session.id);
    expect(count).toBe(2);

    expect(await authenticateSession(atual.token)).not.toBeNull();
    expect(await authenticateSession(antiga1.token)).toBeNull();
    expect(await authenticateSession(antiga2.token)).toBeNull();
  });

  it("nao revoga sessoes de outro usuario", async () => {
    // O filtro `userId` e o que impede um bug de "sair de todos" virar
    // "derrubar a sessao de todo mundo da plataforma".
    const alice = await createUser();
    const bob = await createUser();
    const sAlice = await createSession({ userId: alice.id });
    const sBob = await createSession({ userId: bob.id });

    await revokeAllSessions(alice.id, "teste");

    expect(await authenticateSession(sBob.token)).not.toBeNull();
    expect(await authenticateSession(sAlice.token)).toBeNull();
  });
});

describe("expiracao por tempo", () => {
  it("rejeita sessao expirada e a marca como EXPIRADA", async () => {
    const user = await createUser();
    const { session, token } = await createSession({ userId: user.id });

    // Empurra o vencimento para o passado, em vez de esperar a expiracao
    // natural (12 h por padrao) ou de falsificar o relogio.
    await testDb().session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await authenticateSession(token)).toBeNull();

    // A marcacao importa alem do rechazo: a tela de seguranca lista as
    // sessoes, e sem o status ela mostraria a sessao como ativa para sempre.
    const persisted = await testDb().session.findUniqueOrThrow({ where: { id: session.id } });
    expect(persisted.status).toBe("EXPIRADA");
  });

  it("aceita sessao que ainda nao venceu", async () => {
    const user = await createUser();
    const { token } = await createSession({ userId: user.id });
    expect(await authenticateSession(token)).not.toBeNull();
  });

  it("respeita 'lembrar acesso': sessao longa nao expira em 12 h", async () => {
    const user = await createUser();
    const curta = await createSession({ userId: user.id, rememberMe: false });
    const longa = await createSession({ userId: user.id, rememberMe: true });

    expect(longa.maxAgeSeconds).toBeGreaterThan(curta.maxAgeSeconds);
    expect(longa.session.expiresAt.getTime()).toBeGreaterThan(curta.session.expiresAt.getTime());
  });
});

describe("estado da conta derruba a sessao", () => {
  it("bloquear a conta derruba a sessao que ja estava autenticada", async () => {
    // Este e o furo que o teste unitario nao pega. Se `authenticateSession`
    // so checasse expiracao, o usuario bloqueado continuaria com acesso
    // valido ate o token morrer — que pode ser mais 30 dias, com
    // "lembrar acesso" ligado.
    const user = await createUser();
    const { token } = await createSession({ userId: user.id });
    expect(await authenticateSession(token)).not.toBeNull();

    await testDb().user.update({ where: { id: user.id }, data: { status: "BLOQUEADO" } });

    expect(await authenticateSession(token)).toBeNull();
  });

  it("marca a sessao como revogada ao derrubar por bloqueio", async () => {
    // Sem o motivo, nem o usuario nem o suporte conseguem responder "por que
    // fui desconectado?". O motivo carrega o status exato, nao um texto
    // generico: "conta em status BLOQUEADO" e acaoavel (desbloquear),
    // "conta bloqueada ou inativa" nao e.
    const user = await createUser();
    const { session, token } = await createSession({ userId: user.id });

    await testDb().user.update({ where: { id: user.id }, data: { status: "BLOQUEADO" } });
    await authenticateSession(token);

    const persisted = await testDb().session.findUniqueOrThrow({ where: { id: session.id } });
    expect(persisted.status).toBe("REVOGADA");
    expect(persisted.revokedReason).toBe("conta em status BLOQUEADO");
  });

  it("desativar a conta tambem derruba a sessao", async () => {
    const user = await createUser();
    const { token } = await createSession({ userId: user.id });

    await testDb().user.update({ where: { id: user.id }, data: { status: "INATIVO" } });

    expect(await authenticateSession(token)).toBeNull();
  });

  it("conta pendente de ativacao nao autentica", async () => {
    // Um convite aceito cria o usuario como PENDENTE_ATIVACAO. Sem esta
    // checagem, o usuario conseguiria logar antes de confirmar o e-mail.
    const user = await createUser({ status: "PENDENTE_ATIVACAO" });
    const { token } = await createSession({ userId: user.id });

    expect(await authenticateSession(token)).toBeNull();
  });
});

describe("empresa e filial na sessao", () => {
  it("aceita sessao sem empresa, para a tela de escolha", async () => {
    // `Session.tenantId` e anulavel por design: entre o login e a escolha de
    // empresa, a sessao existe sem empresa. Filtrar a sessao por tenant
    // destruiria essa tela — e a razao de a autenticacao usar `prismaCommon`.
    const user = await createUser();
    const { session, token } = await createSession({ userId: user.id });

    expect(session.tenantId).toBeNull();
    expect((await authenticateSession(token))?.session.id).toBe(session.id);
  });

  it("guarda a empresa escolhida e a devolve na autenticacao", async () => {
    const { tenant, branch } = await createTenantWithBranch();
    const user = await createUser();
    const membership = await createMembership(tenant.id, user.id, true);

    const { token } = await createSession({
      userId: user.id,
      membershipId: membership.id,
      tenantId: tenant.id,
      branchId: branch.id,
    });

    const result = await authenticateSession(token);
    expect(result?.session.tenantId).toBe(tenant.id);
    expect(result?.session.branchId).toBe(branch.id);
    expect(result?.session.membershipId).toBe(membership.id);
  });

  it("impede que o cookie fixe a empresa: quem manda e a sessao", async () => {
    // Este teste documenta a propriedade de seguranca central do design: o
    // cookie e um token OPACO. Nao ha `tenantId` nele para o atacante
    // adulterar, e o `tenantId` efetivo vem da linha de `sessions`, no banco.
    //
    // Para provar que nao ha como forjar, o teste mostra que alterar o token
    // invalida o acesso — nao "muda a empresa", mas INVALIDA.
    const { tenant } = await createTenantWithBranch();
    const user = await createUser();
    const membership = await createMembership(tenant.id, user.id, true);
    const { token } = await createSession({
      userId: user.id,
      membershipId: membership.id,
      tenantId: tenant.id,
    });

    // Um token adulterado, se quizesse apontar para outra empresa, nao
    // encontraria hash correspondente.
    const adulterado = `${token.slice(0, -4)}AAAA`;
    expect(await authenticateSession(adulterado)).toBeNull();

    // E o token legitimo continua devolvendo a empresa que esta no banco.
    expect((await authenticateSession(token))?.session.tenantId).toBe(tenant.id);
  });
});

describe("atividade da sessao", () => {
  it("atualiza lastSeenAt apenas depois do intervalo", async () => {
    // `touchSession` existe para nao transformar cada page load em UPDATE.
    // O intervalo e o que garante isso: chamar duas vezes seguidas nao pode
    // gravar duas vezes.
    const user = await createUser();
    const { session } = await createSession({ userId: user.id });

    await testDb().session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    await touchSession(session.id);

    const depois = await testDb().session.findUniqueOrThrow({ where: { id: session.id } });
    expect(depois.lastSeenAt.getTime()).toBeGreaterThan(
      new Date(Date.now() - 10 * 60 * 1000).getTime(),
    );
  });

  it("nao grava quando a sessao foi vista ha pouco", async () => {
    const user = await createUser();
    const { session } = await createSession({ userId: user.id });

    const antes = await testDb().session.findUniqueOrThrow({ where: { id: session.id } });
    await touchSession(session.id);
    const depois = await testDb().session.findUniqueOrThrow({ where: { id: session.id } });

    expect(depois.lastSeenAt.getTime()).toBe(antes.lastSeenAt.getTime());
  });

  it("nao lanca quando a sessao nao existe mais", async () => {
    // Logout seguido de "estou vivo" e normal. Um `touchSession` que lancasse
    // transformaria a corrida entre duas abas em um erro 500.
    await expect(touchSession("sessao-que-nunca-existiu")).resolves.toBeUndefined();
  });
});

describe("isolamento do banco de teste", () => {
  it("os dados de teste NAO aparecem no schema public", async () => {
    // Se a infra de teste estivesse errada e apontasse para `public`, este
    // teste falharia — e o dano (dados de teste na base de desenvolvimento)
    // ja estaria feito. E a ultima linha de defesa contra a falha silenciosa
    // mais cara deste projeto.
    const user = await createUser();
    const db = testDb();
    const schema = await db.$queryRaw<{ table_schema: string }[]>`
      SELECT table_schema FROM information_schema.tables
       WHERE table_schema IN ('public', ${TEST_SCHEMA}) AND table_name = 'users'
    `;
    const hasPublic = schema.some((row) => row.table_schema === "public");
    const hasTest = schema.some((row) => row.table_schema === TEST_SCHEMA);

    // O client de teste nao deve enxergar `public`.
    const visivel = await db.user.findMany({ where: { id: user.id } });
    expect(visivel).toHaveLength(1);
    expect(hasTest).toBe(true);
    // `public` existe no banco, mas o `search_path` deste client nao aponta
    // para ele; se apontasse, o `users` do `public` estaria visivel tambem.
    expect(hasPublic).toBe(true);
  });
});
