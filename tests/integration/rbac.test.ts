/**
 * Execucao de RBAC contra o banco real.
 *
 * Estes testes sao a prova de que o gate NAO e so um `if`. Cada caso aqui
 * corresponde a uma exclusao que, sesumisse, daria acesso indevido. O criterio
 * de escrita foi: "que linha de codigo, se apagada, quebraria a seguranca?" —
 * e so testes que respondem a isso entraram.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prismaCommon } from "@/server/db/client";
import { can, requirePermission, resolverRbac, type ContextoRbac } from "@/server/auth/rbac";
import { AppError, ErrorCode } from "@/lib/errors";
import {
  attachRole,
  closeTestDb,
  createMembership,
  createRole,
  createSubscription,
  createTenant,
  createUser,
} from "../helpers/factories";

afterAll(async () => {
  await closeTestDb();
});

/** `VENDAS.venda` com as acoes passadas. */
const venda = (actions: string[]) => ({ key: "VENDAS.venda", module: "VENDAS", actions });
const estoque = (actions: string[]) => ({ key: "ESTOQUE.produto", module: "ESTOQUE", actions });

/**
 * Cenario montado: tenant com assinatura, membership e perfis ja ligados.
 *
 * Devolve o contexto ja pronto porque quase todo teste precisa da mesma coisa,
 * e montar a cadeia (tenant -> assinatura -> membership -> perfil) em cada um
 * repetiria a ordem de create — que nao e livre, e um erro de ordem aqui
 * parece bug de permissao.
 */
async function cenario(
  opcoes: {
    modulos?: ("VENDAS" | "ESTOQUE")[];
    statusAssinatura?: "ATIVA" | "TRIAL" | "CANCELADA" | "BLOQUEADA" | "ATRASADA" | "PENDENTE";
    perfis?: readonly { permissoes: readonly { key: string; module: string; actions: string[] }[]; options?: Parameters<typeof createRole>[1] }[];
    membershipAtiva?: boolean;
  } = {},
) {
  const tenant = await createTenant();
  await createSubscription(
    tenant.id,
    opcoes.modulos ?? ["VENDAS"],
    opcoes.statusAssinatura ?? "ATIVA",
  );
  const user = await createUser();
  const membership = await createMembership(tenant.id, user.id);
  if (opcoes.membershipAtiva === false) {
    await prismaCommon.membership.update({
      where: { id: membership.id },
      data: { active: false },
    });
  }

  for (const perfil of opcoes.perfis ?? []) {
    const role = await createRole(perfil.permissoes, {
      tenantId: tenant.id,
      ...perfil.options,
    });
    await attachRole(membership.id, role.id);
  }

  const ctx: ContextoRbac = {
    membershipId: membership.id,
    userId: user.id,
    sessionId: null,
    tenantId: tenant.id,
  };
  return { tenant, user, membership, ctx };
}

