/**
 * Bridge de banco para a camada app.
 *
 * Re-exporta apenas queries específicas. NÃO exporta prismaCommon nem
 * scopedDb direto — isso forçaria o app a saber de tenantId, que é
 * responsabilidade do bridge.
 */

export * from "./queries";
export type { TenantScope } from "@/server/db/tenant-scope";