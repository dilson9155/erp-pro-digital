/**
 * Testes da politica de acesso (ADR 0003).
 *
 * Este arquivo e a Razao de `policy.ts` existir. Sem ele, a politica e um
 * comentario: o proximo a mexer no proxy reimplementa a regra a partir do
 * comentario, e o comentario nao falha quando alguem erra.
 *
 * Os casos sao escolhidos pelos FALHOS que eles impedem, nao pela cobertura de
 * linhas. Cada `it` abaixo tem um bug concreto que descreve.
 */

import { describe, expect, it } from "vitest";

import { UserStatus } from "@/generated/prisma/enums";
import { decidirAcesso, precisaEscolherFilial, type ContextoAcesso } from "@/server/auth/policy";

/** Usuario no estado "comum": ativo, sem troca pendente, com vinculo valido. */
function usuario(overrides: Partial<ContextoAcesso> = {}): ContextoAcesso {
  return {
    status: UserStatus.ATIVO,
    mustChangePassword: false,
    membershipAtiva: true,
    isPlatformAdmin: false,
    ...overrides,
  };
}

/** Sessao ja vinculada a uma empresa e a uma filial. */
const SESSAO_COMPLETA = { tenantId: "tenant-1", branchId: "filial-1" };
/** Sessao pos-login, antes da escolha de empresa. */
const SESSAO_SEM_EMPRESA = { tenantId: null, branchId: null };

describe("conta nao ativa", () => {
  it("nega conta bloqueada, inativa ou pendente, com o mesmo motivo", () => {
    // A razao de um motivo so para os tres: a resposta nao muda o que o usuario
    // pode fazer, e revelar qual status especifico a conta tem confirma para um
    // atacante que o e-mail existe na base. O "por que" fica no log.
    for (const status of [UserStatus.BLOQUEADO, UserStatus.INATIVO, UserStatus.PENDENTE_ATIVACAO]) {
      expect(decidirAcesso(usuario({ status }), SESSAO_COMPLETA)).toEqual({
        tipo: "negado",
        motivo: "conta_nao_ativa",
      });
    }
  });

  it("nega conta nao ativa antes de qualquer outra verificacao", () => {
    // Se `mustChangePassword` fosse testado primeiro, uma conta bloqueada com
    // senha pendente cairia na tela de troca de senha — uma pagina util para
    // quem esta tentando assumir a conta. Status vem primeiro.
    const conta = usuario({
      status: UserStatus.BLOQUEADO,
      mustChangePassword: true,
      membershipAtiva: null,
      isPlatformAdmin: true,
    });
    expect(decidirAcesso(conta, SESSAO_SEM_EMPRESA).tipo).toBe("negado");
  });
});

describe("mustChangePassword bloqueia, nao avisa", () => {
  it("manda para a troca de senha mesmo com empresa e filial ja escolhidas", () => {
    // Este e o teste que impede a regressao para "banner". Com empresa e filial
    // na sessao, a tentacao natural e deixar passar, porque a pessoa claramente
    // "ja esta dentro".
    expect(decidirAcesso(usuario({ mustChangePassword: true }), SESSAO_COMPLETA)).toEqual({
      tipo: "troca_de_senha",
    });
  });

  it("manda para a troca de senha antes da escolha de empresa", () => {
    // Escolher empresa e um dos primeiros alvos de quem rouba a conta: a senha
    // redefinida pelo suporte ja entrega acesso a alguma empresa. A troca de
    // senha vem antes de qualquer escolha.
    expect(decidirAcesso(usuario({ mustChangePassword: true }), SESSAO_SEM_EMPRESA)).toEqual({
      tipo: "troca_de_senha",
    });
  });

  it("vale tambem para super admin da plataforma", () => {
    // Ortogonalidade. A conta que administra a plataforma e a mais valiosa do
    // sistema; a senha dela nao fica de fora por ser conta de admin.
    expect(
      decidirAcesso(
        usuario({ mustChangePassword: true, isPlatformAdmin: true }),
        SESSAO_COMPLETA,
      ),
    ).toEqual({ tipo: "troca_de_senha" });
  });

  it("deixa passar assim que o flag e desligado", () => {
    // Prova que a regra e do flag e nao do estado anterior: sem este teste, um
    // `if` que gruda o usuario em `troca_de_senha` para sempre passaria nos
    // outros casos e so apareceria como "nao consigo mais entrar".
    const conta = usuario({ mustChangePassword: false });
    expect(decidirAcesso(conta, SESSAO_COMPLETA)).toEqual({ tipo: "acesso" });
  });
});

