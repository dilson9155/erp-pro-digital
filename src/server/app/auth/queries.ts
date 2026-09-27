/**
 * Queries de autenticação para Server Components.
 *
 * NÃO têm "use server" — são módulos servidores puros, chamados direto
 * por Server Components (layouts, pages). O Next.js não permite "use server"
 * em arquivos que só re-exportam ou contêm tipos; ele exige funções async.
 */

import { readSessionToken, writeSessionCookie, clearSessionCookie } from "@/server/auth/cookie";
import { authenticateSession, createSession, definirContextoSessao, revokeSession, revokeAllSessions, touchSession } from "@/server/auth/session";
import { decidirAcesso, precisaEscolherFilial, type ContextoAcesso, type ContextoSessao, type DecisaoAcesso, type MotivoNegativa } from "@/server/auth/policy";
import { avaliarBloqueio, registrarFalha, registrarSucesso, aplicarRehash } from "@/server/auth/lockout";
import { verificarTotp } from "@/server/auth/totp-service";
import { prismaCommon } from "@/server/db/client";

export { readSessionToken, writeSessionCookie, clearSessionCookie };
export { authenticateSession, createSession, definirContextoSessao, revokeSession, revokeAllSessions, touchSession };
export { decidirAcesso, precisaEscolherFilial, type ContextoAcesso, type ContextoSessao, type DecisaoAcesso, type MotivoNegativa };
export { avaliarBloqueio, registrarFalha, registrarSucesso, aplicarRehash };
export { verificarTotp };

export async function buscarMembershipAtivas(userId: string) {
  const memberships = await prismaCommon.membership.findMany({
    where: { userId, active: true, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      tenant: { select: { id: true, name: true, primaryColor: true } },
      isOwner: true,
      branchAccess: { select: { branchId: true } },
    },
  });

  return memberships.map((m) => ({
    membershipId: m.id,
    tenantId: m.tenantId,
    tenantName: m.tenant.name,
    tenantSlug: m.tenant.name, // fallback; slug não existe no schema
    isOwner: m.isOwner,
    branchIds: m.branchAccess.length > 0 ? m.branchAccess.map((b) => b.branchId) : null,
    primaryColor: m.tenant.primaryColor,
  }));
}

export async function buscarMembershipAtivaPorId(membershipId: string | null) {
  if (!membershipId) return null;
  return prismaCommon.membership.findFirst({
    where: { id: membershipId, active: true, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      isOwner: true,
      branchAccess: { select: { branchId: true } },
    },
  });
}

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