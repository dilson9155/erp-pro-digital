"use server";

/**
 * Server Actions de autenticação.
 *
 * Cada export É uma função async — exigência do Next.js para "use server".
 * O app importa estas ações para usar em `<form action={...}>` ou chamar direto.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { readSessionToken } from "@/server/auth/cookie";
import { authenticateSession, definirContextoSessao, revokeSession } from "@/server/auth/session";
import { log as criarLog } from "@/lib/logger";

const log = criarLog("auth.actions");

/** Lê a sessão autenticada ou devolve `null`. */
async function sessaoAtual() {
  const token = await readSessionToken();
  if (!token) return null;
  return authenticateSession(token);
}

/** Escolhe a empresa e redireciona para escolha de filial. */
export async function escolherEmpresa(formData: FormData): Promise<void> {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");

  const membershipId = String(formData.get("membershipId") ?? "");
  if (!membershipId) redirect("/login");

  const resultado = await definirContextoSessao({
    sessionId: sessao.session.id,
    userId: sessao.user.id,
    membershipId,
  });

  if (!resultado.ok) {
    log.warn({ motivo: resultado.motivo }, "escolha_empresa_negada");
    redirect("/login");
  }

  redirect("/escolher-filial");
}

/** Escolhe a filial. `null` = "todas as filiais". */
export async function escolherFilial(formData: FormData): Promise<void> {
  const sessao = await sessaoAtual();
  if (!sessao || sessao.session.tenantId === null) redirect("/login");

  const bruto = String(formData.get("branchId") ?? "");
  const branchId = bruto === "" || bruto === "todas" ? null : bruto;

  const resultado = await definirContextoSessao({
    sessionId: sessao.session.id,
    userId: sessao.user.id,
    membershipId: sessao.session.membershipId ?? "",
    branchId,
  });

  if (!resultado.ok) {
    log.warn({ motivo: resultado.motivo }, "escolha_filial_negada");
    redirect("/escolher-filial");
  }

  redirect("/dashboard");
}

/** Encerra a sessão (logout). */
export async function encerrarSessao(): Promise<void> {
  const token = await readSessionToken();
  if (token) {
    const sessao = await authenticateSession(token);
    if (sessao) await revokeSession(sessao.session.id, "logout");
  }
  const { clearSessionCookie } = await import("@/server/auth/cookie");
  await clearSessionCookie();
  log.info({}, "logout");
  redirect("/login");
}

/** User-Agent, para log. */
export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}