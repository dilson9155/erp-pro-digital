import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { readSessionToken, authenticateSession, buscarMembershipAtivaPorId } from "@/server/app/auth/queries";
import { contarFiliais, contarMemberships, contarUnidades } from "@/server/app/db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TenantScope } from "@/server/app/db";

export const metadata: Metadata = { title: "Visao geral" };

/**
 * Dashboard da FASE 1.
 *
 * E uma tela de fumaca, nao um relatorio: mostra que o caminho inteiro funciona
 * (sessao -> empresa -> filial -> leitura com escopo) sem prometer numero que
 * o modulo de vendas ainda nao produz.
 *
 * As queries usam o bridge `@/server/app/db` com `withTenantDb` e um
 * `TenantScope` completo. Não há `prismaCommon` direto na camada app.
 */
export default async function PageDashboard() {
  const token = await readSessionToken();
  const autenticado = token ? await authenticateSession(token) : null;
  if (!autenticado) redirect("/login");

  const { user, session } = autenticado;
  if (session.tenantId === null) redirect("/escolher-empresa");
  if (session.branchId === null) redirect("/escolher-filial");

  // Busca membership para obter allowedBranchIds
  const membership = await buscarMembershipAtivaPorId(session.membershipId!);

  const scope: TenantScope = {
    tenantId: session.tenantId!,
    branchId: session.branchId,
    allowedBranchIds: membership?.branchAccess.map((b) => b.branchId) ?? null,
    userId: user.id,
    sessionId: session.id,
    isPlatformAdmin: user.isPlatformAdmin,
  };

  const [filiais, usuarios, unidades] = await Promise.all([
    contarFiliais(scope),
    contarMemberships(scope),
    contarUnidades(scope),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visao geral</h1>
        <p className="text-sm text-muted-foreground">
          {session.branchId ? "Dados da filial selecionada." : "Dados de todas as filiais."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Indicador rotulo="Filiais" valor={filiais} />
        <Indicador rotulo="Usuarios com acesso" valor={usuarios} />
        <Indicador rotulo="Unidades de medida" valor={unidades} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Proximos modulos</CardTitle>
          <CardDescription>
            A base de seguranca esta pronta. Os proximos modulos entram por ordem de dependencia: unidade de
            medida, categoria, marca e produto — nesta ordem, porque cada um referencia o anterior.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{rotulo}</CardDescription>
        <CardTitle className="text-3xl">{valor}</CardTitle>
      </CardHeader>
    </Card>
  );
}