import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { readSessionToken, authenticateSession } from "@/server/app/auth/queries";
import { escolherEmpresa } from "@/server/app/auth";
import { buscarMembershipAtivas } from "@/server/app/auth/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Escolher empresa" };

/**
 * Escolha de empresa.
 *
 * A tela NÃO aceita `?empresa=` na URL. A empresa entra pelo `membershipId` do
 * formulário e é revalidada no servidor (`definirContextoSessao`); se a URL
 * escolhesse, trocar o parâmetro na barra de endereço seria trocar de contexto
 * de segurança. A URL carrega apenas o destino de retorno, e ainda assim
 * validado contra a lista que o servidor montou.
 *
 * Empresa com um único vínculo não mostra esta tela: a action de login já
 * manda direto para cá e o layout abaixo não tem o que escolher. Mantemos a
 * lista mesmo assim, porque o número de vínculos muda com o tempo — o usuário
 * pode ter uma empresa hoje e três amanhã, e o caminho precisa servir os dois.
 */
export default async function PageEscolherEmpresa() {
  const token = await readSessionToken();
  const autenticado = token ? await authenticateSession(token) : null;
  if (!autenticado) redirect("/login");

  // Sessão já com empresa: vai para o app. Sem este desvio, refresh em
  // `/escolher-empresa` deixaria a pessoa presa aqui mesmo com tudo pronto.
  if (autenticado.session.tenantId !== null) {
    redirect(autenticado.session.branchId === null ? "/escolher-filial" : "/dashboard");
  }

  const vinculos = await buscarMembershipAtivas(autenticado.user.id);

  return (
    <div className="w-full max-w-lg space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Com qual empresa voce quer trabalhar?</h1>
        <p className="text-sm text-muted-foreground">
          Voce tem {vinculos.length === 1 ? "1 empresa disponivel" : `${vinculos.length} empresas disponiveis`}.
        </p>
      </div>

      {vinculos.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma empresa disponivel</CardTitle>
            <CardDescription>
              Seu usuario esta ativo, mas nao possui vinculo com nenhuma empresa. Fale com o administrador.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {vinculos.map((v) => (
            <li key={v.membershipId}>
              <form action={escolherEmpresa}>
                <input type="hidden" name="membershipId" value={v.membershipId} />
                <Card
                  className="transition-colors hover:border-primary/50"
                  // A cor da empresa entra como variável CSS no elemento, e não
                  // como classe: a cor vem do banco e não pode virar utility
                  // class gerada em build.
                  style={v.primaryColor ? ({ "--primary": v.primaryColor } as React.CSSProperties) : undefined}
                >
                  <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
                    <div>
                      <CardTitle className="text-base">{v.tenantName}</CardTitle>
                      <CardDescription className="mt-1">
                        {v.isOwner ? "Proprietario" : "Usuario"}
                        {v.branchIds === null ? " — todas as filiais" : ` — ${v.branchIds.length} filial(is)`}
                      </CardDescription>
                    </div>
                    <Button type="submit" variant="outline">
                      Entrar
                    </Button>
                  </CardHeader>
                </Card>
              </form>
            </li>
          ))}
        </ul>
      )}

      <CardContent className="text-center text-xs text-muted-foreground">
        Nao ve a sua empresa? Verifique se o convite foi concluido.
      </CardContent>
    </div>
  );
}