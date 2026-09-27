/**
 * Persistencia de sessao.
 *
 * Este arquivo e a FRONTEIRA da autenticacao: e o que decide se um cookie
 * vira acesso ao sistema. Tudo que ele nega, e negacao definitiva.
 *
 * POR QUE USAR `prismaCommon` E NAO O CLIENT PROTEGIDO
 *
 * A extensao de tenant RECUSA qualquer operacao sem escopo. Para carregar uma
 * sessao, o escopo ainda nao existe: ele e o que a sessao vai ESTABELECER.
 * Usar o client protegido aqui produziria um deadlock logico — a sessao nunca
 * poderia ser lida porque a leitura exigiria a sessao.
 *
 * Alem disso, `Session.tenantId` e anulavel por design: entre o login e a
 * escolha de empresa, a sessao existe sem empresa. `Role.tenantId` e anulavel
 * pelo mesmo motivo (perfil de sistema, clonado por empresa).
 *
 * O risco do `prismaCommon` e real e por isso que o ESLint bloqueia o import
 * dele fora de `src/server/`. A autenticacao e a unica autoridade legitima
 * para consultar dados de varias empresas, e ela nao consulta dado de negocio:
 * apenas le `users`, `sessions` e `memberships` para provar quem esta entrando.
 */

import { SessionStatus, UserStatus } from "@/generated/prisma/enums";
import type { Session } from "@/generated/prisma/client";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { prismaCommon } from "@/server/db/client";
import { generateSessionToken, hashSessionToken } from "@/server/auth/session-token";
import { readSessionToken, clearSessionCookie } from "@/server/auth/cookie";
import { log as criarLog } from "@/lib/logger";

const log = criarLog("auth.session");

/** Dados que o chamador (login, fluxo de tenant, impersonacao) ja tem. */
export interface CreateSessionInput {
  readonly userId: string;
  readonly membershipId?: string | null;
  readonly tenantId?: string | null;
  readonly branchId?: string | null;
  readonly rememberMe?: boolean;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  readonly impersonatedBySessionId?: string | null;
  readonly impersonationReason?: string | null;
}

/** Campos do usuario necessarios apos a autenticacao. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  /**
   * Status da conta no momento da autenticacao.
   *
   * Esta no contrato porque `decidirAcesso` PRECISA dele para responder "acesso",
   * "troca de senha" ou "negado". Sem o campo, todo consumidor teria de buscar o
   * usuario de novo, e a checagem de status deixaria de ser uma consequencia da
   * autenticacao para virar uma consulta a parte — que e como uma sessao revogada
   * por mudanca de status sobrevive ate a proxima navegacao.
   */
  readonly status: UserStatus;
  readonly isPlatformAdmin: boolean;
  readonly mustChangePassword: boolean;
  readonly hasTotp: boolean;
}

/** Sessao recem-criada, com o token em claro. */
export interface CreatedSession {
  readonly session: Session;
  /** Valor para o cookie. NUNCA persistido, NUNCA logado. */
  readonly token: string;
  /** Segundos ate expirar, para `Max-Age` do cookie. */
  readonly maxAgeSeconds: number;
}

/** Duracao escolhida, em segundos, conforme "lembrar acesso". */
function ttlSeconds(rememberMe: boolean): number {
  const config = env();
  return rememberMe ? config.SESSION_TTL_REMEMBER_SECONDS : config.SESSION_TTL_SECONDS;
}

/**
 * Cria a sessao e devolve o token para o cookie.
 *
 * O token e gerado aqui e NAO e recuperavel depois: o banco guarda o SHA-256.
 * Se o caller perder o valor, a unica saida e criar outra sessao. E o
 * comportamento correto — do contrario, existiria um caminho de leitura do
 * token em claro.
 */