describe("resolverRbac", () => {
  it("resolve a uniao de acoes de varios perfis do mesmo recurso", async () => {
    const { ctx } = await cenario({
      perfis: [
        { permissoes: [venda(["read"])] },
        { permissoes: [venda(["create", "update"])] },
      ],
    });

    const { permissoes } = await resolverRbac(ctx);
    // A uniao e por CHAVE: os dois perfis apontam para a mesma `Permission`, e o
    // que se acumula sao as acoes. Se a uniao fosse por linha, o segundo perfil
    // sobrescreveria o primeiro e o usuario perderia `read`.
    expect([...permissoes.get("VENDAS.venda")!].sort()).toEqual(["create", "read", "update"]);
  });

  it("nao concede nada sem membership", async () => {
    // Sessao sem empresa escolhida. `can` e usado pela UI para decidir se
    // esconde o menu inteiro, entao aqui NAO pode lancar.
    const tenant = await createTenant();
    await createSubscription(tenant.id, ["VENDAS"]);
    const { permissoes, modulosFaltantes } = await resolverRbac({
      membershipId: null,
      userId: null,
      sessionId: null,
      tenantId: null,
    });
    expect(permissoes.size).toBe(0);
    expect(modulosFaltantes).toEqual([]);
  });

  it("nao concede nada para membership inativa", async () => {
    const { ctx } = await cenario({
      perfis: [{ permissoes: [venda(["read", "create"])] }],
      membershipAtiva: false,
    });
    const { permissoes } = await resolverRbac(ctx);
    expect(permissoes.size).toBe(0);
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "read" })).toBe(false);
  });

  it("ignora perfil inativo", async () => {
    const { ctx } = await cenario({
      perfis: [{ permissoes: [venda(["read"])], options: { active: false } }],
    });
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "read" })).toBe(false);
  });

  it("ignora perfil logicamente apagado", async () => {
    // `deletedAt` e o soft delete. Um perfil "apagado" que ainda concede e o
    // modo classico de revogacao que nao revoga: o administrador desativa o
    // perfil, a UI esconde, e o acesso continua porque o `where` esqueceu do campo.
    const { ctx } = await cenario({
      perfis: [{ permissoes: [venda(["read"])], options: { deletedAt: new Date() } }],
    });
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "read" })).toBe(false);
  });

  it("ignora perfil de escopo SYSTEM ligado a uma membership humana", async () => {
    // `sistema-fiscal` e papel do motor. Se o seed o ligar a uma `Membership`, o
    // usuario herdaria permissao de sistema sem ninguem ter criado perfil.
    const { ctx } = await cenario({
      perfis: [{ permissoes: [venda(["read", "delete"])], options: { scope: "SYSTEM" } }],
    });
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "read" })).toBe(false);
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "delete" })).toBe(false);
  });

  it("nao concede nada sem assinatura", async () => {
    // Tenant sem assinatura nao contratou nada. Fail-closed.
    const tenant = await createTenant();
    const user = await createUser();
    const membership = await createMembership(tenant.id, user.id);
    const role = await createRole([venda(["read"])], { tenantId: tenant.id });
    await attachRole(membership.id, role.id);

    const ctx: ContextoRbac = {
      membershipId: membership.id,
      userId: user.id,
      sessionId: null,
      tenantId: tenant.id,
    };
    const { permissoes, modulosFaltantes } = await resolverRbac(ctx);
    expect(permissoes.size).toBe(0);
    expect(modulosFaltantes).toContain("VENDAS");
  });

  it("nega o modulo que o plano nao contrata, e diz qual falta", async () => {
    const { ctx } = await cenario({
      modulos: ["VENDAS"],
      perfis: [{ permissoes: [venda(["read"]), estoque(["read"])] }],
    });
    const { permissoes, modulosFaltantes } = await resolverRbac(ctx);
    expect(modulosFaltantes).toEqual(["ESTOQUE"]);
    // Fail-closed no conjunto inteiro: nao devolve "VENDAS" para o usuario
    // operar parcialmente num sistema que so contratou parte.
    expect(permissoes.size).toBe(0);
  });

  it("libera quando o plano contrata todos os modulos exigidos", async () => {
    const { ctx } = await cenario({
      modulos: ["VENDAS", "ESTOQUE"],
      perfis: [{ permissoes: [venda(["read"]), estoque(["update"])] }],
    });
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "read" })).toBe(true);
    expect(await can(ctx, { modulo: "ESTOQUE", recurso: "produto", acao: "update" })).toBe(true);
  });

  it.each([
    ["CANCELADA", false],
    ["BLOQUEADA", false],
    // Atrasada e pendente LIBERAM: cortar o ERP por atraso de cobranca derruba a
    // operacao da empresa. Este teste existe para travar essa decisao de produto
    // no codigo, porque ela parece contraintuitiva para quem le "bloqueia".
    ["ATRASADA", true],
    ["PENDENTE", true],
    ["TRIAL", true],
  ] as const)("assinatura %s -> acesso %s", async (status, esperado) => {
    const { ctx } = await cenario({
      statusAssinatura: status,
      perfis: [{ permissoes: [venda(["read"])] }],
    });
    const { assinaturaBloqueada } = await resolverRbac(ctx);
    expect(assinaturaBloqueada).toBe(!esperado);
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "read" })).toBe(esperado);
  });
});

