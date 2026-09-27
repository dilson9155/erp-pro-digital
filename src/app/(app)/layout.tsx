import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { readSessionToken, authenticateSession, decidirAcesso, precisaEscolherFilial, type ContextoAcesso, buscarMembershipAtivaPorId } from "@/server/app/auth/queries";
import { buscarMembershipComTenant } from "@/server/app/auth/queries";
import { buscarFilialPorId } from "@/server/app/db";
import { NavLateral } from "./nav-lateral";
import type { TenantScope } from "@/server/app/db";

export const dynamic = "force-dynamic";

/**
 * Layout do sistema: o portao de entrada do app.
 *
 * Este e o UNICO lugar onde a sessao e exigida de verdade para `src/app/(app)`.
 * Tudo que estiver no grupo herda esta verificacao, entao uma pagina nova entra
 * no grupo e ja nasce protegida, sem ninguem lembrar de escrever o guard.
 *
 * POR QUE `decidirAcesso` E NAO UMA CADEIA DE `if`
 *
 * A ordem das checagens aqui nao e uma preferencia de leitura: ela e a regra, e o
 * ADR 0003 ja escreveu. Reescrever a ordem neste arquivo criaria uma segunda
 * versao da politica — e a divergencia entre as duas e o tipo de bug que o
 * modulo `policy.ts` existe para impedir. Por isso o layout so traduz o
 * `tipo` da decisao em destino de redirect.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const token = await readSessionToken();
  const autenticado = token ? await authenticateSession(token) : null;
  if (!autenticado) redirect("/login");

  const { user, session } = autenticado;

  const membership = session.membershipId
    ? await buscarMembershipComTenant(session.membershipId, user.id)
    : null;

  const contexto: ContextoAcesso = {
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    membershipAtiva: session.membershipId === null ? null : membership !== null,
    isPlatformAdmin: user.isPlatformAdmin,
  };

  const decisao = decidirAcesso(contexto, { tenantId: session.tenantId, branchId: session.branchId });

  switch (decisao.tipo) {
    case "troca_de_senha":
      redirect("/trocar-senha");
    case "escolha_de_empresa":
      redirect("/escolher-empresa");
    case "negado":
      redirect(`/acesso-bloqueado?motivo=${decisao.motivo}`);
  }

  if (precisaEscolherFilial(contexto, { tenantId: session.tenantId, branchId: session.branchId })) {
    redirect("/escolher-filial");
  }

  if (!membership || session.tenantId === null) redirect("/acesso-bloqueado");

  // Busca membership completa para allowedBranchIds
  const membershipCompleta = await buscarMembershipAtivaPorId(session.membershipId!);

  const scope: TenantScope = {
    tenantId: session.tenantId!,
    branchId: session.branchId,
    allowedBranchIds: membershipCompleta?.branchAccess.map(({ branchId }) => branchId) ?? null,
    userId: user.id,
    sessionId: session.id,
    isPlatformAdmin: user.isPlatformAdmin,
  };

  const filial = session.branchId ? await buscarFilialPorId(scope, session.branchId) : null;

  return (
    <div className="flex min-h-svh">
      <NavLateral
        tenantName={membership.tenant.name}
        primaryColor={membership.tenant.primaryColor}
        userName={user.name}
        userEmail={user.email}
        isOwner={membership.isOwner}
        branchName={filial?.name ?? null}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b px-6 lg:hidden">
          <span className="text-sm font-medium">{membership.tenant.name}</span>
          {filial ? <span className="text-xs text-muted-foreground">{filial.name}</span> : null}
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}