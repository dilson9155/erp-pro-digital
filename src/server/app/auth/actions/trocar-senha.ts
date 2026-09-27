"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prismaCommon } from "@/server/db/client";
import { hashPassword, safeCompare, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { readSessionToken } from "@/server/auth/cookie";
import { authenticateSession, revokeAllSessions } from "@/server/auth/session";
import { log as criarLog } from "@/lib/logger";

const log = criarLog("auth.troca_senha");

const FormTrocaSenha = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual."),
    novaSenha: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `A senha nova precisa de ao menos ${PASSWORD_MIN_LENGTH} caracteres.`),
    confirmacao: z.string().min(1, "Repita a senha nova."),
  })
  .refine((v) => v.novaSenha === v.confirmacao, {
    message: "As senhas nao conferem.",
    path: ["confirmacao"],
  })
  .refine((v) => v.novaSenha !== v.senhaAtual, {
    message: "A senha nova precisa ser diferente da atual.",
    path: ["novaSenha"],
  });

export type EstadoTrocaSenha = {
  readonly tipo: "erro";
  readonly mensagem: string;
  readonly campo?: "senhaAtual" | "novaSenha" | "confirmacao";
} | { readonly tipo: "ok" };

/**
 * Troca de senha.
 *
 * Delega a `User`, e nao a `Session`: a senha pertence a pessoa, nao a sessao.
 * Por isso o `id` vem do cookie autenticado e nunca do formulario — um
 * formulario com `userId` permitiria trocar a senha de outra pessoa contando so
 * com a propria sessao.
 *
 * Tres consequencias da troca, na ordem:
 *
 *  1. `mustChangePassword` desligado, senao o layout manda a pessoa para esta
 *     tela para sempre (o `switch` de `decidirAcesso` trata `troca_de_senha`
 *     acima de escolha de empresa).
 *  2. Todas as outras sessoes revogadas. A senha antiga pode estar em outra
 *     aba, em outro aparelho; manter sessao viva depois de trocar a senha e o
 *     que faz "sai de todos os dispositivos" nao valer nada.
 *  3. Revoga a sessao atual tambem, e manda para o login de novo: a pessoa
 *     precisa entrar com a senha nova, o que confirma que ela a decorou.
 */
export async function trocarSenha(_estado: EstadoTrocaSenha | null, formData: FormData): Promise<EstadoTrocaSenha> {
  const token = await readSessionToken();
  const autenticado = token ? await authenticateSession(token) : null;
  if (!autenticado) redirect("/login");

  const { user } = autenticado;

  const bruto = Object.fromEntries(formData);
  const parsed = FormTrocaSenha.safeParse(bruto);
  if (!parsed.success) {
    return { tipo: "erro", mensagem: parsed.error.issues[0]?.message ?? "Dados invalidos." };
  }

  // O hash NAO vem da sessao: `AuthenticatedUser` deliberadamente nao carrega
  // `passwordHash` (o `policy.ts` documenta essa escolha — um objeto de decisao
  // que enxerga credencial esta a um `console.log` de distancia). E lido aqui,
  // por `userId`, que veio do cookie e nao do formulario.
  const credencial = await prismaCommon.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  // `safeCompare` e nao `verifyPassword` porque aceita `hash = null`: uma conta
  // sem hash e um estado possivel do schema (`passwordHash` e nulavel), e
  // `verifyPassword` exigiria um `!` que mentiria — transformando "conta sem
  // hash" em excecao 500, quando o certo e recusar a troca.
  const atualConfere = await safeCompare(parsed.data.senhaAtual, credencial?.passwordHash ?? null);
  if (!atualConfere) {
    // Rate limit aqui importaria menos que no login: sem `senhaAtual` correta a
    // pessoa nao troca nada, e as duas comparacoes sao bcrypt — o custo por
    // tentativa ja e o do login.
    log.warn({ userId: user.id }, "troca_senha_atual_incorreta");
    return { tipo: "erro", mensagem: "A senha atual nao confere.", campo: "senhaAtual" };
  }

  // `passwordChangedAt` nao existe no schema: `User` tem `updatedAt`, que o
  // `@updatedAt` atualiza sozinho. Tentar gravar um campo de "quando trocou a
  // senha" seria criar coluna nova na FASE 1 sem migracao — e o registro disso
  // ja existe: `Session.revokedReason = "senha_alterada"`.
  await prismaCommon.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.novaSenha),
      mustChangePassword: false,
    },
  });

  // Todas, inclusive a atual. Preservar a sessao em uso e tentador (a pessoa
  // cairia direto no app), mas o token atual ja foi emitido com a senha
  // antiga — e o objetivo e que ele deixe de valer. Uma unica chamada sem
  // excecao: a primeira versionava com `exceptSessionId` e revogava em seguida
  // sem excecao nenhuma, gastando dois UPDATE para o mesmo efeito.
  const revogadas = await revokeAllSessions(user.id, "senha_alterada");

  log.info({ userId: user.id, outrasSessoes: revogadas }, "senha_alterada");
  redirect("/login?senha=alterada");
}