export async function createSession(input: CreateSessionInput): Promise<CreatedSession> {
  const token = generateSessionToken();
  const ttl = ttlSeconds(input.rememberMe ?? false);
  const now = Date.now();

  const session = await prismaCommon.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: input.userId,
      membershipId: input.membershipId ?? null,
      tenantId: input.tenantId ?? null,
      branchId: input.branchId ?? null,
      rememberMe: input.rememberMe ?? false,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      impersonatedBySessionId: input.impersonatedBySessionId ?? null,
      impersonationReason: input.impersonationReason ?? null,
      status: SessionStatus.ATIVA,
      expiresAt: new Date(now + ttl * 1000),
      lastSeenAt: new Date(now),
    },
  });

  return { session, token, maxAgeSeconds: ttl };
}

/**
 * Sessao AUTENTICADA, ja validada contra status do usuario.
 *
 * Devolve `null` em TODO caso invalido. Nao lanca, nao differentiate. O
 * chamador trata `null` como "nao autenticado" e leva o usuario ao login; a
 * distincao entre "cookie invalido", "sessao expirada" e "conta bloqueada"
 * fica no log, nunca na resposta.
 *
 * Por que a checagem de `expiresAt` e no codigo e nao so no filtro do banco:
 * para marcar a sessao como EXPIRADA (e nao apenas ignora-la) precisamos saber
 * que passou do prazo.
 */
export async function authenticateSession(
  token: string,
): Promise<{ session: Session; user: AuthenticatedUser } | null> {
  if (!token) return null;

  const record = await prismaCommon.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          mustChangePassword: true,
          isPlatformAdmin: true,
          totpEnabledAt: true,
        },
      },
    },
  });

  if (!record) {
    return null;
  }

  // Sessao revogada: motivo ja registrado. Nao ha como "ressuscitar".
  if (record.status === SessionStatus.REVOGADA) {
    return null;
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    // Marca expirada para o dashboard de seguranca e para nao recontar a sessao
    // como ativa. Falha aqui e tolerable: e melhor um `null` do que uma excecao
    // no meio do login.
    await prismaCommon.session
      .update({
        where: { id: record.id },
        data: { status: SessionStatus.EXPIRADA, revokedAt: new Date() },
      })
      .catch(() => undefined);
    return null;
  }

  // Estado da conta decide se a sessao EXISTE. E o ponto mais importante
  // desta funcao, porque e o que impede um usuario bloqueado de continuar
  // operando com um cookie ainda valido: sem esta checagem, "bloquear" so
  // impediria novos logins, e o acesso duraria ate o token expirar — que, com
  // "lembrar acesso", e 30 dias.
  //
  // ALLOWLIST, NAO DENYLIST. A condicao e `status === ATIVO`, e nao
  // "status diferente de INATIVO e BLOQUEADO". A razao e o que acontece quando
  // alguem adicionar um valor novo ao enum `UserStatus` daqui a seis meses: com
  // allowlist, o novo status e NEGADO ate alguem pensar nele; com denylist, ele
  // e CONCEDIDO por omissao. Erro de configuracao que falha fechado custa um
  // login a mais; erro que falha aberto custa o sistema.
  //
  // Os quatro status:
  //   ATIVO              -> autenticado.
  //   INATIVO            -> conta desativada (pelo usuario ou por administracao).
  //   BLOQUEADO          -> bloqueio por tentativas de login ou por administracao.
  //   PENDENTE_ATIVACAO  -> convite aceito, e-mail ainda nao confirmado.
  //
  // `PENDENTE_ATIVACAO` merece nota: a pessoa PRECISA entrar no sistema para
  // confirmar o e-mail e trocar a senha, mas nao pode receber uma sessao
  // comum. A tela de ativacao e servida a partir do login, com um token de uso
  // unico, e nao de `Session`. Negar aqui e o que garante que uma conta
  // convidado nao acesse a area da empresa antes de assumir o vinculo com ela.
  if (record.user.status !== UserStatus.ATIVO) {
    await revokeSession(record.id, `conta em status ${record.user.status}`);
    return null;
  }

  const user: AuthenticatedUser = {
    id: record.user.id,
    email: record.user.email,
    name: record.user.name,
    status: record.user.status,
    isPlatformAdmin: record.user.isPlatformAdmin,
    mustChangePassword: record.user.mustChangePassword,
    hasTotp: record.user.totpEnabledAt !== null,
  };

  return { session: record, user };
}

