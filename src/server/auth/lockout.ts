/**
 * Bloqueio por tentativas de login falhadas.
 *
 * Por que isto EXISTE e nao basta o rate limit: o rate limit conta tentativas
 * por IP, e um atacante com um botnet varre a mesma conta a partir de milhares
 * de origens sem nunca tocar no limite. O bloqueio aqui conta falhas
 * CONSECUTIVAS DA CONTA e persiste no banco, entao ele acompanha a conta,
 * nao a origem.
 *
 * O trade-off, dito com todas as letras, porque e a parte que costuma ser
 * omitida: **isto permite negacao de servico contra a vitima**. Quem sabe o
 * e-mail de alguem consegue trancar a conta sem nunca acertar a senha. Nao ha
 * como impedir os dois ataques ao mesmo tempo com um contador so:
 *
 *   - so por IP  -> o atacante distribui e passa;
 *   - so por conta -> o atacante tranca a vitima de proposito.
 *
 * A mitigacao adotada e o escalonamento progressivo mais o rate limit por
 * conta. O atacante que trava a vitima tambem esgota o proprio orcamento de
 * tentativas, porque as duas coisas contam a mesma currency: o bloqueio so
 * avanca quando o rate limit por conta ainda deixa passar. A vitima sofre
 *esperas curtas e crescentes, nao um bloqueio eterno. Esse e o melhor equilibrio
 *disponivel sem um canal de recuperacao fora de banda (e-mail ou SMS), que
 * resolveria o problema pela raiz.
 *
 * O que este modulo NAO faz, de proposito: responder ao cliente se o e-mail
 * existe. Isso cabe a quem orquestra o login, e o texto de retorno e sempre o
 * mesmo.
 */

import { prismaCommon } from "@/server/db/client";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

/** Segundos de penalidade para o ciclo de bloqueio `n` (1-based). */
export function lockoutSecondsFor(cycle: number): number {
  const { LOGIN_LOCKOUT_BASE_SECONDS: base, LOGIN_LOCKOUT_MAX_SECONDS: teto } = env();
  if (cycle <= 1) return base;
  // 1x, 2x, 4x, 8x... Duplicar em vez de somar `base` a cada ciclo: penalidade
  // aditiva daria a um atacante persistente crescimento apenas linear, e o
  // limite maximo de 1 h seria alcancado em 60 tentativas — barato. Exponencial
  // dobra o custo a cada ciclo e torna a forca bruta Persistentemente cara.
  const escalado = base * 2 ** (cycle - 1);
  return Math.min(escalado, teto);
}

/** Estado da conta necessario para decidir. */
export interface ContaBloqueavel {
  readonly id: string;
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
}

export interface Bloqueio {
  /** A conta esta trancada agora? */
  readonly bloqueado: boolean;
  /** Quanto falta, em segundos, para o bloqueio expirar. 0 se nao bloqueado. */
  readonly restanteSegundos: number;
  /** A tentativa pode ser avaliada, ou nem deve chegar no bcrypt? */
  readonly podeTentar: boolean;
}

/**
 * Avalia o bloqueio atual.
 *
 * `podeTentar` e separado de `bloqueado` de proposito: mesmo bloqueado, o
 * login precisa responder algo — e a resposta correta e a MENSAAGEM DE
 * BLOQUEIO, nao "senha incorreta". Sem essa distincao o usuario ficaria
 * tentando senhas corretamente bloqueado sem entender o motivo.
 */
export function avaliarBloqueio(conta: Pick<ContaBloqueavel, "failedLoginCount" | "lockedUntil">, agora: Date = new Date()): Bloqueio {
  if (!conta.lockedUntil) {
    return { bloqueado: false, restanteSegundos: 0, podeTentar: true };
  }

  const restante = Math.ceil((conta.lockedUntil.getTime() - agora.getTime()) / 1000);

  // `lockedUntil` no passado e o caso comum, nao um erro: significa que o
  // bloqueio venceu enquanto ninguem tentava logar. Tratar como bloqueio
  // ignoraria o prazo e manteria a conta trancada para sempre.
  if (restante <= 0) {
    return { bloqueado: false, restanteSegundos: 0, podeTentar: true };
  }

  return { bloqueado: true, restanteSegundos: restante, podeTentar: false };
}

