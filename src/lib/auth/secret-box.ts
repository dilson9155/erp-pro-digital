/**
 * Caixa criptografica para segredos em repouso (AES-256-GCM).
 *
 * Para que serve: o segredo TOTP nao pode ficar em texto puro no banco. Quem
 * ler a tabela `users` — um dump, um backup, um `SELECT` de um suporte — tem
 * que encontrar bytes cifrados, senao o segundo fator vira decoracao: basta
 * copiar a conta para um autenticador e o acesso e ganho.
 *
 * Por que GCM e nao "encriptacao comum": GCM e autenticado, entao os dados
 * carregam tambem a prova de que nao foram trocados. Sem isso, quem escreve no
 * banco poderia trocar o segredo cifrado de uma conta pelo de outra, ou mexer
 * nos bytes, e o app decifraria o resultado sem reclamar. `createDecipheriv` de
 * um modo sem autenticacao (como CBC) aceita isso em silencio.
 *
 * A chave NAO e `AUTH_SECRET` em crudo. Ela e derivada por HKDF-SHA256 com um
 * `info` proprio deste uso. A razao e o domain separation: a mesma senha de
 * ambiente nunca e usada como chave em dois contextos, de modo que um mesmo
 * material nunca produz a mesma chave em lugares diferentes. Usar `AUTH_SECRET`
 * direto, alem de dar a chave a qualquer outra rotina, tornaria o sistema
 * refatoravel so em um ponto de dor.
 */

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/** Bytes de sal por cifra. 16 e o tamanho recomendado pela NIST para GCM. */
const SALT_BYTES = 16;
/** 12 bytes = 96 bits, o tamanho de nonce na NIST SP 800-38D para GCM. */
const NONCE_BYTES = 12;
/** Etiqueta que separa esta derivacao de qualquer outra uso de AUTH_SECRET. */
const HKDF_INFO = "erp-pro:totp-secret:v1";
/** Comprimento da chave derivada, em bytes. */
const KEY_BYTES = 32;

/** Deriva a chave de uso unico a partir do segredo do ambiente. */
function deriveKey(salt: Buffer): Buffer {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(env().AUTH_SECRET, "utf8"), salt, HKDF_INFO, KEY_BYTES),
  );
}

/**
 * Cifra um segredo.
 *
 * O formato gravado e `v1.<sal hex>.<nonce hex>.<ciphertext hex>`: quatro
 * partes, e o prefixo `v1` primeiro para que a leitura decida o formato antes
 * de tentar interpretar o resto. Trocar de AES-GCM por outra coisa no futuro
 * nao pode deixar os segredos antigos ilegiveis.
 */
export function encryptSecret(texto: string): string {
  const sal = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(sal), nonce);
  const ciphertext = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  // A tag de autenticacao vai anexada, nao fora do ciphertext: e ela que
  // permite detectar adulteracao, e perde-la tornaria a decifragem um oraculo
  // que devolve lixo em vez de um erro claro.
  const tag = cipher.getAuthTag();
  return ["v1", sal.toString("hex"), nonce.toString("hex"), ciphertext.toString("hex"), tag.toString("hex")].join(".");
}

/**
 * Decifra um segredo.
 *
 * Lanca em dado adulterado, truncado ou de outra versao. Isso e o comportamento
 * certo: quem chamou precisa saber que o dado esta ruim, em vez de receber uma
 * string vazia e descobrir depois que o TOTP falhou por um motivo que nao
 * aparece em lugar nenhum.
 */
