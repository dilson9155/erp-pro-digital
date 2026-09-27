import { redirect } from "next/navigation";
import { readSessionToken, authenticateSession, decidirAcesso, buscarMembershipAtivaPorId } from "@/server/app/auth/queries";

/**
 * Raiz do site: decide para onde a pessoa vai, e não mostra nada.
 *
 * A decisão está no SERVIDOR e usa o cookie, e não um `useEffect` no cliente. A
 * diferença não é de estilo: se a raiz renderizasse "carregando" e decidisse
 * depois, `/` responderia 200 para anônimo, o proxy não veria decisão nenhuma, e
 * a URL canônica do produto viraria a página de entrada para quem indexa. Fazer
 * o desvio no primeiro request mantém uma URL por estado.
 *
 * Cada estado tem sua própria rota de destino, e não uma query param: assim cada
 * tela pode ser renderizada direto, protegida pelo proxy, e ter seu próprio
 * `metadata`.
 */
export default async function Page() {
  const token = await readSessionToken();
  const autenticado = token ? await authenticateSession(token) : null;

  if (!autenticado) redirect("/login");

  const { user, session } = autenticado;

  if (session.tenantId === null) redirect("/escolher-empresa");

  const membership = await buscarMembershipAtivaPorId(session.membershipId);

  const decisao = decidirAcesso(
    {
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      membershipAtiva: membership !== null,
      isPlatformAdmin: user.isPlatformAdmin,
    },
    { tenantId: session.tenantId, branchId: session.branchId },
  );

  switch (decisao.tipo) {
    case "troca_de_senha":
      redirect("/trocar-senha");
    case "negado":
      redirect("/acesso-bloqueado");
    case "escolha_de_empresa":
      redirect("/escolher-empresa");
    case "acesso":
      redirect(session.branchId === null ? "/escolher-filial" : "/dashboard");
  }
}