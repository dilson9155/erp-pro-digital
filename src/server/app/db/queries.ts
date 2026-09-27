"use server";

import { withTenantDb } from "@/server/db/scoped";
import { prismaCommon } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant-scope";

/**
 * Queries de leitura para a camada app.
 *
 * Não re-exporta prismaCommon. Cada função usa withTenantDb com um
 * TenantScope completo, garantindo isolamento. Se o app precisar de outra
 * consulta, adicione uma função aqui — não importe o client direto.
 */

export async function contarFiliais(scope: TenantScope): Promise<number> {
  return withTenantDb(scope, (db) => db.branch.count({ where: { active: true, deletedAt: null } }));
}

export async function contarMemberships(scope: TenantScope): Promise<number> {
  return withTenantDb(scope, (db) => db.membership.count({ where: { active: true, deletedAt: null } }));
}

export async function contarUnidades(scope: TenantScope): Promise<number> {
  return withTenantDb(scope, (db) => db.unit.count({ where: { active: true, deletedAt: null } }));
}

export async function buscarFiliaisParaEscolha(scope: TenantScope, membershipId: string) {
  return withTenantDb(scope, async (db) => {
    const acessos = await db.userBranchAccess.findMany({
      where: { membershipId },
      select: { branchId: true },
    });
    const liberadas = acessos.map((a) => a.branchId);

    return db.branch.findMany({
      where: {
        tenantId: scope.tenantId,
        active: true,
        deletedAt: null,
        ...(liberadas.length > 0 ? { id: { in: liberadas } } : {}),
      },
      select: { id: true, name: true, code: true, isHeadquarters: true },
      orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }],
    });
  });
}

export async function buscarFilialPorId(scope: TenantScope, branchId: string) {
  return withTenantDb(scope, (db) =>
    db.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } })
  );
}

export async function buscarTenantPorId(scope: TenantScope) {
  return withTenantDb(scope, (db) =>
    db.tenant.findUnique({ where: { id: scope.tenantId }, select: { id: true, name: true, primaryColor: true } })
  );
}

/**
 * Busca membership com tenant, válido para layout do app.
 *
 * A query filtra por `membershipId` (único global) E `userId`, então não vaza
 * cross-tenant mesmo usando `prismaCommon`. O `prismaCommon` é legítimo aqui
 * porque o bridge é quem o usa — o app nunca o importa.
 */
export async function buscarMembershipComTenant(membershipId: string, userId: string) {
  return prismaCommon.membership.findFirst({
    where: { id: membershipId, userId, active: true, deletedAt: null },
    select: {
      isOwner: true,
      tenant: { select: { id: true, name: true, primaryColor: true } },
    },
  });
}

export async function buscarMembershipComTenantPorId(membershipId: string) {
  return prismaCommon.membership.findFirst({
    where: { id: membershipId, active: true, deletedAt: null },
    select: {
      isOwner: true,
      tenant: { select: { id: true, name: true, primaryColor: true } },
    },
  });
}

/**
 * Verifica se a membership tem restrição de filial.
 *
 * Usa prismaCommon porque filtra por membershipId (único global) — não vaza
 * cross-tenant. O bridge é a autoridade; o app nunca importa prismaCommon.
 */
export async function membershipTemRestricaoFilial(membershipId: string): Promise<boolean> {
  const count = await prismaCommon.userBranchAccess.count({ where: { membershipId } });
  return count > 0;
}