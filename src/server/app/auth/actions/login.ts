/**
 * Ações do login.
 *
 * ORDEM DAS ETAPAS, E POR QUE É ESTA
 *
 * A sequência parece óbvia ("confere a senha, cria a sessão") e mesmo assim é
 * onde a maioria dos formulários de login vaza informação ou perde proteção. A
 * ordem aqui é deliberada:
 *
 *  1. rate limit por IP     — antes de qualquer consulta, para nem o `SELECT` do
 *                              e-mail virar oráculo de volume.
 *  2. rate limit por conta  — independente do IP: segura o ataque contra UMA
 *                              conta vinda de milhares de origens.
 *  3. busca do usuário      — `email` é `@unique`.
 *  4. comparação da senha  — SEMPRE, mesmo sem usuário (ver `safeCompare`).
 *  5. bloqueio da conta     — só conta falha de credencial, nunca de rate limit.
 *  6. status da conta       — allowlist: só `ATIVO` entra.
 *  7. TOTP                  — depois da senha, porque é o segundo fator.
 *  8. criação da sessão     — por último, porque só então há o que gravar.
 *
 * Os itens 4 e 6 são o mesmo assunto: enquanto a resposta diferir entre "e-mail
 * não existe" e "senha errada", um script mede a diferença e descobre quais
 * e-mails têm conta. Por isso a comparação usa `safeCompare` (que gasta o mesmo
 * `bcrypt` nos dois casos) e as mensagens são idênticas.
 */

"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prismaCommon } from "@/server/db/client";
import { safeCompare, verifyPassword, hashPassword } from "@/lib/auth/password";
import { limitarLoginPorConta, limitarLoginPorIp } from "@/server/rate-limit";
import { avaliarBloqueio, registrarFalha, registrarSucesso, aplicarRehash } from "@/server/auth/lockout";
import { createSession } from "@/server/auth/session";
import { writeSessionCookie } from "@/server/auth/cookie";
import { verificarTotp } from "@/server/auth/totp-service";
import { log as criarLog } from "@/lib/logger";

/**
 * Log com o módulo nomeado.
 *
 * `log` no logger.ts é uma FÁBRICA (`log(modulo)`), não um logger pronto. Sem
 * isto, cada chamada precisaria do nome e o módulo viraria strings soltas pelo
 * código — que é exatamente o que impede de agregar logs por área depois.
 */
const log = criarLog("auth.login");

const schema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Informe o e-mail.").email("E-mail invalido."),
  password: z.string().min(1, "Informe a senha."),
  totpCode: z.string().trim().min(6, "Informe o codigo de 6 digitos.").max(10).optional(),
  rememberMe: z.boolean().optional(),
});

/** Resposta da action, no formato que o formulário consome. */
export type EstadoLogin =
  | { readonly tipo: "ok"; readonly destino: string }
  | {
      readonly tipo: "erro";
      readonly mensagem: string;
      readonly campo?: "email" | "password" | "totpCode";
    }
  /**
   * Autenticou a senha, mas falta o segundo fator.
   *
   * É um estado de SUCESSO parcial, e separá-lo de `erro` é o que impede a tela
   * de tratar "código errado" do mesmo jeito que "senha errada": o primeiro leva
   * ao campo de TOTP, o segundo a um erro de credencial.
   */
  | { readonly tipo: "mfa_necessario" };

/**
 * IP do request.
 *
 * `x-forwarded-for` é uma CADEIA, e a primeira entrada é o cliente real. Pegar a
 * última daria o IP do proxy mais próximo — que, atrás de CDN ou balanceador, é
 * o mesmo endereço para todas as pessoas, tornando o limite por IP inútil.
 */
