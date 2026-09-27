/**
 * Politica de acesso: o unico lugar do sistema que le `isPlatformAdmin` e
 * `mustChangePassword` para DECIDIR algo.
 *
 * O ADR 0003 fixa a regra: os dois flags nunca ampliam escopo. `isPlatformAdmin`
 * rotula (o acesso a dado de empresa continua exigindo `Membership`) e
 * `mustChangePassword` bloqueia (a unica rota liberada e a troca de senha).
 *
 * POR QUE UM MODULO INTEIRO E NAO UM `if` NO PROXY
 *
 * Uma regra de acesso escrita direto no `proxy.ts` tem dois modos de falhar, e os
 * dois sao silenciosos:
 *
 * 1. Diverge entre rotas. O `matcher` do proxy e a arvore de rotas do App Router
 *    sao duas listas escritas a mao em lugares diferentes. Uma delas esquece de
 *    incluir `/configuracoes`, a rota fica sem a regra, e nada acusa: a pagina
 *    abre, so que para quem nao devia.
 * 2. E reimplementada por quem arrives depois. O primeiro `if` resolve o caso
 *    dele, o segundo resolve o caso dele, e ninguem compara os dois. Duas
 *    regras que concordam hoje divergem quando a terceira aparece.
 *
 * Concentrar aqui troca "duas listas de rotas" por "uma funcao com testes". O
 * proxy continua decidindo O QUE VERIFICAR; ele nao decide COMO.
 *
 * POR QUE OS DOIS FLAGS FICAM JUNTOS NESTE ARQUIVO
 *
 * Nao e por Organizacao. E que eles interagem, e a interacao e o que tem regra:
 * um super admin com senha provisoria tem de trocar a senha, e essa combinacao
 * nao aparece em nenhum dos dois isoladamente. Separados em dois modulos, cada
 * um com a sua leitura de "e agora?", o caso quebrado nao tem dono.
 */

import { UserStatus } from "@/generated/prisma/enums";

/**
 * O que a politica precisa saber, e nada mais.
 *
 * Deliberadamente NAO e o model `User`. Passar o model inteiro faria a funcao
 * aceitar `passwordHash` e `totpSecretEncrypted` como entrada, e uma funcao de
 * decisao que enxerga credencial e uma funcao a um `console.log` de distância.
 * Aqui so entra o que a decisao usa, e o tipo funciona como lista de verificacao
 * do que a politica precisa ganhar quando o schema mudar.
 */
export interface ContextoAcesso {
  readonly status: UserStatus;
  readonly mustChangePassword: boolean;

  /**
   * Vínculo com a empresa da sessão.
   *
   * `null` = a sessão ainda nao escolheu empresa (tela de escolha). `false` =
   *Membership inexistente OU inativa — os dois negam, por motivos distintos que
   * a auditoria registra separadamente.
   */
  readonly membershipAtiva: boolean | null;

  /**
   *so para rotulo e auditoria. Entra na decisao como informacao, nunca como
   * concessao: nenhum ramo deste arquivo devolve "acesso" por causa dele.
   */
  readonly isPlatformAdmin: boolean;
}

/** O que a sessao traz de empresa. `null` = ainda nao escolheu. */
export interface ContextoSessao {
  readonly tenantId: string | null;
  readonly branchId: string | null;
}

/**
 * Resultado da politica.
 *
 * As tres saidas de sucesso e o negado sao tipos distintos, e nao um `string`.
 * O consumidor faz `switch` sobre o tipo, e o compilador avisa quando um destino
 * novo e adicionado sem tratamento. Com um `string`, o destino novo entra em
 * producao caindo no `else` que ninguem revisou.
 */
export type DecisaoAcesso =
  | { readonly tipo: "acesso" }
  /** Unica rota liberada enquanto `mustChangePassword` estiver ligado. */
  | { readonly tipo: "troca_de_senha" }
  /** Sessao valida, mas ainda sem empresa escolhida. */
  | { readonly tipo: "escolha_de_empresa" }
  | { readonly tipo: "negado"; readonly motivo: MotivoNegativa };

export type MotivoNegativa =
  | "conta_nao_ativa"
  | "sem_vinculo_com_a_empresa";

/**
 * Decide o que a pessoa pode fazer agora.
 *
 * A ORDEM dos testes e a decisao, e nao um detalhe de implementacao. Ela responde
 * a pergunta "qual e o primeiro obstaculo que impede o avanco?", e cada obstaculo
 * posterior so importa se os anteriores nao existirem.
 *
 * `status` vem primeiro porque e o unico filtro que nao tem caminho de
 * recuperacao dentro do app: conta nao ativa nao alcança nenhuma pagina que
 * pudesse resolve-la. Os outros dois tem destino — trocar a senha, escolher
 * empresa — e negar a pessoa por um obstaculo mais profundo deixaria ela num
 * beco sem saida, so que agora sem ver a tela que a resolveria.
 */
export function decidirAcesso(
  usuario: ContextoAcesso,
  sessao: ContextoSessao,
): DecisaoAcesso {
  // Allowlist: so `ATIVO` passa. Um status novo no enum e NEGADO ate alguem
  // decidir o que ele significa — o mesmo argumento de `authenticateSession`.
  if (usuario.status !== UserStatus.ATIVO) {
    return { tipo: "negado", motivo: "conta_nao_ativa" };
  }

  // Acima de TUDO, inclusive da escolha de empresa. Quem teve a senha
  // redefinida por outra pessoa nao deve conseguir nem escolher a empresa antes
  // de trocar a senha: essa escolha e um dos primeiros alvos de quem rouba a
  // conta, porque ja devolve acesso a algum lugar.
  if (usuario.mustChangePassword) {
    return { tipo: "troca_de_senha" };
  }

  // Sem empresa escolhida ainda.
  if (sessao.tenantId === null) {
    return { tipo: "escolha_de_empresa" };
  }

  // Empresa escolhida, mas sem vinculo valido.
  //
  // Este e o ponto onde o ADR 0003 diz que `isPlatformAdmin` NAO abre atalho.
  // O `isPlatformAdmin` aparece no `ContextoAcesso` e e propositalmente ignorado
  // aqui: super admin da plataforma sem `Membership` nao entra. Quem gerencia a
  // plataforma e quem administra as empresas sao papeis separados, e o vinculo
  // continua sendo o unico caminho para dado de negocio.
  if (!usuario.membershipAtiva) {
    return { tipo: "negado", motivo: "sem_vinculo_com_a_empresa" };
  }

  return { tipo: "acesso" };
}

/**
 * `branchId` anulado com empresa escolhida e situacao normal?
 *
 * Existe para o layout: empresa sem filial selecionada NAO e erro, e sim o
 * estado "escolha de filial". O layout monta uma tela em vez de tentar ler dado
 * de negocio sem filial e tomar `null` no meio de uma consulta.
 *
 * Nao e um quarto tipo de `DecisaoAcesso` de proposito: "escolher filial" e uma
 * consequencia de "acesso", nao uma restricao. Separate-lo faria o consumidor
 * ter de checar os dois campos em vez de um `tipo`.
 */
export function precisaEscolherFilial(
  usuario: ContextoAcesso,
  sessao: ContextoSessao,
): boolean {
  return (
    decidirAcesso(usuario, sessao).tipo === "acesso" && sessao.tenantId !== null && sessao.branchId === null
  );
}
