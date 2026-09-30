/**
 * Contexto de operacao: o que toda pagina de negocio precisa, em uma chamada.
 *
 * POR QUE ISTO EXISTE, E NAO APENAS "ECONOMIA DE LINHAS"
 *
 * Antes deste modulo, cada pagina repetia o mesmo bloco de quinze linhas:
 * ler o cookie, autenticar, redirecionar se nao houvesse empresa, redirecionar se
 * nao houvesse filial, carregar a membership, montar o `TenantScope`. O bloco
 * funciona — o dashboard e a tela de configuracoes o faziam certo.
 *
 * O problema nao e o bloco estar repetido. E o que a repeticao permite ERRAR: o
 * campo `allowedBranchIds` sai de `membership.branchAccess`, e uma pagina que
 * escreve `?? null` no lugar errado, ou que esquece a linha, produz uma query de
 * estoque que enxerga TODAS as filiais em vez das liberadas para aquele usuario.
 * Nenhum teste quebra: o dado sai certo para o administrador, que e justamente a
 * pessoa que testa. O bug so aparece para o vendedor restrito, e aparece como
 * "ele ve venda de outra loja".
 *
 * Concentration e a unica defesa que nao depende de revisao. O `TenantScope` e
 * montado em UM lugar, e todo mundo usa o mesmo.
 *
 * POR QUE A CHECAGEM E REPETIDA AQUI, JA QUE O LAYOUT FAZ
 *
 * `src/app/(app)/layout.tsx` ja exige sessao, e uma pagina nova dentro do grupo
 * ja nasce protegida. Esta funcao repete a exigencia de proposito: o layout e a
 * garantia de navegacao (acesso pela URL), e aqui e a garantia de DADOS (a query
 * so roda com escopo construido). O custo e uma consulta reaproveitada do
 * `cache` do React; o beneficio e que uma pagina chamada de fora do grupo — um
 * teste, um script, um `not-found` reaproveitado — nao opera sem escopo.
 *
 * POR QUE ISTO NAO E `requirePermission`
 *
 * Aquele (`src/server/auth/rbac.ts`) e o portao das ESCRITAS e lanca 403. Este
 * e o portao das TELAS: quando falta permissao, a resposta e uma pagina de
 * "sem acesso", nao uma excecao. Escrever e ler tem contratos diferentes e
 * continuao tendo.
 */

import { redirect } from "next/navigation";

import {
  authenticateSession,
  buscarMembershipAtivaPorId,
  readSessionToken,
} from "@/server/app/auth/queries";
import { buscarFilialPorId } from "@/server/app/db";
import { can, type ContextoRbac } from "@/server/auth/rbac";
import type { PedidoPermissao } from "@/lib/rbac/permissions";
import type { TenantScope } from "@/server/db/tenant-scope";

/** Tudo que uma tela de negocio precisa saber sobre quem esta operando. */
export interface ContextoOperacao {
  readonly userId: string;
  readonly userName: string;
  readonly userEmail: string;
  readonly isPlatformAdmin: boolean;
  readonly isOwner: boolean;
  readonly sessionId: string;
  readonly membershipId: string;
  readonly tenantId: string;
  readonly tenantName: string;
  /** Filial ativa. Sempre preenchida dentro de `(app)`. */
  readonly branchId: string;
  readonly branchName: string;
  /** Escopo pronto para `withTenantDb`. */
  readonly scope: TenantScope;
  /** Contexto pronto para `can` / `requirePermission`. */
  readonly rbac: ContextoRbac;
}

/**
 * Exige sessao com empresa e filial, e devolve o contexto pronto.
 *
 * Redireciona em vez de lancar: quem chama e uma pagina, e o destino correto
 * para "voce nao esta logado" e o login, nao uma tela de erro.
 */
export async function obterContextoOperacao(): Promise<ContextoOperacao> {
  const token = await readSessionToken();
  const autenticado = token ? await authenticateSession(token) : null;
  if (!autenticado) redirect("/login");

  const { user, session } = autenticado;
  if (session.tenantId === null) redirect("/escolher-empresa");
  if (session.branchId === null) redirect("/escolher-filial");
  if (session.membershipId === null) redirect("/acesso-bloqueado");

  const membership = await buscarMembershipAtivaPorId(session.membershipId);
  if (!membership) redirect("/acesso-bloqueado");

  const scope = montarScope(
    session.tenantId,
    session.branchId,
    membership.branchAccess,
    user.id,
    session.id,
    user.isPlatformAdmin,
  );

  const filial = await buscarFilialPorId(scope, session.branchId);

  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    isPlatformAdmin: user.isPlatformAdmin,
    isOwner: membership.isOwner,
    sessionId: session.id,
    membershipId: membership.id,
    tenantId: session.tenantId,
    tenantName: membership.tenant.name,
    branchId: session.branchId,
    branchName: filial?.name ?? "",
    scope,
    rbac: {
      membershipId: membership.id,
      userId: user.id,
      sessionId: session.id,
      tenantId: session.tenantId,
    },
  };
}

/**
 * Monta o `TenantScope` a partir da sessao.
 *
 * `allowedBranchIds` vem do `UserBranchAccess` e e `null` quando o usuario nao
 * tem nenhuma linha — que significa "sem restricao", nao "sem filial". A
 * distincao esta no schema: `UserBranchAccess` so existe quando existe
 * restricao, entao lista vazia e "liberado para todas".
 */
function montarScope(
  tenantId: string,
  branchId: string,
  branchAccess: readonly { readonly branchId: string }[],
  userId: string,
  sessionId: string,
  isPlatformAdmin: boolean,
): TenantScope {
  return {
    tenantId,
    branchId,
    allowedBranchIds: branchAccess.length > 0 ? branchAccess.map((b) => b.branchId) : null,
    userId,
    sessionId,
    isPlatformAdmin,
  };
}

/**
 * A tela pode mostrar esta operacao?
 *
 * Atalho sobre `can` para o uso da UI. Nao substitui o `requirePermission` da
 * Server Action: esconder o botao e conveniencia, e quem barra a escrita e o
 * portao do servidor.
 */
export async function podeOperar(
  rbac: ContextoRbac,
  pedido: PedidoPermissao,
): Promise<boolean> {
  return can(rbac, pedido);
}
