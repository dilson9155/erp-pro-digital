/**
 * Token de sessao: geracao e verificacao.
 *
 * O token NUNCA e persistido em claro. O que vai para o banco e o SHA-256
 * dele, e o que vai para o cookie e o valor em claro. Isso significa que um
 * dump da tabela `sessions` nao permite forjar sessao de ninguem: para isso o
 * atacante precisaria do valor em claro, que so existe no navegador de quem
 * autenticou.
 *
 * Por que SHA-256 e nao bcrypt aqui: o token tem 256 bits de entropia gerados
 * por `randomBytes`, entao nao existe dicionario para attacking offline. bcrypt
 * aqui so custaria CPU a cada requisicao autenticada (o `lookup` acontece em
 * toda request) sem fechar nenhum ataque que o SHA nao feche.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 bytes = 256 bits de entropia. */
const TOKEN_BYTES = 32;

/**
 * Gera um token de sessao opaco.
 *
 * O prefixo `v1_` versiona o formato: se um dia for necessario migrar para
 * outro gerador, os tokens antigos seguem verificaveis e o invalidate por
 * versao, em vez de exigir que todos os usuarios entrem de novo sem aviso.
 */
export function generateSessionToken(): string {
  return `v1_${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

/** SHA-256 em base64url. E o que a coluna `sessions.token_hash` armazena. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

/**
 * Compara dois hashes de token em tempo constante.
 *
 * `===` em string encerra a comparacao no primeiro byte diferente, o que
 * permitiria descobrir o hash correto caractere a caractere. `timingSafeEqual`
 * compara sempre todos os bytes.
 *
 * O guard de tamanho e obrigatorio: `timingSafeEqual` LANCA excecao se os
 * buffers tiverem tamanhos diferentes, e o tamanho do hash derivado do token
 * do cookie pode nao ter o mesmo tamanho do hash do banco.
 */
export function safeTokenEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
