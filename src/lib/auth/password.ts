/**
 * Hash e verificacao de senha.
 *
 * Por que bcrypt e nao argon2/scrypt: bcryptjs e pure JavaScript, entao
 * funciona em qualquer runtime do Next (Node, Edge) sem binario nativo. Argon2
 * exigiria um pacote com addon nativo, o que complica o build de container e o
 * deploy em plataformas serverless. O custo e configuravel em `BCRYPT_COST`
 * para poder subir conforme o hardware improves.
 *
 * O que NUNCA acontece aqui: logar senha, comparar senha com `===`, ou
 * devolver o motivo da falha ao cliente. "E-mail nao existe" e "senha errada"
 * Produzem a mesma resposta e o mesmo tempo de execucao (ver `verifyPassword`).
 */

import bcrypt from "bcryptjs";

import { env } from "@/lib/env";

/**
 * Comprimento minimo de senha.
 *
 * 8 e o minimo aceito por muito servico serio. A razao de exigir mais e que
 * o ataque real nao e adivinhar senha alheia, e sim reutilizar a senha de um
 * vazamento anterior. Comprimento resiste a isso; regras de composicao
 * ("1 maiuscula, 1 simbolo") so empurram o usuario para `Senha@123`.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/**
 * bcrypt trunca em 72 BYTES, nao em 72 caracteres. Uma senha com acento passa
 * de 72 caracteres e tem os ultimos silenciosamente descartados, o que
 *_enfraquece_ a senha sem avisar. Rejeitar acima do limite e melhor do que
 * aceitar uma senha que o usuario acha que protege mais do que protege.
 */
export function assertPasswordLength(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`A senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_LENGTH) {
    throw new Error(
      `A senha deve ter no maximo ${PASSWORD_MAX_LENGTH} bytes (acentos contam mais que 1).`,
    );
  }
}

/** Gera o hash bcrypt com o custo configurado no ambiente. */
export async function hashPassword(password: string): Promise<string> {
  assertPasswordLength(password);
  return bcrypt.hash(password, env().BCRYPT_COST);
}

/** Custo embutido num hash existente. Usado para rehash transparente. */
function costOf(hash: string): number | undefined {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  if (!match) return undefined;
  return Number(match[1]);
}

/**
 * Verifica a senha e, se o custo cadastrado estiver desatualizado, devolve o
 * hash novo para gravacao.
 *
 * O segundo retorno existe para permitir rehash sem pedir a senha de novo: o
 * usuario ja informou a senha correta nesta requisicao, entao e o momento
 * seguro para gravar o hash com custo mais alto.
 *
 * `needsRehash = true` siginifica "a senha confere, mas grave este hash".
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  let valid = false;
  try {
    valid = await bcrypt.compare(password, hash);
  } catch {
    // Hash corrompido no banco. Nao tratamos como senha valida.
    return { valid: false, needsRehash: false };
  }
  const cost = costOf(hash);
  return { valid, needsRehash: valid && cost !== undefined && cost < env().BCRYPT_COST };
}

/**
 * Compara um valor contra o hash SEM revelar se o valor conferiu.
 *
 * Usado quando o e-mail informado nao existe: para nao responder em 1 ms
 * (e-mail inexistente) contra 100 ms (e-mail existente, bcrypt rodando), o
 * login precisa fazer o mesmo trabalho nos dois casos. Sem isso, o tempo de
 * resposta entrega quais e-mails estao cadastrados.
 *
 * O hash abaixo e um bcrypt valido de um valor aleatorio, gerado com o custo
 * de `BCRYPT_COST`, de modo que o custo de CPU seja o mesmo do caminho real.
 */
let decoyHash: string | undefined;

/** Devolve um hash "isca" estavel, criado uma vez por processo. */
async function decoy(): Promise<string> {
  decoyHash ??= await bcrypt.hash(`decoy-${env().AUTH_SECRET.slice(0, 16)}`, env().BCRYPT_COST);
  return decoyHash;
}

/** Compare um valor contra o hash, ou contra a isca se `hash` for nulo. */
export async function safeCompare(password: string, hash: string | null): Promise<boolean> {
  const target = hash ?? (await decoy());
  try {
    return await bcrypt.compare(password, target);
  } catch {
    return false;
  }
}