export function decryptSecret(empacotado: string): string {
  const partes = empacotado.split(".");
  if (partes.length !== 5) throw new Error("segredo cifrado com formato invalido");

  const [versao, salHex, nonceHex, ciphertextHex, tagHex] = partes as [string, string, string, string, string];
  if (versao !== "v1") throw new Error(`versao de cifra desconhecida: ${versao}`);

  const sal = Buffer.from(salHex, "hex");
  const nonce = Buffer.from(nonceHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  if (sal.length !== SALT_BYTES || nonce.length !== NONCE_BYTES) {
    throw new Error("segredo cifrado com sal ou nonce de tamanho invalido");
  }

  const decipher = createDecipheriv("aes-256-gcm", deriveKey(sal), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/** Numero de codigos de recuperacao gerados por vez. */
export const TOTAL_CODIGOS_RECUPERACAO = 8;
/**
 * Alfabeto dos codigos de recuperacao.
 *
 * Nao e um detalhe. Um codigo de recuperacao e lido de um papel e digitado uma
 * unica vez, por uma pessoa com pressa. Um caractere trocado por outro
 * visualmente proximo nao gera mensagem de erro nenhuma: os dois sao validos
 * no alfabeto, o hash simply nao bate, e o usuario gasta um dos poucos backups
 * que tem sem entender o motivo. E o pior tipo de falha, porque consome o
 * recurso de recuperacao sem avisar que era o recurso.
 *
 * Por isso o alfabeto exclui exatamente os nove caracteres que formam pares
 * visualmente indistinguiveis, e nao so os tres classicos:
 *
 *     0/O    1/I/L    5/S    8/B
 *
 * Sao 27 caracteres restantes. `Z`/`2` e `G`/`6` ficam fora da lista de
 * exclusoes: a confusao entre eles e bem menos comum, e remove-los custaria
 * parte da distribuicao sem impedir um erro real. E um Compromisso, e esta
 * escrito aqui para ninguem "corrigi-lo" achando que e erro de digitacao.
 */
const ALFABETO_RECUPERACAO = "ACDEFGHJKMNPQRTUVWXYZ234679";

/** Conjunto dos caracteres excluidos, para o teste conferir a intencao. */
export const CARACTERES_AMBIGUOS = ["0", "1", "5", "8", "B", "I", "L", "O", "S"] as const;

/**
 * Gera os codigos de recuperacao.
 *
 * Sao entregues UMA vez, em texto claro, e so o SHA-256 de cada um vai para o
 * banco. SHA-256 e suficiente aqui, ao contrario de bcrypt na senha: estes
 * valores tem ~50 bits de entropia cada, gerados por `randomBytes`, entao nao
 * ha dicionario para um ataque offline. bcrypt custaria ~100 ms por
 * verificacao, e esta verificacao acontece justamente no caminho de quem
 * perdeu o acesso.
 */
export function generateRecoveryCodes(quantidade = TOTAL_CODIGOS_RECUPERACAO): string[] {
  const ALFA = ALFABETO_RECUPERACAO.length;
  // 31 caracteres nao dividem 256, entao `byte % 31` favorece os 8 primeiros
  // valores do alfabeto: eles sairiam ~1,6% mais vezes que os outros. Num
  // codigo de 10 caracteres isso encurta a entropia efetiva de ~50 para ~48
  // bits. E imperfeito o bastante para nao valer a complexidade? Nao: o preco
  // sao algumas linhas, e a alternativa seria um backup sem distribuicao
  // uniforme. Rejection sampling e o jeito curto de ficar exato.
  const limite = Math.floor(256 / ALFA) * ALFA; // 248: 31*8
  const codigos: string[] = [];

  for (let i = 0; i < quantidade; i += 1) {
    let caractere = "";
    while (caractere.length < 10) {
      for (const byte of randomBytes(16)) {
        // Bytes de 248 a 255 sao descartados: sao exatamente os que criariam o
        // vies. Descartar 8 de 256 (3%) e o preco de um alfabeto uniforme.
        if (byte >= limite) continue;
        caractere += ALFABETO_RECUPERACAO[byte % ALFA];
        if (caractere.length === 10) break;
      }
    }
    codigos.push(caractere.slice(0, 5) + "-" + caractere.slice(5));
  }
  return codigos;
}

/** SHA-256 do codigo, em base64url. E o que vai para o banco. */
export function hashRecoveryCode(codigo: string): string {
  return createHash("sha256").update(normalizarRecoveryCode(codigo), "utf8").digest("base64url");
}

/** Remove separadores e caixa, para comparar o que foi digitado com o gravado. */
export function normalizarRecoveryCode(codigo: string): string {
  return codigo.replace(/[\s-]/g, "").toUpperCase();
}

/** Compara um codigo informado com um hash guardado, em tempo constante. */
export function recoveryCodeMatches(codigo: string, hash: string): boolean {
  const calculado = Buffer.from(hashRecoveryCode(codigo), "utf8");
  const guardado = Buffer.from(hash, "utf8");
  if (calculado.length !== guardado.length) return false;
  return timingSafeEqual(calculado, guardado);
}
