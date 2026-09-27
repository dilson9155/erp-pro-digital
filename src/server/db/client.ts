import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { type TenantScopedClient } from "@/server/db/tenant-guard";
import { withTenantScope } from "@/server/db/tenant-scope";

/**
 * Prisma Client com driver adapter `pg` (Prisma 7).
 *
 * Por que `@prisma/adapter-pg` e nao o engine binario do Prisma:
 * - permite pool proprio, essencial em serverless e na Vercel;
 * - dispensa o binario nativo do Rust, que nao roda em runtimes edge;
 * - o `pg` e amplamente auditado e observavel;
 * - permite reaproveitar uma unica conexao do pool por transacao.
 *
 * IMPORTANTE: este arquivo cria o client COMUM (sem escopo de tenant), usado
 * por: login, carga de sessao, jobs, seed, scripts e webhooks. O codigo de
 * aplicacao NUNCA deve importar daqui diretamente. Use `scopedDb()` de
 * `src/server/db/scoped.ts`, que e fail-closed.
 */

/**
 * Em dev, o Next recarrega os modulos a cada alteracao. Sem o singleton, cada
 * recarga abriria um novo pool e esgotaria o limite de conexoes do Postgres
 * local em poucos reloads.
 */
const globalForPrisma = globalThis as unknown as {
  prismaCommon: PrismaClient | undefined;
  prismaPool: PrismaPg | undefined;
};

function createPool(config: ReturnType<typeof env>): PrismaPg {
  return new PrismaPg({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    connectionTimeoutMillis: config.DATABASE_POOL_TIMEOUT_MS,
    // Uma consulta travada segura uma conexao do pool ate o limite. Um teto
    // explicito devolve o erro em vez de derrubar a aplicacao inteira.
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 30_000,
    application_name: `${config.LOG_SERVICE_NAME}:common`,
  });
}

function createClient(config: ReturnType<typeof env>): PrismaClient {
  const adapter = globalForPrisma.prismaPool ?? createPool(config);
  if (config.NODE_ENV !== "production") globalForPrisma.prismaPool = adapter;

  return new PrismaClient({
    adapter,
    log: config.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const config = env();

export const prismaCommon: PrismaClient = globalForPrisma.prismaCommon ?? createClient(config);

if (config.NODE_ENV !== "production") {
  globalForPrisma.prismaCommon = prismaCommon;
}

/**
 * Executa `fn` com escopo de tenant E com o client protegido, para jobs e
 * webhooks (contextos que nao passam pelo HTTP e portanto nao tem sessao).
 *
 * `fn` recebe o client com a extensao aplicada, entao o `tenantId` e
 * injetado automaticamente. Este e o metodo correto para o worker que processa
 * a fila fiscal de varias empresas: ele le `fiscalJob` sem filtro, e a extensao
 * devolve apenas os jobs da empresa daquela iteracao.
 *
 * Este metodo NAO e um escape hatch para acesso cross-tenant. Quem precisa
 * disso e `withSystemScope()`, que e explicito e loga um aviso.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (db: TenantScopedClient) => Promise<T>,
  options: { reason: string },
): Promise<T> {
  // Import diferido: `scoped.ts` importa este arquivo, e um import de topo
  // aqui criaria um ciclo de modulos.
  const { scopedDb } = await import("@/server/db/scoped");
  return withTenantScope(tenantId, () => fn(scopedDb()), options);
}

/** Health check do banco. Usado por `/api/health` e pelo probe da Vercel. */
export async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const startedAt = performance.now();
  try {
    await prismaCommon.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    log("db").error({ err: error }, "health check do banco falhou");
    return { ok: false, latencyMs: Math.round(performance.now() - startedAt) };
  }
}