/**
 * Registra atividade, sem tocar em `lastSeenAt` a cada requisicao.
 *
 * `lastSeenAt` e atualizado no maximo uma vez a cada 5 minutos. Sem isso, cada
 * page load vira um UPDATE, e o "ultimo acesso" exibido na tela de seguranca
 * passa a ser o instante da requisicao, nao o do uso real.
 */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export async function touchSession(sessionId: string): Promise<void> {
  const now = new Date();
  await prismaCommon.session
    .updateMany({
      // `lastSeenAt` e NOT NULL com `@default(now())`, entao nunca e nulo: o
      // corte e puramente temporal. O filtro no `where` (e nao um `if` em
      // TypeScript) faz a operacao ser uma unica query idempotente, sem
      // leitura previa — o que importa com pool compartilhado.
      where: {
        id: sessionId,
        lastSeenAt: { lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) },
      },
      data: { lastSeenAt: now, activityCount: { increment: 1 } },
    })
    .catch(() => undefined);
}

/**
 * Revoga UMA sessao (logout).
 *
 * `revokeAll` e o logout global: trocar a senha, o super admin ultravo um
 * usuário, o usuario suspecto de robo. Nesses casos as outras sessoes caem
 * junto, senao "sair de todos os dispositivos" seria so um texto na tela.
 */
export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await prismaCommon.session.updateMany({
    where: { id: sessionId, status: SessionStatus.ATIVA },
    data: { status: SessionStatus.REVOGADA, revokedAt: new Date(), revokedReason: reason },
  });
}

