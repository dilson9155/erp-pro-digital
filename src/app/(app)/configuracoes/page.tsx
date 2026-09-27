import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { readSessionToken } from "@/server/app/auth/queries";
import { authenticateSession } from "@/server/app/auth/queries";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Configuracoes" };

/**
 * Configuracoes - placeholder da FASE 1.
 *
 * Esta pagina so existe para nao dar 404 no menu lateral.
 * As configuracoes reais entram na FASE 2+ junto com os modulos de negocio.
 */
export default async function PageConfiguracoes() {
  const token = await readSessionToken();
  const autenticado = token ? await authenticateSession(token) : null;
  if (!autenticado) redirect("/login");

  const { session } = autenticado;
  if (session.tenantId === null) redirect("/escolher-empresa");
  if (session.branchId === null) redirect("/escolher-filial");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuracoes</h1>
        <p className="text-sm text-muted-foreground">
          Area de configuracoes do sistema. Em construcao (FASE 2+).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Em construcao</CardTitle>
          <CardDescription>
            As configuracoes do sistema (empresa, filiais, usuarios, permissoes, fiscais, etc.)
            serao implementadas na FASE 2 junto com os modulos de negocio correspondentes.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disponivel agora</CardTitle>
          <CardDescription>
            - Trocar de empresa (menu lateral)
            - Trocar de filial (menu lateral)
            - Logout (menu lateral)
            - Dashboard basico
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}