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

import { env } from "@/lib/env";
import { prismaCommon } from "@/server/db/client";
import { generateSessionToken, hashSessionToken } from "@/server/auth/session-token";

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
