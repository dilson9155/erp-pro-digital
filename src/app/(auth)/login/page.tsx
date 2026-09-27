import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readSessionToken, authenticateSession } from "@/server/app/auth/queries";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

/**
 * Tela de login.
 *
 * O `redirect` para quem JÁ tem sessão mora AQUI, e não no layout `(auth)`, por
 * um motivo que só aparece quando as telas do grupo se multiplicam: um redirect
 * de layout vale para o grupo inteiro, e o grupo tem telas cujo público é
 * justamente quem tem sessão (`/trocar-senha`, `/acesso-bloqueado`). Mandar
 * quem tem sessão embora do layout quebra essas duas em laço com o layout do app.
 *
 * A ordem das três saídas é a de `policy.ts` — troca de senha ANTES de escolha
 * de empresa — e a mesma razão vale aqui: quem teve a senha redefinida não
 * escolhe empresa antes de trocar a senha.
 *
 * `?senha=alterada` é a única query string que o layout respeita, e ela não
 * desvia ninguém: é o aviso de que a troca de senha funcionou, numa tela que
 * acabou de revogar a sessão.
 */
export default async function PageLogin({
  searchParams,
}: {
  searchParams: Promise<{ senha?: string }>;
}) {
  const { senha } = await searchParams;

  const token = await readSessionToken();
  const autenticado = token ? await authenticateSession(token) : null;
  if (autenticado) {
    const { user, session } = autenticado;
    if (user.mustChangePassword) redirect("/trocar-senha");
    if (session.tenantId === null) redirect("/escolher-empresa");
    if (session.branchId === null) redirect("/escolher-filial");
    redirect("/dashboard");
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      {senha === "alterada" ? (
        <div
          role="status"
          className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
        >
          Senha alterada. Entre com a senha nova.
        </div>
      ) : null}

      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-sm text-muted-foreground">Use o e-mail cadastrado pela sua empresa.</p>
      </div>

      <FormularioLogin />
    </div>
  );
}