describe("can", () => {
  it("libera a acao coberta e nega a acao nao listada", async () => {
    const { ctx } = await cenario({
      perfis: [{ permissoes: [venda(["read", "update"])] }],
    });
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "read" })).toBe(true);
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "update" })).toBe(true);
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "delete" })).toBe(false);
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "export" })).toBe(false);
  });

  it("nega recurso que o perfil nao cita, mesmo com outro do mesmo modulo", async () => {
    const { ctx } = await cenario({
      perfis: [{ permissoes: [venda(["read"])] }],
    });
    expect(await can(ctx, { modulo: "VENDAS", recurso: "orcamento", acao: "read" })).toBe(false);
  });

  it("nega modulo que o perfil nao cita", async () => {
    const { ctx } = await cenario({
      modulos: ["VENDAS", "ESTOQUE"],
      perfis: [{ permissoes: [venda(["read"])] }],
    });
    expect(await can(ctx, { modulo: "ESTOQUE", recurso: "produto", acao: "read" })).toBe(false);
  });

  it("nega perfil de outra empresa", async () => {
    // `MembershipRole` nao tem `tenantId`: nada no schema impede ligar o perfil do
    // tenant A a uma membership do tenant B. E o gate que impede. Este teste e
    // o que garante que o `where` do perfil continue checando `tenantId`.
    const alheio = await createTenant();
    const roleAlheio = await createRole([venda(["read", "delete"])], { tenantId: alheio.id });

    const { ctx, membership } = await cenario({ perfis: [{ permissoes: [venda(["read"])] }] });
    await attachRole(membership.id, roleAlheio.id);

    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "read" })).toBe(true);
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "delete" })).toBe(false);
  });

  it("aceita perfil de sistema com tenantId nulo", async () => {
    // Perfil global (tenantId null) e o caso legitimo: um "Operador" padrao que
    // o seed cria uma vez e todos os tenants usam. Este teste impede que a
    // defesa contra perfil alheio seja escrita como "tenantId igual", o que
    // passaria a rejeitar perfis globais legitimos.
    const tenant = await createTenant();
    await createSubscription(tenant.id, ["VENDAS"]);
    const user = await createUser();
    const membership = await createMembership(tenant.id, user.id);
    const roleGlobal = await createRole([venda(["read"])], { tenantId: null, isSystem: true });
    await attachRole(membership.id, roleGlobal.id);

    const ctx: ContextoRbac = {
      membershipId: membership.id,
      userId: user.id,
      sessionId: null,
      tenantId: tenant.id,
    };
    expect(await can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "read" })).toBe(true);
  });

  it("nao consulta o banco quando a tripla e invalida", async () => {
    // A tripla malformada e bug de programacao: tem de estourar no teste, e nao
    // virar um "negado" que apaga o botao sem ninguem entender.
    const { ctx } = await cenario({ perfis: [{ permissoes: [venda(["read"])] }] });
    await expect(
      can(ctx, { modulo: "VENDAS", recurso: "venda", acao: "remover" as never }),
    ).rejects.toThrow(/fora do conjunto/);
  });
});

describe("requirePermission", () => {
  it("nao lanca quando a permissao esta concedida", async () => {
    const { ctx } = await cenario({ perfis: [{ permissoes: [venda(["create"])] }] });
    await expect(
      requirePermission(ctx, { modulo: "VENDAS", recurso: "venda", acao: "create" }),
    ).resolves.toBeUndefined();
  });

  it("lanca 403 quando o perfil nao tem a permissao", async () => {
    const { ctx } = await cenario({ perfis: [{ permissoes: [venda(["read"])] }] });
    const erro = await requirePermission(ctx, {
      modulo: "VENDAS",
      recurso: "venda",
      acao: "delete",
    }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(AppError);
    expect((erro as AppError).code).toBe(ErrorCode.INSUFFICIENT_PERMISSIONS);
    expect((erro as AppError).httpStatus).toBe(403);
  });

  it("lanca MODULE_NOT_ENABLED quando o plano nao cobre o modulo pedido", async () => {
    // O codigo e 403 tambem, mas o codigo de erro e outro: no log, e upgrade de
    // plano; `can` na tela, e a mesma mensagem. E o que separa o suporte de "ajuste
    // o perfil" de "venda o modulo".
    const { ctx } = await cenario({
      modulos: ["VENDAS"],
      perfis: [{ permissoes: [venda(["read"]), estoque(["read"])] }],
    });
    const erro = await requirePermission(ctx, {
      modulo: "ESTOQUE",
      recurso: "produto",
      acao: "read",
    }).catch((e: unknown) => e);
    expect((erro as AppError).code).toBe(ErrorCode.MODULE_NOT_ENABLED);
  });

  it("lanca SUBSCRIPTION_BLOCKED quando a assinatura esta cancelada", async () => {
    // 402 e nao 403: o remedy e comercial, nao tecnico.
    const { ctx } = await cenario({
      statusAssinatura: "CANCELADA",
      perfis: [{ permissoes: [venda(["read"])] }],
    });
    const erro = await requirePermission(ctx, {
      modulo: "VENDAS",
      recurso: "venda",
      acao: "read",
    }).catch((e: unknown) => e);
    expect((erro as AppError).code).toBe(ErrorCode.SUBSCRIPTION_BLOCKED);
    expect((erro as AppError).httpStatus).toBe(402);
  });

  it("a UI e a acao concordam sobre a mesma tripla", async () => {
    // A regressao que mais importa: `can` e `requirePermission` compartilham
    // `gate()`. Se um dia compartilharem apenas a interface, um pode passar e o
    // outro negar, e o usuario ve o botao que falha ao clicar.
    const { ctx } = await cenario({ perfis: [{ permissoes: [venda(["read", "approve"])] }] });

    for (const acao of ["read", "update", "delete", "approve"] as const) {
      const pedido = { modulo: "VENDAS", recurso: "venda", acao } as const;
      const viaCan = await can(ctx, pedido);
      const liberou = await requirePermission(ctx, pedido).then(
        () => true,
        () => false,
      );
      expect(viaCan).toBe(liberou);
    }
  });
});
