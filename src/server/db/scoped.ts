import type { Tenant } from "@/generated/prisma/client";

import { prismaCommon } from "@/server/db/client";
import { extendWithTenantGuard, type TenantScopedClient } from "@/server/db/tenant-guard";
import { runWithTenantScope, type TenantScope } from "@/server/db/tenant-scope";

/**
 * Client do Prisma COM escopo de tenant obrigatorio.
 *
 * Este e o UNICO client que o codigo de aplicacao deve usar. Ele e
 * constructed a partir de `prismaCommon` + a extensao `tenant-guard`, que:
 * - injeta `tenantId` em toda query de model de negocio;
 * - RECUSA a query se nao houver escopo ativo (fail-closed).
 *
 * Uso correto em um Server Component ou Route Handler:
 *
 * ```ts
 * const db = getScopedDb(session.tenantId, session.branchId);
 * const sales = await db.sale.findMany(); // sem where: tenantId e automatico
 * ```
 *
 * Uso errado (e por isso o codigo nem compila direito, o mais importante):
 *
 * ```ts
 * const sales = await prismaCommon.sale.findMany(); // vazaria todos os tenants
 * ```
 *
 * Nao ha como "esquecer" o filtro: ou o escopo existe, ou a query lanca.
 */

/**
 * Client do Prisma COM escopo de tenant obrigatorio.
 *
 * Este e o UNICO client que o codigo de aplicacao deve usar. Ele combina
 * `prismaCommon` + a extensao `tenant-guard`, que injeta `tenantId` em toda
 * query de model de negocio e RECUSA a query se nao houver escopo ativo.
 *
 * Uso correto em um Server Component ou Route Handler:
 *
 * ```ts
 * const sales = await runWithTenantScope(scope, () => scopedDb().sale.findMany());
 * //                                        sem `where`: o tenantId e automatico
 * ```
 *
 * Nao existe caminho que "esqueça" o filtro: ou o escopo existe, ou a query
 * lanca `MissingTenantScopeError`.
 */
type GuardedClient = TenantScopedClient;

const globalForScoped = globalThis as unknown as {
  prismaScoped: GuardedClient | undefined;
};

/**
 * A extensao e stateless (o escopo vive no `AsyncLocalStorage`), entao um
 * unico client protegido serve a todas as requisicoes e a todos os tenants.
 * E o que evita abrir um pool por requisicao em serverless.
 */
export function scopedDb(): GuardedClient {
  globalForScoped.prismaScoped ??= extendWithTenantGuard(prismaCommon);
  return globalForScoped.prismaScoped;
}

/**
 * Atalho que combina escopo e client. Reduz a chance de esquecer um dos dois,
 * que seria a forma mais facil de vazar dados.
 */
export function withTenantDb<T>(scope: TenantScope, fn: (db: GuardedClient) => Promise<T>) {
  return runWithTenantScope(scope, () => fn(scopedDb()));
}

/** `true` quando o client sem escopo esta sendo usado em codigo de negocio. */
export function isUnscopedClient(db: unknown): boolean {
  return db === prismaCommon;
}

/**
 * Converte o contexto da sessao em um `TenantScope` pronto para
 * `runWithTenantScope`.
 *
 * A `Session` guarda `tenantId` e `branchId`; os `allowedBranchIds` vem do
 * `UserBranchAccess` (carregado junto, no mesmo passo da sessao, para nao
 * haver TOCTOU entre a checagem e o uso).
 */
export function scopeFromSession(input: {
  tenantId: string;
  branchId: string | null;
  allowedBranchIds: readonly string[] | null;
  userId: string;
  sessionId: string;
  isPlatformAdmin: boolean;
}): TenantScope {
  return {
    tenantId: input.tenantId,
    branchId: input.branchId,
    allowedBranchIds: input.allowedBranchIds,
    userId: input.userId,
    sessionId: input.sessionId,
    isPlatformAdmin: input.isPlatformAdmin,
  };
}

/**
 * `true` quando o tenant pode ser considerado ativo para operacoes de escrita.
 *
 * Uma assinatura vencida NAO apaga dados: o sistema continua em
 * somente-leitura, preservando o obligation de guarda de documentos fiscais.
 */
export function isTenantWritable(tenant: Pick<Tenant, "status" | "blockedAt">): boolean {
  if (tenant.blockedAt !== null) return false;
  return tenant.status === "ATIVA" || tenant.status === "TRIAL";
}

/** `true` quando o tenant esta em trial e deve ver o contador de dias. */
export function isInTrial(tenant: Pick<Tenant, "status" | "trialEndsAt">): boolean {
  return tenant.status === "TRIAL" && tenant.trialEndsAt !== null;
}