/** Revoga todas as sessoes de um usuario, exceto opcionalmente a atual. */
export async function revokeAllSessions(
  userId: string,
  reason: string,
  exceptSessionId?: string,
): Promise<number> {
  const result = await prismaCommon.session.updateMany({
    where: {
      userId,
      status: SessionStatus.ATIVA,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { status: SessionStatus.REVOGADA, revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

/**
 * Escolhe a empresa (e a filial) em que a sessao vai trabalhar.
 *
 * POR QUE ISTO E UMA funCAO E NAO UM `session.update` NA ACTION
 *
 * A action da tela de escolha tem um `membershipId` vindo do FORMULARIO, e esse
 * id decide qual empresa a pessoa vai enxergar. Confiar no id do formulario e
 * aceitar: qualquer pessoa trocaria o valor no devtools e abriria a empresa de
 * outra pessoa. Por isso a validacao mora AQUI, e a unica coisa que a action
 * precisa e dizer e "a sessao `X` escolheu a membership `Y`".
 *
 * A verificacao tem DUAS partes, e a segunda e a que costuma faltar:
 *
 *  1. a membership pertence a este `userId`?  (impede trocar de empresa)
 *  2. a membership esta ativa e a empresa nao esta deletada?  (impede entrar
 *     numa empresa desligada)
 *
 * Sem a 2, bastava desativar a membership de alguém e a sessao continuaria
 * apontando para ela: o `Membership` deixaria de ser consultado em pedido
 * posterior, mas a sessao ja carregaria o `tenantId` — e o `tenant-guard`
 * confia no escopo da sessao.
 */
export async function definirContextoSessao(input: {
  sessionId: string;
  userId: string;
  membershipId: string;
  branchId?: string | null;
}): Promise<{ ok: true; branchId: string | null } | { ok: false; motivo: "vinculo_invalido" | "filial_invalida" }> {
  const membership = await prismaCommon.membership.findFirst({
    where: {
      id: input.membershipId,
      // Parte 1: a membership e desta pessoa.
      userId: input.userId,
      // Parte 2: membership viva e empresa viva.
      active: true,
      deletedAt: null,
      tenant: { deletedAt: null, status: { not: "CANCELADA" } },
    },
    select: { id: true, tenantId: true, branchAccess: { select: { branchId: true } } },
  });

  if (!membership) return { ok: false, motivo: "vinculo_invalido" };

  const branchId = input.branchId ?? null;

  if (branchId !== null) {
    // Convenção de `membership.ts`: `branchAccess` VAZIO significa "sem
    // restrição declarada", ou seja, todas as filiais da empresa. Testar
    // `.some()` direto rejeitaria justamente esse caso — a pessoa ficaria sem
    // filial nenhuma e o layout a devolveria para esta tela para sempre.
    const semRestricao = membership.branchAccess.length === 0;
    const liberada = semRestricao || membership.branchAccess.some((b) => b.branchId === branchId);

    // E a filial precisa ser DA EMPRESA (`tenantId`), não só estar viva: sem
    // este `in`, uma filial de outra empresa seria aceita e a sessão passaria a
    // operar no estoque errado.
    const filial = await prismaCommon.branch.findFirst({
      where: { id: branchId, tenantId: membership.tenantId, active: true, deletedAt: null },
      select: { id: true },
    });
    if (!filial || !liberada) return { ok: false, motivo: "filial_invalida" };
  } else if (membership.branchAccess.length > 0) {
    // "Todas as filiais" é recusado para quem tem restrição: essa pessoa só
    // enxerga as liberadas, e liberar o agregado seria ampliar o escopo dela.
    return { ok: false, motivo: "filial_invalida" };
  }

  // `updateMany` com o `userId` no filtro: se a sessao nao for desta pessoa, o
  // update nao casa com nada e `count === 0` — sem carregar a sessao antes para
  // conferir. E a mesma razao do `touchSession`.
  const resultado = await prismaCommon.session.updateMany({
    where: { id: input.sessionId, userId: input.userId, status: SessionStatus.ATIVA },
    data: { membershipId: membership.id, tenantId: membership.tenantId, branchId },
  });

  if (resultado.count === 0) return { ok: false, motivo: "vinculo_invalido" };
  return { ok: true, branchId };
}

/**
 * Ações de escolha de contexto: empresa, filial e logout.
 *
 * Moram aqui (em `session.ts`) porque operam sobre a sessão, e `definirContextoSessao`
 * já vive neste módulo. O bridge `@/server/app/auth` re-exporta estas funções.
 * Manter tudo junto evita o `import("@/server/auth/session").then(...)` dinâmico
 * que a versão anterior usava para `revokeSession`.
 */

async function sessaoAtual() {
  const token = await readSessionToken();
  if (!token) return null;
  return authenticateSession(token);
}

/** Escolhe a empresa e redireciona para escolha de filial. */
export async function escolherEmpresa(formData: FormData): Promise<void> {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");

  const membershipId = String(formData.get("membershipId") ?? "");
  if (!membershipId) redirect("/login");

  const resultado = await definirContextoSessao({
    sessionId: sessao.session.id,
    userId: sessao.user.id,
    membershipId,
  });

  if (!resultado.ok) {
    log.warn({ motivo: resultado.motivo }, "escolha_empresa_negada");
    redirect("/login");
  }

  redirect("/escolher-filial");
}

/** Escolhe a filial. `null` = "todas as filiais". */
export async function escolherFilial(formData: FormData): Promise<void> {
  const sessao = await sessaoAtual();
  if (!sessao || sessao.session.tenantId === null) redirect("/login");

  const bruto = String(formData.get("branchId") ?? "");
  const branchId = bruto === "" || bruto === "todas" ? null : bruto;

  const resultado = await definirContextoSessao({
    sessionId: sessao.session.id,
    userId: sessao.user.id,
    membershipId: sessao.session.membershipId ?? "",
    branchId,
  });

  if (!resultado.ok) {
    log.warn({ motivo: resultado.motivo }, "escolha_filial_negada");
    redirect("/escolher-filial");
  }

  redirect("/dashboard");
}

/** Encerra a sessão (logout). */
export async function encerrarSessao(): Promise<void> {
  const token = await readSessionToken();
  if (token) {
    const sessao = await authenticateSession(token);
    if (sessao) await revokeSession(sessao.session.id, "logout");
  }
  await clearSessionCookie();
  log.info({}, "logout");
  redirect("/login");
}

/** User-Agent, para log. */
export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
