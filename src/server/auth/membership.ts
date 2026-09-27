/**
 * Vínculo do usuário com as empresas.
 *
 *POR QUE UM USUÁRIO PODE TER VÁRIAS EMPRESAS
 *
 * `User` não tem `tenantId`: o vínculo é `Membership`. Isso não é normalização
 * gratuita, é uma decisão de domínio — o mesmo e-mail pode ser o dono de três
 * empresas, e modelar isso com `tenantId` em `User` obrigaria a duplicar a
 * pessoa e a senha. O preço é que toda autorização precisa do `membershipId` (e
 * não só do `userId`), e é por isso que o ADR 0003 exige `Membership` mesmo
 * para o super admin da plataforma.
 *
 * Este módulo é a LEITURA desse vínculo. A decisão de o que a pessoa pode fazer
 * depois de escolhida a empresa está em `policy.ts` e `rbac.ts`; aqui não há
 * `if` de autorização, só consulta — o que torna seguro reusar esta lista na
 * tela de escolha sem medo de estar vazando um nome de empresa indevido.
 */

import { prismaCommon } from "@/server/db/client";

/** Uma empresa à qual o usuário pertence, no formato da tela de escolha. */
export interface VinculoEmpresa {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly tenantSlug: string;
  /** `true` quando a pessoa é a dona (`Membership.isOwner`). */
  readonly isOwner: boolean;
  /** Filiais liberadas para esta membership, ou `null` = todas. */
  readonly branchIds: readonly string[] | null;
  readonly primaryColor: string | null;
}

/**
 * Empresas ativas do usuário, em ordem alfabética.
 *
 * Filtra `Membership.active` e `deletedAt` porque a tela de escolha é a
 * PRIMEIRA superfície que consome essa lista: mostrar uma empresa cuja
 * membership foi desligada leva a pessoa a um `/dashboard` que vai negar logo
 * em seguida, com a impressão de que o produto quebrou.
 *
 * A ordem é alfabética e não por `createdAt` de propósito: uma lista de
 * empresas que muda de ordem quando alguém cria uma empresa nova obriga a
 * pessoa a reencontrar o item todo acesso. `createdAt` fica no dado, para o
 * produto quiser ordenar por outra coisa depois.
 */
export async function buscarMembershipAtivas(userId: string): Promise<VinculoEmpresa[]> {
  const memberships = await prismaCommon.membership.findMany({
    where: {
      userId,
      active: true,
      deletedAt: null,
      // Empresa deletada ou cancelada não aparece: o vínculo existe, mas não há
      // o que abrir.
      tenant: { deletedAt: null, status: { not: "CANCELADA" } },
    },
    select: {
      id: true,
      isOwner: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          primaryColor: true,
        },
      },
      branchAccess: { select: { branchId: true } },
    },
    orderBy: { tenant: { name: "asc" } },
  });

  return memberships.map((m) => ({
    membershipId: m.id,
    tenantId: m.tenant.id,
    tenantName: m.tenant.name,
    tenantSlug: m.tenant.slug,
    isOwner: m.isOwner,
    // `UserBranchAccess` é a lista explícita de filiais. Vazio significa "sem
    // restrição declarada" (acesso a todas); é por isso que o array vazio vira
    // `null` em vez de `[]` — os dois valores significam coisas opostas para o
    // consumidor, e distinguir aqui evita que cada tela decida por si.
    branchIds: m.branchAccess.length > 0 ? m.branchAccess.map((b) => b.branchId) : null,
    primaryColor: m.tenant.primaryColor,
  }));
}

/** Uma membership pelo id, ou `null` se não existir/for inativa. */
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
