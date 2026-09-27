/**
 * TOTP (RFC 6238): segundo fator por codigo de uso unico.
 *
 * Por que implementar aqui em vez de trazer um pacote: o algoritmo inteiro sao
 * HMAC-SHA1 mais um truncamento de 4 bytes, e a parte realmente delicada nao e
 * a conta — e a comparacao em tempo constante, a geracao do segredo e a
 * cifragem em repouso. Um pacote traria essas tres coisas prontas, mas nao o
 * resto. Feito aqui, elas ficam sob controle e sob teste, e nao entra uma
 * dependencia a mais num sistema que precisa ser auditavel.
 *
 * A correcao nao vem da leitura da RFC, mas dos VETORES DE TESTE da propria RFC
 * 6238 (secao de apendice), presentes em `tests/unit/totp.test.ts`. Um TOTP
 * quase certo parece funcionar no celular do usuario e falha em outra marca;
 * os vetores existem para pegar isso antes.
 *
 * SHA-1 e usado aqui como HMAC-SHA1, e nao como hash de assinatura. Nessa uso
 * a primalidade do hash nao e o que protege, e a construcao HMAC nao a usa; e o
 * formato de 6 digitos a cada 30 s e o que todos os autenticadores aceitam.
 * Trocar por SHA-256 deixaria de funcionar em boa parte dos aparelhos.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Passos de 30 s, como manda a RFC 6238 e como todo autenticador assume. */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

/**
 * Passos aceitos em torno do atual.
 *
 * +-1 e o equilibrio usual. O codigo vale 30 s, mas o relogio do celular e o
 * do servidor raramente batem na mesma hora, e a diferenca acumulada de alguns
 * segundos nao pode custar um login. Mais que +-1 triplicaria assenhas validas
 * por vez: sao 1e6 combinacoes, e cada passo extra multiplica a chance de um
 * chute certo por tres. Quem aguenta +-1 depende de ter o relogio correto.
 */
export const TOTP_WINDOW = 1;

/** Segredo de 20 bytes = 160 bits, o minimo da RFC 4226, e 32 chars em base32. */
const SECRET_BYTES = 20;

