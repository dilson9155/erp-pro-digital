/**
 * Cookie de sessao.
 *
 * REGRA CENTRAL: o cookie e a fronteira entre o navegador e a aplicacao. Tudo
 * que ele carregar e visivel para o usuario final. Por isso ele carrega
 * exatamente UM valor opaco, gerado por `generateSessionToken`, e nada mais:
 * nao `userId`, nao `tenantId`, nao `role`, nao `permissions`.
 *
 * Por que nao um JWT no cookie, ja que o projeto tem `jose`:
 *
 * 1. Um JWT nao pode ser revogado. Aqui, revogar e um UPDATE em `sessions` e
 *    ja esta modelado (`SessionStatus.REVOGADA`). Com JWT, "sair de todos os
 *    dispositivos" e um item de menu sem efeito.
 * 2. Trocar a senha, bloquear a conta ou um super admin ultravo um usuario
 *    precisam Invalidar a sessao na hora. Sem estado no servidor, isso so
 *    acontece na expiracao.
 * 3. O token de sessao tem 256 bits de aleatoriedade; o JWT carrega o payload
 *    assinado, o que e mais curto e mais lento de verificar.
 *
 * O preco e uma consulta ao banco por requisicao autenticada. E o preco certo
 * aqui: `sessions` tem indice em `token_hash` e a leitura e por chave
 * primaria.
 */

import { cookies } from "next/headers";

import { env } from "@/lib/env";

/**
 * Opcoes do cookie, conforme o `SESSION_COOKIE_NAME` do ambiente.
 *
 * `httpOnly` e o que impede o roubo por XSS. Sem ele, um `<script>` injetado
 * le `document.cookie` e manda o token para o atacante. O custo e que nenhum
 * JavaScript do cliente consegue ler o token — por isso nao existe plano de
 * "token nao httpOnly, comRefreshToken separado": nao ha lugar seguro para
 * guarda-lo num SPA.
 *
 * `sameSite: "lax"` segura o CSRF de navegacao cruzada sem quebrar o
 * retorno de provedor externo (OAuth), que faz GET. `strict` quebraria esse
 * fluxo; combinado com `secure`, o nivel e o correto para um app web.
 *
 * `secure` em desenvolvimento local e `false` de proposito: o cookie em
 * `http://localhost` seria descartado pelo navegador, e o login deixaria de
 * funcionar so na maquina de desenvolvimento.
 */
function cookieOptions(maxAgeSeconds: number): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  const config = env();
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Grava o cookie da sessao. Usar apenas em Route Handler ou Server Action. */
export async function writeSessionCookie(token: string, maxAgeSeconds: number): Promise<void> {
  const config = env();
  const store = await cookies();
  store.set(config.SESSION_COOKIE_NAME, token, cookieOptions(maxAgeSeconds));
}

/**
 * Remove o cookie da sessao.
 *
 * O `maxAge: 0` e obrigatorio: sem ele, o cookie continua no navegador com o
 * valor antigo e sera reenviado em cada requisicao seguinte, mesmo depois do
 * logout. Por isso o objeto e montado a mao em vez de reusar
 * `cookieOptions()` — ali `maxAge` viria positivo.
 */
export async function clearSessionCookie(): Promise<void> {
  const config = env();
  const store = await cookies();
  store.set(config.SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Le o token do cookie, ou `null` se ausente. */
export async function readSessionToken(): Promise<string | null> {
  const config = env();
  const store = await cookies();
  return store.get(config.SESSION_COOKIE_NAME)?.value ?? null;
}