describe("escolha de empresa", () => {
  it("pede empresa quando a sessao ainda nao tem tenantId", () => {
    expect(decidirAcesso(usuario({ membershipAtiva: null }), SESSAO_SEM_EMPRESA)).toEqual({
      tipo: "escolha_de_empresa",
    });
  });

  it("libera quando a empresa foi escolhida e o vinculo e valido", () => {
    expect(decidirAcesso(usuario(), SESSAO_COMPLETA)).toEqual({ tipo: "acesso" });
  });
});

describe("isPlatformAdmin rotula, nao concede", () => {
  it("nega super admin da plataforma sem vinculo com a empresa", () => {
    // O teste central do ADR 0003. A tentacao aqui e legitima e ja apareceu em
    // projeto de ERP: o cara do suporte precisa ver o cadastro do cliente.
    // A resposta e criar um Membership, nao abrir excecao.
    expect(
      decidirAcesso(
        usuario({ isPlatformAdmin: true, membershipAtiva: false }),
        SESSAO_COMPLETA,
      ),
    ).toEqual({ tipo: "negado", motivo: "sem_vinculo_com_a_empresa" });
  });

  it("nega super admin da plataforma com vinculo inativo", () => {
    // Membership inativa e "pertenceu e foi removido". Nega igual, e por um motivo
    // de auditoria diferente — o log distingue, a resposta nao.
    expect(
      decidirAcesso(usuario({ isPlatformAdmin: true, membershipAtiva: false }), SESSAO_COMPLETA),
    ).toEqual({ tipo: "negado", motivo: "sem_vinculo_com_a_empresa" });
  });

  it("libera super admin COM vinculo, como qualquer usuario", () => {
    // O outro lado da regra: super admin com Membership nao recebe tratamento
    // especial. Se recebesse, o caminho especial passaria a ser o caminho
    // normal e a auditoria perderia o sentido.
    expect(decidirAcesso(usuario({ isPlatformAdmin: true }), SESSAO_COMPLETA)).toEqual({
      tipo: "acesso",
    });
  });

  it("nao altera a decisao em nenhum dos ramos", () => {
    // Este teste e a garantia estrutural do ADR: `isPlatformAdmin` nao aparece em
    // nenhum `if` da funcao. Se alguem adicionar `|| usuario.isPlatformAdmin` em
    // um ramo, este teste quebra.
    const cenarios = [
      SESSAO_COMPLETA,
      SESSAO_SEM_EMPRESA,
    ];

    for (const sessao of cenarios) {
      for (const membershipAtiva of [true, false, null]) {
        const comum = decidirAcesso(usuario({ membershipAtiva }), sessao);
        const admin = decidirAcesso(usuario({ membershipAtiva, isPlatformAdmin: true }), sessao);
        expect(admin).toEqual(comum);
      }
    }
  });
});

describe("precisaEscolherFilial", () => {
  it("pede filial quando tem empresa mas nao tem filial", () => {
    // Empresa sem filial nao e erro de dados: e o estado "escolher filial". O
    // layout monta a tela em vez de ler dado de negocio sem filial e tomar null
    // no meio de uma consulta.
    expect(
      precisaEscolherFilial(usuario(), { tenantId: "tenant-1", branchId: null }),
    ).toBe(true);
  });

  it("nao pede filial quando empresa e filial estao escolhidas", () => {
    expect(precisaEscolherFilial(usuario(), SESSAO_COMPLETA)).toBe(false);
  });

  it("nao pede filial quando a empresa nem foi escolhida", () => {
    // Senao a tela de escolha de filial apareceria junto com a de escolha de
    // empresa, e o usuario teria duas telas para resolver ao mesmo tempo.
    expect(precisaEscolherFilial(usuario({ membershipAtiva: null }), SESSAO_SEM_EMPRESA)).toBe(
      false,
    );
  });

  it("nao pede filial para quem esta bloqueado em troca de senha", () => {
    // A tela de troca de senha nao tem sidebar nem lista de filiais. Se aqui
    // devolvesse `true`, o layout tentaria montar a escolha de filial dentro da
    // tela de troca de senha.
    expect(
      precisaEscolherFilial(usuario({ mustChangePassword: true }), SESSAO_COMPLETA),
    ).toBe(false);
  });
});
