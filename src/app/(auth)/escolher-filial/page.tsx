import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { readSessionToken, authenticateSession, buscarMembershipAtivaPorId, definirContextoSessao } from "@/server/app/auth/queries";
import { escolherFilial } from "@/server/app/auth";
import { buscarFiliaisParaEscolha, membershipTemRestricaoFilial } from "@/server/app/db";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TenantScope } from "@/server/app/db";

export const metadata: Metadata = { title: "Escolher filial" };

/**
 * Escolha de filial.
 *
 * `branchId` é obrigatório em 19 models (`Sale`, `StockItem`, `Invoice`,
 * `NumberSequence`...), e o `tenant-guard` NÃO o injeta: ele só sabe o
 * `tenantId`. Ou seja, a filial é uma dimensão que a camada de negócio precisa
 * escolher, e é por isso que ela é escolhida explicitamente aqui em vez de ser
 * deduzida.
 *
 * A opção "todas as filiais" existe porque `TenantScope.branchId === null`
 * significa exatamente "sem filial fixa" no código de negócio, e essa
 * ambiguidade (nenhuma filial escolhida vs. todas) precisa ser resolvida por
 * quem opera — o sistema não pode adivinhar.
 */
export default async function PageEscolherFilial() {
  const token = await readSessionToken();
  const autenticado = token ? await authenticateSession(token) : null;
  if (!autenticado) redirect("/login");

  const { user, session } = autenticado;
  if (session.tenantId === null) redirect("/escolher-empresa");

  const membership = await buscarMembershipAtivaPorId(session.membershipId);
  if (!membership) redirect("/acesso-bloqueado");

  const scope: TenantScope = {
    tenantId: session.tenantId!,
    branchId: session.branchId,
    allowedBranchIds: membership.branchAccess.map((b) => b.branchId),
    userId: user.id,
    sessionId: session.id,
    isPlatformAdmin: user.isPlatformAdmin,
  };

  // A query `buscarFiliaisParaEscolha` já aplica a regra de `branchAccess`:
  // vazio = todas as filiais da empresa; não vazio = apenas as liberadas.
  const filiais = await buscarFiliaisParaEscolha(scope, membership.id);

  // Uma filial só (ou nenhuma) não é escolha: perguntar seria um botão que não
  // decide nada.
  //
  // E aqui NÃO pode ser um `redirect("/dashboard")`: o layout do app manda de
  // volta para esta tela sempre que `branchId === null`, então pular para o
  // dashboard sem gravar a filial seria laço infinito (layout -> dashboard ->
  // layout -> ...). A única saída é GRAVAR a escolha. Uma filial é a única
  // escolha possível, e a gravacao acontece agora.
  if (filiais.length === 1) {
    const unica = filiais[0];
    if (unica) {
      await definirContextoSessao({
        sessionId: session.id,
        userId: user.id,
        membershipId: membership.id,
        branchId: unica.id,
      });
    }
    redirect("/dashboard");
  }

  if (filiais.length === 0) {
    // Nenhuma filial liberada: não há para onde escolher, e o "sem filial fixa"
    // também foi recusado por `definirContextoSessao` (a pessoa tem restrição e
    // nenhuma filial dentro dela). Explicar é melhor que loopar.
    redirect("/acesso-bloqueado?motivo=sem_vinculo_com_a_empresa");
  }

  const temRestricao = await membershipTemRestricaoFilial(membership.id);

  return (
    <div className="w-full max-w-lg space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Escolha a filial</h1>
        <p className="text-sm text-muted-foreground">
          Vendas, estoque e documentos fiscais pertencem a uma filial.
        </p>
      </div>

      <ul className="space-y-3">
        {filiais.map((f) => (
          <li key={f.id}>
            <form action={escolherFilial}>
              <input type="hidden" name="branchId" value={f.id} />
              <Card className="transition-colors hover:border-primary/50">
                <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="text-base">
                      {f.name}
                      {f.isHeadquarters ? " (matriz)" : ""}
                    </CardTitle>
                    <CardDescription className="mt-1">Codigo {f.code}</CardDescription>
                  </div>
                  <Button type="submit" variant="outline">
                    Abrir
                  </Button>
                </CardHeader>
              </Card>
            </form>
          </li>
        ))}

        {!temRestricao ? (
          <li>
            <form action={escolherFilial}>
              <input type="hidden" name="branchId" value="todas" />
              <Card className="border-dashed transition-colors hover:border-primary/50">
                <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="text-base">Ver todas as filiais</CardTitle>
                    <CardDescription className="mt-1">
                      Sem filial fixa. Serve para consulta; a escrita pede uma filial.
                    </CardDescription>
                  </div>
                  <Button type="submit" variant="ghost">
                    Abrir
                  </Button>
                </CardHeader>
              </Card>
            </form>
          </li>
        ) : null}
      </ul>
    </div>
  );
}