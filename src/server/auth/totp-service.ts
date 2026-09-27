/**
 * Servico de TOTP: liga o algoritmo (`src/lib/auth/totp.ts`) e a cifragem
 * (`src/lib/auth/secret-box.ts`) ao banco.
 *
 * A separacao existe porque as duas metades falham de jeitos diferentes: o
 * algoritmo e puro e se testa com os vetores da RFC, a cifragem e pura e se
 * testa com adulteracao de byte, e o servico so tem o que saber e o que fazer
 * quando o resultado chega. Misturar os tres num arquivo so faria os testes
 * precisarem de banco para conferir aritmetica.
 *
 * O estado de ATIVACAO PENDENTE nao tem coluna propria. O criterio e:
 *
 *     totpSecretEncrypted = null          -> nunca configurado
 *     totpSecretEncrypted != null e
 *     totpEnabledAt = null                 -> configurado, aguardando o 1o codigo
 *     totpEnabledAt != null                -> ativo
 *
 * Uma coluna a menos, e nenhum estado em que o segredo existe no banco mas
 * ninguem sabe que o segundo fator NAO esta valendo. Esse estado e o perigoso:
 * a tela mostra "protegido" e o login nao exige codigo.
 */

import { generateTotpSecret, provisioningUri, verifyTotp } from "@/lib/auth/totp";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  recoveryCodeMatches,
  TOTAL_CODIGOS_RECUPERACAO,
} from "@/lib/auth/secret-box";
import { branding } from "@/config/branding";
import { log } from "@/lib/logger";
import { prismaCommon } from "@/server/db/client";

/** Dados para a tela de ativacao, antes de o usuario escanear o QR. */
export interface AtivacaoTotp {
  /** Segredo em base32. Aparece UMA vez, so nesta resposta. */
  readonly segredo: string;
  /** URI `otpauth://` para virar QR. */
  readonly uri: string;
}

/** Resultado de uma confirmacao ou verificacao. */
export interface ResultadoTotp {
  readonly valido: boolean;
  /** Quantos codigos de recuperacao sobraram. `-1` quando nao se aplica. */
  readonly restantes: number;
  /**
   * Os codigos de recuperacao EM CLARO, devolvidos uma unica vez, so quando
   * `valido` e verdadeiro.
   *
   * Eles precisam sair daqui porque sao a unica vez que o usuario vai ver
   * esses valores: o banco guarda so o SHA-256, e SHA-256 nao se inverte. Um
   * servico que gerasse os codigos e apenas contasse nao entregaria nada ao
   * usuario, e o "backup" seria invisivel — o segundo fator sem saida e o que
   * faz as pessoas desativarem.
   *
   * Por isso estes valores nao podem ir para log, e o chamador tem de mostrar
   * a tela de "anote estes codigos" antes de qualquer outra coisa.
   */
  readonly codigos: readonly string[];
}

/** Le o estado de TOTP da conta, sem devolver o segredo. */
async function estado(userId: string) {
  return prismaCommon.user.findUnique({
    where: { id: userId },
    select: { totpSecretEncrypted: true, totpEnabledAt: true, totpRecoveryHashes: true, totpLastStep: true },
  });
}