async function ipDoRequest(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

/**
 * Executa o login.
 *
 * `dados` chega como `FormData` porque o formulário é `<form action={...}>` e
 * não depende de JavaScript para ser enviado.
 */
export async function login(
  _estadoAnterior: EstadoLogin | null,
  dados: FormData,
): Promise<EstadoLogin> {
  const bruto = dados.get("rememberMe");
  const parsed = schema.safeParse({
    email: dados.get("email"),
    password: dados.get("password"),
    totpCode: dados.get("totpCode") ? String(dados.get("totpCode")) : undefined,
    rememberMe: bruto === "on" || bruto === "true" || bruto === "1",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const caminho = issue?.path[0];
    const campo =
      caminho === "email" || caminho === "password" || caminho === "totpCode" ? caminho : undefined;
    return { tipo: "erro", mensagem: issue?.message ?? "Dados invalidos.", ...(campo ? { campo } : {}) };
  }

  const { email, password, totpCode, rememberMe } = parsed.data;
  const ip = await ipDoRequest();

  // 1. Rate limit por IP, antes de tocar no banco.
  const porIp = await limitarLoginPorIp(ip);
  if (!porIp.permitido) return { tipo: "erro", mensagem: porIp.mensagem };

  // 2. Rate limit por conta. Os dois limites usam a mesma janela configurada,
  //    mas chaves distintas, e por isso contam separado.
  const porConta = await limitarLoginPorConta(email);
  if (!porConta.permitido) return { tipo: "erro", mensagem: porConta.mensagem };

  // 3. Busca o usuário.
  //
  //    `failedLoginCount` e `lockedUntil` vêm no mesmo SELECT de propósito: o
  //    `avaliarBloqueio` é puro e precisa dos dois campos. Buscar em separado
  //    abriria uma janela em que o bloqueio é reavaliado com um número velho —
  //    o que, em requisições simultâneas, é justamente a janela do ataque.
  const user = await prismaCommon.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      status: true,
      mustChangePassword: true,
      totpEnabledAt: true,
      failedLoginCount: true,
      lockedUntil: true,
    },
  });

  // 4. Compara a senha em UM `bcrypt`, e não dois.
  //
  // A primeira versão rodava `safeCompare` e depois `verifyPassword` no mesmo
  // login: ~300 ms × 2 em toda tentativa, para ganhar do segundo compare só o
  // `needsRehash`. A segunda versão trocou por `hashPassword` + comparação de
  // string, que é pior — o salt é aleatório, então os dois hashes nunca são
  // iguais e a linha era reescrita em TODO login, que é exatamente o que o
  // rehash transparente existe para evitar.
  //
  // O formato certo: conta real usa `verifyPassword`, que compara e diz se o
  // custo do hash está velho, num compare só. Conta inexistente ou sem hash usa
  // `safeCompare` contra a isca, mesmo custo, e devolve `false`. Um compare em
  // cada caminho — nunca zero, nunca dois.
  const hash = user?.passwordHash ?? null;
  let senhaOk = false;
  let precisaRehash = false;

  if (hash === null) {
    // Conta inexistente ou sem hash: um compare contra a isca, mesmo custo, e
    // o resultado é descartado. É este compare que mantém a resposta com tempo
    // constante quando o e-mail não existe.
    await safeCompare(password, null);
    senhaOk = false;
  } else {
    // Conta real: um compare que também diz se o custo do hash está velho.
    // `hash` é `string` aqui por narrowing, sem `!` — a assinatura de
    // `verifyPassword` exige string e o compilador prova que é o caso.
    const v = await verifyPassword(password, hash);
    senhaOk = v.valid;
    precisaRehash = v.needsRehash;
  }

  if (!senhaOk) {
    // Só conta falha de uma conta REAL: registrar para e-mail inexistente criaria
    // linhas de bloqueio para quantos endereços o atacante quiser inventar.
    if (user && user.passwordHash !== null) await registrarFalha(user.id);
    log.info({ userId: user?.id ?? null }, "login_falhou");
    return { tipo: "erro", mensagem: "E-mail ou senha incorretos." };
  }

  // Vínculo para o resto da função.
  //
  // `senhaOk` só é `true` quando `hash !== null`, e `hash` veio de
  // `user?.passwordHash ?? null` — ou seja, `senhaOk === true` implica
  // `user !== null`. O compilador não rastreia essa implicação através de uma
  // variável booleana, então ela é escrita aqui.
  //
  // Não é um `!`: é uma guarda que, se algum dia a lógica do passo 4 mudar, vira
  // "senha errada" em vez de um `TypeError` no meio do login. O bloco é
  // inalcançável hoje, e por isso a mensagem é a de senha errada — a mesma que
  // qualquer outra falha de credencial devolve.
  if (!user) {
    return { tipo: "erro", mensagem: "E-mail ou senha incorretos." };
  }

  // 5. A conta está bloqueada? Vem DEPOIS da senha, para não revelar o estado da
  //    conta a quem não a tem. O `bcrypt` acima já gastou tempo de hash real em
  //    ambos os caminhos, então não sobra oráculo de tempo.
  const bloqueio = avaliarBloqueio(user);
  if (!bloqueio.podeTentar) {
    const minutos = Math.max(1, Math.ceil(bloqueio.restanteSegundos / 60));
    return {
      tipo: "erro",
      mensagem: `Conta temporariamente bloqueada por excesso de tentativas. Tente de novo em ${minutos} min.`,
    };
  }

  // 6. Zera as falhas. Só depois de confirmar a senha: caso contrário, um
  //    atacante que acerte a senha por sorte já limparia o próprio histórico.
  await registrarSucesso(user.id, ip);

  // 7. Status da conta. Allowlist: só `ATIVO` entra — o mesmo argumento de
  //    `policy.ts` e de `authenticateSession`. A mensagem é a de senha errada
  //    porque dizer "conta bloqueada" confirmaria que o e-mail existe.
  if (user.status !== "ATIVO") {
    log.warn({ userId: user.id, status: user.status }, "login_recusado_por_status");
    return { tipo: "erro", mensagem: "E-mail ou senha incorretos." };
  }

  // 8. Rehash transparente. Só aqui: é o único momento em que a senha em claro
  //    está disponível, e `needsRehash` é o que evita reescrever a tabela a cada
  //    login. Sai de graça do `verifyPassword` do passo 4.
  if (precisaRehash) {
    await aplicarRehash(user.id, await hashPassword(password));
  }

  // 9. TOTP, só quando há segundo fator ativo. Quem nunca ativou não é impedido
  //    de entrar.
  if (user.totpEnabledAt !== null) {
    if (!totpCode) return { tipo: "mfa_necessario" };
    const valido = await verificarTotp(user.id, totpCode);
    if (!valido) {
      return { tipo: "erro", mensagem: "Codigo de verificacao invalido.", campo: "totpCode" };
    }
  }

  // 10. Cria a sessão. Ela nasce SEM `tenantId`: a empresa é escolhida na tela
  //     seguinte e nunca por parâmetro de URL, porque `?empresa=` seria um
  //     parâmetro de segurança que qualquer um pode trocar na barra de endereço.
  const { token, maxAgeSeconds } = await createSession({
    userId: user.id,
    tenantId: null,
    branchId: null,
    rememberMe: rememberMe ?? false,
    ip,
    userAgent: (await headers()).get("user-agent"),
  });

  await writeSessionCookie(token, maxAgeSeconds);
  log.info({ userId: user.id }, "login_ok");

  return {
    tipo: "ok",
    destino: user.mustChangePassword ? "/trocar-senha" : "/escolher-empresa",
  };
}