/**
 * Registra uma falha e devolve o estado resultante.
 *
 * O incremento e feito pelo BANCO, com `increment`, que vira
 * `SET failed_login_count = failed_login_count + 1` no PostgreSQL — uma unica
 * instrucao, com o read-modify-write inteiro sob o lock de linha.
 *
 * Isso NAO e detalhe. A primeira versao deste modulo lia o contador e gravava
 * `valor + 1`, o que parece atomico por estar dentro de `$transaction`, e nao e:
 * transacao interativa nao trava a linha no `SELECT`. Numa onda de cinco
 * tentativas simultaneas, as cinco liam `0` e gravavam `1` — o contador
 * parava em 1 e o bloqueio nunca chegava. O teste de concorrencia existe
 * exatamente para impedir que essa forma "funciona na minha maquina" volte.
 *
 * `updateManyAndReturn` em vez de `update`: `update` lanca quando o registro
 * nao existe, e aqui a conta pode ter sido removida entre o login e a
 * contagem. Isso nao e erro de aplicacao. `updateMany` devolve `count: 0`
 * nesse caso, que e a resposta que queremos.
 */
export async function registrarFalha(contaId: string): Promise<Bloqueio> {
  const { LOGIN_MAX_ATTEMPTS: max } = env();

  const atualizado = await prismaCommon.$transaction(async (tx) => {
    const conta = await tx.user.updateManyAndReturn({
      where: { id: contaId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true, lockedUntil: true },
    });

    const registro = conta[0];
    if (!registro) return null;

    // Um bloqueio ainda vigente NAO e renovado por uma nova falha. Sem esta
    // guarda, o atacante mantem a conta presa indefinidamente: cada tentativa
    // renova a penalidade enquanto ele continua tentando, e o prazo nunca vence.
    const cumpriuPenalidade =
      registro.lockedUntil !== null && registro.lockedUntil.getTime() > Date.now();

    // O bloqueio so entra ao ATINGIR o limite. Antes disso a conta apenas
    // acumula o contador e continua aceitando tentativa: travar no primeiro
    // erro de digitacao transformaria um esquecimento em um minuto de espera, e
    // daria a qualquer um o poder de bloquear uma conta com UMA senha errada.
    if (cumpriuPenalidade || registro.failedLoginCount < max) return registro;

    const ciclo = Math.ceil(registro.failedLoginCount / max);
    const segundos = lockoutSecondsFor(ciclo);

    return tx.user.update({
      where: { id: contaId },
      data: { lockedUntil: new Date(Date.now() + segundos * 1000) },
      select: { failedLoginCount: true, lockedUntil: true },
    });
  });

  if (!atualizado) {
    return { bloqueado: false, restanteSegundos: 0, podeTentar: true };
  }

  const estado = avaliarBloqueio(atualizado);
  if (estado.bloqueado) {
    // Log com o id da conta e o prazo, nunca com o e-mail: o log viaja para
    // agregadores de terceiros e o e-mail e dado pessoal.
    log("auth").warn(
      { contaId, falhas: atualizado.failedLoginCount, restanteSegundos: estado.restanteSegundos },
      "conta bloqueada por falhas de login",
    );
  }

  return estado;
}

/**
 * Registra login bem-sucedido: zera o contador e marca a atividade.
 *
 * `failedLoginCount` volta a zero AQUI, e nao quando a senha confere. Sao a
 * mesma coisa no caminho feliz, mas a distincao importa no caminho do
 * mustChangePassword: a senha estava correta e o login vai ser recusado mais
 * adiante. Zerar o contador nesse ponto faria o sistema aceitar um numero
 * ilimitado de senhas erradas de quem so esta tentando a antiga.
 */
export async function registrarSucesso(contaId: string, ip: string | null): Promise<void> {
  await prismaCommon.user.update({
    where: { id: contaId },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip },
  });
}

/**
 * Grava um hash novo apos login bem-sucedido, sem pedir a senha de novo.
 *
 * O usuario ja provou que conhece a senha NESTA requisicao, entao e o momento
 * seguro para trocar o hash por um de custo maior. Falhar aqui e aceitavel: o
 * login ja foi autorizado, e o hash antigo continua valido — o rehash e uma
 * otimizacao de custo, nao uma condicao de acesso.
 */
export async function aplicarRehash(contaId: string, novoHash: string): Promise<void> {
  try {
    await prismaCommon.user.update({ where: { id: contaId }, data: { passwordHash: novoHash } });
  } catch (error) {
    log("auth").warn({ err: error, contaId }, "nao foi possivel gravar o hash com custo novo");
  }
}