/** Interpreta a coluna JSON de hashes. Dado invalido vira lista vazia. */
function lerHashes(bruto: string | null): string[] {
  if (!bruto) return [];
  try {
    const valor: unknown = JSON.parse(bruto);
    // `Array.isArray` e o unico filtro necessario: um JSON que decodifica para
    // outra coisa (um objeto, uma string) faria `.map` explodir no meio de um
    // login. Lista vazia e o resultado seguro: o usuario tem menos uma saida,
    // mas nao um erro 500 na tela de recuperacao.
    return Array.isArray(valor) ? valor.filter((h): h is string => typeof h === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Comeca a ativacao: gera o segredo, guarda cifrado, devolve para o QR.
 *
 * O segredo e gerado aqui e nao no cliente por um motivo de seguranca: um
 * segredo que passa pelo navegador ja pode ter sido lido por uma extensao, e o
 * QR e a unica coisa que precisa trafegar. O resto vai cifrado direto para o
 * banco.
 *
 * Reativar sobrescreve um segredo pendente anterior. Confundir duas chaves
 * pendentes e pior do que perder uma: o usuario escaneia o QR novo, o telefone
 * tem o antigo, e a unica saida seria desativar e recomecar.
 */
export async function iniciarAtivacao(userId: string, conta: string): Promise<AtivacaoTotp> {
  const segredo = generateTotpSecret();

  await prismaCommon.user.update({
    where: { id: userId },
    data: { totpSecretEncrypted: encryptSecret(segredo), totpEnabledAt: null, totpRecoveryHashes: null, totpLastStep: null },
  });

  log("auth").info({ userId }, "iniciada ativacao de TOTP");
  return { segredo, uri: provisioningUri(segredo, conta, branding.name) };
}

/**
 * Confirma o primeiro codigo e ativa o segundo fator.
 *
 * Confirma com o segredo que esta no banco, e nao com o que o cliente manda de
 * volta. Se o cliente devolvesse o segredo, a tela poderia "confirmar" um
 * segredo que nunca foi salvo, e o usuario ficaria com um segundo fator que
 * existe no telefone e nao existe no servidor.
 */
export async function confirmarAtivacao(userId: string, codigo: string): Promise<ResultadoTotp> {
  const atual = await estado(userId);
  if (!atual?.totpSecretEncrypted) return { valido: false, restantes: -1, codigos: [] };

  let segredo: string;
  try {
    segredo = decryptSecret(atual.totpSecretEncrypted);
  } catch {
    // Segredo ilegivel no banco: e um problema de dado, nao de senha digitada.
    // Deixar estourar aqui mostraria um 500 ao usuario, que nao tem como
    // consertar — o unico caminho e este: zerar o estado para que ele recomece.
    log("auth").error({ userId }, "segredo TOTP ilegivel no banco; limpando");
    await limpar(userId);
    return { valido: false, restantes: -1, codigos: [] };
  }

  // `verifyTotp` sem `ultimoPasso`: na confirmacao nao ha passo anterior, e
  // qualquer codigo valido no instante serve.
  const r = verifyTotp(segredo, codigo);
  if (!r.valido) return { valido: false, restantes: -1, codigos: [] };

  const codigos = generateRecoveryCodes();
  await prismaCommon.user.update({
    where: { id: userId },
    data: {
      totpEnabledAt: new Date(),
      totpRecoveryHashes: JSON.stringify(codigos.map(hashRecoveryCode)),
      totpLastStep: BigInt(r.passo),
    },
  });

  log("auth").info({ userId }, "TOTP ativado");
  return { valido: true, restantes: codigos.length, codigos };
}

/**
 * Confere um codigo no login e consome o passo.
 *
 * O consumo do passo e o que impede replay: o codigo e valido por 90 s com a
 * janela de tolerancia, entao quem o viu na tela da vitima poderia apresenta-lo
 * de novo. Gravar o passo usado e recusar qualquer passo `<=` a ele e o que
 * fecha essa janela.
 */
export async function verificarTotp(userId: string, codigo: string): Promise<boolean> {
  const atual = await estado(userId);
  if (!atual?.totpSecretEncrypted || !atual.totpEnabledAt) return false;

  let segredo: string;
  try {
    segredo = decryptSecret(atual.totpSecretEncrypted);
  } catch {
    log("auth").error({ userId }, "segredo TOTP ilegivel no banco");
    return false;
  }

  const ultimo = atual.totpLastStep === null ? -1 : Number(atual.totpLastStep);
  const r = verifyTotp(segredo, codigo, Date.now(), ultimo);
  if (!r.valido) return false;

  await prismaCommon.user.update({ where: { id: userId }, data: { totpLastStep: BigInt(r.passo) } });
  return true;
}

/**
 * Consome um codigo de recuperacao.
 *
 * Cada codigo vale uma vez so e some da lista ao ser usado. E por isso que a
 * lista precisa ser reescrita, e nao apenas consultada: um backup de papel e
 * finito, e o usuario precisa ver quantos ainda tem para saber quando parar de
 * adiar a geracao de um novo conjunto.
 */
export async function usarCodigoRecuperacao(userId: string, codigo: string): Promise<boolean> {
  const atual = await estado(userId);
  if (!atual?.totpEnabledAt) return false;

  const hashes = lerHashes(atual.totpRecoveryHashes);
  const indice = hashes.findIndex((h) => recoveryCodeMatches(codigo, h));
  if (indice < 0) return false;

  const restantes = hashes.filter((_, i) => i !== indice);
  await prismaCommon.user.update({
    where: { id: userId },
    data: { totpRecoveryHashes: JSON.stringify(restantes) },
  });

  log("auth").warn({ userId, restantes: restantes.length }, "codigo de recuperacao TOTP consumido");
  return true;
}

/** Quantos codigos de recuperacao a conta ainda tem. */
export async function contarRecuperacoes(userId: string): Promise<number> {
  const atual = await estado(userId);
  return lerHashes(atual?.totpRecoveryHashes ?? null).length;
}

/**
 * Desativa o segundo fator.
 *
 * Nao apaga os codigos de recuperacao sem mais: eles sao recusados na
 * verificacao porque `totpEnabledAt` fica nulo, e `usarCodigoRecuperacao`
 * exige `totpEnabledAt`. Apagar os dois e o mesmo efeito com mais uma
 * condicao para errar.
 */
export async function limpar(userId: string): Promise<void> {
  await prismaCommon.user.update({
    where: { id: userId },
    data: { totpSecretEncrypted: null, totpEnabledAt: null, totpRecoveryHashes: null, totpLastStep: null },
  });
  log("auth").info({ userId }, "TOTP removido");
}

export { TOTAL_CODIGOS_RECUPERACAO };