/** Alfabeto base32 RFC 4648, sem `=` (o padding e implicito no tamanho fixo). */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Passo (`floor(timestamp / 30)`) correspondente a um instante. */
export function stepFor(timestampMs: number): number {
  return Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** Codifica bytes em base32, agrupado para facilitar a digitacao manual. */
function toBase32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

/** Decodifica base32 para bytes. Tolera espacos, hifens e minusculas. */
function fromBase32(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  const bytes: number[] = [];
  let bits = 0;
  let valor = 0;
  for (const caractere of limpo) {
    const indice = BASE32.indexOf(caractere);
    // Um caractere fora do alfabeto indica segredo corrompido ou entrada
    // errada. Devolver `Buffer` vazio aqui faria o TOTP silenciosamente falhar
    // em todas as tentativas, e o usuario veria "codigo invalido" para sempre.
    if (indice < 0) throw new Error("segredo TOTP contem caractere invalido");
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Gera um segredo novo, em base32, pronto para o QR. */
export function generateTotpSecret(): string {
  return toBase32(randomBytes(SECRET_BYTES));
}

/**
 * Calcula o codigo de um passo.
 *
 * `trunc` usa o mesmo dynamic truncation da RFC 4226: os ultimos 4 bytes do
 * HMAC viram um inteiro, e os ultimos digitos desse inteiro sao o codigo. O bit
 * de sinal e mascarado porque ele faria o resultado negativo em cerca de metade
 * dos casos.
 */
export function totpAtStep(segredoBase32: string, step: number, digitos = TOTP_DIGITS): string {
  const segredo = fromBase32(segredoBase32);
  // O contador e um inteiro de 64 bits em big-endian. `writeBigInt64BE` e
  // BigInt porque o passo pode passar de 2^53 no ano de mil e e alguma coisa
  // (2^53/30 segundos = 900 anos), e um `number` perderia precisao ai.
  const contador = Buffer.alloc(8);
  contador.writeBigInt64BE(BigInt(step));

  const mac = createHmac("sha1", segredo).update(contador).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const binario =
    (((mac[offset] ?? 0) & 0x7f) << 24) |
    ((mac[offset + 1] ?? 0) << 16) |
    ((mac[offset + 2] ?? 0) << 8) |
    (mac[offset + 3] ?? 0);

  return String(binario % 10 ** digitos).padStart(digitos, "0");
}

/** Codigo do instante atual. */
export function generateTotp(segredoBase32: string, nowMs: number = Date.now()): string {
  return totpAtStep(segredoBase32, stepFor(nowMs));
}

/** Resultado da conferencia de um codigo, com o passo aceito. */
export interface VerificacaoTotp {
  readonly valido: boolean;
  /**
   * Passo do codigo que casou.
   *
   * Serve para impedir REPLAY: um codigo e valido por 90 s (o passo e os
   * vizinhos), entao quem observar um codigo no telao da vitima consegue
   * reapresenta-lo. Gravar o ultimo passo usado e recusar qualquer passo
   * `<=` a ele transforma a janela de 90 s em uma unica utilizacao.
   *
   * `-1` quando invalido, para que o valor gravado nunca seja confundido com
   * um passo legitimo.
   */
  readonly passo: number;
}

/**
 * Confere um codigo informado.
 *
 * Nao consome nada e nao grava: quem chama decide se grava o `passo`. Separar
 * as duas coisas permite que o mesmo `verificar` sirva tanto para o login
 * (que grava) quanto para a tela de "testar antes de ativar" (que nao).
 */
export function verifyTotp(
  segredoBase32: string,
  codigo: string,
  agoraMs: number = Date.now(),
  ultimoPassoUsado = -1,
): VerificacaoTotp {
  const passoAtual = stepFor(agoraMs);
  // Separadores internos sao removidos, nao so espacos nas pontas. Os
  // autenticadores mostram o codigo agrupado ("287 082"), e colar esse texto
  // quase sempre traz o separador junto. Tambem aceita hifen, pelo mesmo
  // motivo. O `trim` sozinho so resolveria a ponta, e o usuario veria
  // "codigo invalido" para um codigo visualmente correto.
  const codigoLimpo = codigo.replace(/[\s-]/g, "");

  // Um codigo curto ou longo demais nunca casa, e verificar o formato antes do
  // HMAC evita trabalho inutil. O `^\d{6}$` tambem barra letras e sinais, que
  // em `Number()` virariam `NaN` silenciosamente.
  if (!/^\d{6}$/.test(codigoLimpo)) return { valido: false, passo: -1 };

  let segredo: Buffer;
  try {
    segredo = fromBase32(segredoBase32);
  } catch {
    return { valido: false, passo: -1 };
  }
  if (segredo.length === 0) return { valido: false, passo: -1 };

  const inicio = passoAtual - TOTP_WINDOW;
  const fim = passoAtual + TOTP_WINDOW;

  for (let passo = inicio; passo <= fim; passo += 1) {
    if (passo <= ultimoPassoUsado) continue;
    const esperado = totpAtStep(segredoBase32, passo);

    const bufferEsperado = Buffer.from(esperado, "utf8");
    const bufferRecebido = Buffer.from(codigoLimpo, "utf8");
    if (bufferEsperado.length !== bufferRecebido.length) continue;
    // `timingSafeEqual` para nao revelar, pelo tempo gasto, quantos digitos
    // do comeco do codigo ja estavam certos.
    if (timingSafeEqual(bufferEsperado, bufferRecebido)) {
      return { valido: true, passo };
    }
  }

  return { valido: false, passo: -1 };
}

/**
 * URI de provisionamento para o QR (formato `otpauth://`, Key URI Format).
 *
 * `issuer` aparece no app autenticador e e o que o usuario ve ao olhar o
 * codigo. Sem ele, contas de empresas diferentes ficam indistinguiveis no
 * celular, e a pessoa nao sabe qual conta esta protegendo.
 */
export function provisioningUri(segredoBase32: string, conta: string, issuer: string): string {
  const rotulo = encodeURIComponent(`${issuer}:${conta}`);
  return (
    `otpauth://totp/${rotulo}` +
    `?secret=${encodeURIComponent(segredoBase32)}` +
    `&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`
  );
}
