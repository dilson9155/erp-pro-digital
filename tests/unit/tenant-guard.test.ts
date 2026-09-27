import { describe, expect, it } from "vitest";

import {
  applyTenantGuard,
  isParentScopedModel,
  isTenantScopedModel,
  MissingTenantScopeError,
  ParentScopedWriteError,
} from "@/server/db/tenant-guard";
import { SYSTEM_SCOPE_SENTINEL, type TenantScope } from "@/server/db/tenant-scope";

/**
 * Testes do guard de tenant.
 *
 * Estes testes existem porque o modo de falha deste modulo e SILENCIOSO. Uma
 * falta de filtro nao quebra a tela: ela devolve a venda de outra empresa. O
 * teste que pega isso nao e o de tela quebrada, e o que afirma, textualmente,
 * que o filtro foi injetado.
 *
 * Nao ha banco aqui de proposito: `applyTenantGuard` e a decisao pura do
 * guard, e testa-la isolada mantem a suite rapida e sem dependencia externa.
 */

const TENANT_A = "clx1111111111111111111111";
const TENANT_B = "clx2222222222222222222222";

function scope(tenantId: string): TenantScope {
  return {
    tenantId,
    branchId: null,
    allowedBranchIds: null,
    userId: "usr1111111111111111111111",
    sessionId: "ses1111111111111111111111",
    isPlatformAdmin: false,
  };
}

type Args = Record<string, unknown>;

describe("classificacao de models", () => {
  it("reconhece models de negocio com tenantId", () => {
    expect(isTenantScopedModel("Sale")).toBe(true);
    expect(isTenantScopedModel("Invoice")).toBe(true);
    expect(isTenantScopedModel("Customer")).toBe(true);
  });

  it("nao trata models de plataforma como tenant-scoped", () => {
    // Sem escopo, estes passam direto: sao dados globais do SaaS.
    expect(isTenantScopedModel("Plan")).toBe(false);
    expect(isTenantScopedModel("Permission")).toBe(false);
    expect(isTenantScopedModel("Ncm")).toBe(false);
    expect(isTenantScopedModel("User")).toBe(false);
    expect(isTenantScopedModel("Tenant")).toBe(false);
  });

  it("separa models que herdam o escopo do pai", () => {
    // As tres pontes de RBAC nao tem tenant proprio.
    expect(isParentScopedModel("RolePermission")).toBe(true);
    expect(isParentScopedModel("MembershipRole")).toBe(true);
    expect(isParentScopedModel("UserBranchAccess")).toBe(true);
  });

  it("trata as tabelas-filhas como tenant-scoped", () => {
    // Antes estas 15 nao tinham `tenantId` e dependiam do pai. Agora tem
    // coluna propria, entao o filtro e direto e uniforme com o resto.
    for (const model of [
      "SaleItem",
      "InvoiceItem",
      "InvoiceEvent",
      "PurchaseItem",
      "QuoteItem",
      "SalesOrderItem",
      "SaleReturnItem",
      "CommissionItem",
      "InventoryItem",
      "StockTransferItem",
      "BankReconciliationItem",
      "SubscriptionEvent",
      "SupportMessage",
      "ConsentLog",
      "DataSubjectRequest",
    ]) {
      expect(isTenantScopedModel(model)).toBe(true);
      expect(isParentScopedModel(model)).toBe(false);
    }
  });
});

describe("fail-closed", () => {
  it("recusa leitura de model de negocio sem escopo", () => {
    expect(() => applyTenantGuard("Sale", "findMany", {}, null)).toThrow(MissingTenantScopeError);
  });

  it("recusa escrita de model de negocio sem escopo", () => {
    expect(() => applyTenantGuard("Sale", "create", { data: {} }, null)).toThrow(
      MissingTenantScopeError,
    );
  });

  it("recusa delete sem escopo, em vez de apagar em todas as empresas", () => {
    expect(() => applyTenantGuard("Customer", "deleteMany", {}, null)).toThrow(
      MissingTenantScopeError,
    );
  });

  it("recusa leitura de model que herda do pai sem filtro", () => {
    expect(() => applyTenantGuard("SaleItem", "findMany", {}, null)).toThrow(
      MissingTenantScopeError,
    );
  });

  it("deixa passar models de plataforma sem escopo", () => {
    const args: Args = { where: { key: "sales.create" } };
    const handled = applyTenantGuard("Permission", "findFirst", args, null);
    expect(handled).toBe(false);
    expect(args.where).toEqual({ key: "sales.create" });
  });
});

describe("injecao de filtro na leitura", () => {
  it("injeta tenantId quando nao ha filtro", () => {
    const args: Args = {};
    applyTenantGuard("Sale", "findMany", args, scope(TENANT_A));
    expect(args.where).toEqual({ tenantId: TENANT_A });
  });

  it("preserva o filtro do chamador", () => {
    const args: Args = { where: { status: "RASCUNHO" } };
    applyTenantGuard("Sale", "findMany", args, scope(TENANT_A));
    expect(args.where).toEqual({ status: "RASCUNHO", tenantId: TENANT_A });
  });

  it("preserva condicoes complexas do chamador", () => {
    // O filtro do tenant precisa ser um AND com o resto, nunca um OU: um
    // `OR: [{ tenantId }, { archived: true }]` devolveria vendas arquivadas
    // de outras empresas.
    const args: Args = { where: { OR: [{ status: "PAGO" }, { status: "PENDENTE" }] } };
    applyTenantGuard("Sale", "findMany", args, scope(TENANT_A));
    expect(args.where).toEqual({
      OR: [{ status: "PAGO" }, { status: "PENDENTE" }],
      tenantId: TENANT_A,
    });
  });

  it("filtra tambem count, aggregate e groupBy", () => {
    for (const operation of ["count", "aggregate", "groupBy"]) {
      const args: Args = {};
      applyTenantGuard("Sale", operation, args, scope(TENANT_A));
      expect(args.where).toEqual({ tenantId: TENANT_A });
    }
  });

  it("permite ver a matriz de permissoes do sistema junto com a da empresa", () => {
    // `Role.tenantId` e anulavel de proposito: `null` e a matriz de sistema,
    // que precisa ser visivel para o RBAC funcionar.
    const args: Args = {};
    applyTenantGuard("Role", "findMany", args, scope(TENANT_A));
    expect(args.where).toEqual({
      OR: [{ tenantId: TENANT_A }, { tenantId: null }],
    });
  });
});

describe("injecao de filtro na escrita", () => {
  it("injeta tenantId no create", () => {
    const args: Args = { data: { total: 100 } };
    applyTenantGuard("Sale", "create", args, scope(TENANT_A));
    expect(args.data).toEqual({ total: 100, tenantId: TENANT_A });
  });

  it("injeta tenantId em todas as linhas do createMany", () => {
    const args: Args = { data: [{ total: 1 }, { total: 2 }] };
    applyTenantGuard("Sale", "createMany", args, scope(TENANT_A));
    expect(args.data).toEqual([
      { total: 1, tenantId: TENANT_A },
      { total: 2, tenantId: TENANT_A },
    ]);
  });

  it("nao sobrescreve um tenantId explicito igual ao do escopo", () => {
    const args: Args = { data: { tenantId: TENANT_A, total: 1 } };
    applyTenantGuard("Sale", "create", args, scope(TENANT_A));
    expect(args.data).toEqual({ tenantId: TENANT_A, total: 1 });
  });

  it("impede mover um registro para outra empresa", () => {
    const args: Args = { where: { id: "sale1" }, data: { tenantId: TENANT_B } };
    expect(() => applyTenantGuard("Sale", "update", args, scope(TENANT_A))).toThrow(
      /Nao e permitido alterar tenantId/,
    );
  });

  it("impede mover registros em updateMany", () => {
    const args: Args = { where: {}, data: { tenantId: TENANT_B } };
    expect(() => applyTenantGuard("Customer", "updateMany", args, scope(TENANT_A))).toThrow(
      /Nao e permitido alterar tenantId/,
    );
  });

  it("impede mover registro pelo lado update do upsert", () => {
    const args: Args = {
      where: { id: "sale1" },
      create: { total: 1 },
      update: { tenantId: TENANT_B },
    };
    expect(() => applyTenantGuard("Sale", "upsert", args, scope(TENANT_A))).toThrow(
      /Nao e permitido alterar tenantId/,
    );
  });
});

describe("operacoes por chave unica", () => {
  it("combina o filtro com AND em update", () => {
    // Sem o AND, `update({ where: { id } })` permitiria alterar a venda de
    // outra empresa so por adivinhar o id.
    const args: Args = { where: { id: "sale1" }, data: { total: 2 } };
    applyTenantGuard("Sale", "update", args, scope(TENANT_A));
    expect(args.where).toEqual({ AND: [{ id: "sale1" }, { tenantId: TENANT_A }] });
  });

  it("combina o filtro com AND em delete", () => {
    const args: Args = { where: { id: "sale1" } };
    applyTenantGuard("Sale", "delete", args, scope(TENANT_A));
    expect(args.where).toEqual({ AND: [{ id: "sale1" }, { tenantId: TENANT_A }] });
  });

  it("trata deleteMany sem where como filtro apenas do tenant", () => {
    // `deleteMany` aceita `WhereInput` comum, entao o filtro fica plano. O
    // `AND` com objeto vazio so e necessario em update/delete/upsert, que
    // exigem `WhereUniqueInput`.
    const args: Args = {};
    applyTenantGuard("Customer", "deleteMany", args, scope(TENANT_A));
    expect(args.where).toEqual({ tenantId: TENANT_A });
  });

  it("injeta tenantId no lado create do upsert", () => {
    const args: Args = {
      where: { id: "sale1" },
      create: { total: 1 },
      update: { total: 2 },
    };
    applyTenantGuard("Sale", "upsert", args, scope(TENANT_A));
    expect(args.where).toEqual({ AND: [{ id: "sale1" }, { tenantId: TENANT_A }] });
    expect(args.create).toEqual({ total: 1, tenantId: TENANT_A });
  });
});

describe("itens criados junto com o pai", () => {
  it("propaga o tenant para os itens do nested create", () => {
    // A coluna do item e NOT NULL. Como o Prisma emite UMA operacao para o
    // pai, o hook nao roda para os filhos: sem esta propagacao, criar uma venda
    // com itens falharia no banco.
    const args: Args = {
      data: { total: 100, items: { create: [{ productId: "p1", quantity: 2 }] } },
    };
    applyTenantGuard("Sale", "create", args, scope(TENANT_A));
    expect(args.data).toEqual({
      tenantId: TENANT_A,
      total: 100,
      items: { create: [{ productId: "p1", quantity: 2, tenantId: TENANT_A }] },
    });
  });

  it("ignora um tenantId errado informado no item", () => {
    // O item tem de pertencer a mesma empresa do pai. Aceitar o valor do
    // chamador criaria uma linha de outra empresa dentro do documento.
    const args: Args = {
      data: { items: { create: [{ productId: "p1", tenantId: TENANT_B }] } },
    };
    applyTenantGuard("Sale", "create", args, scope(TENANT_A));
    const created = (args.data as { items: { create: { tenantId: string }[] } }).items.create;
    expect(created[0]?.tenantId).toBe(TENANT_A);
  });

  it("propaga em createMany de itens", () => {
    const args: Args = {
      data: { items: { createMany: { data: [{ productId: "p1" }, { productId: "p2" }] } } },
    };
    applyTenantGuard("Sale", "create", args, scope(TENANT_A));
    const data = (args.data as { items: { createMany: { data: { tenantId: string }[] } } }).items
      .createMany.data;
    expect(data.map((row) => row.tenantId)).toEqual([TENANT_A, TENANT_A]);
  });

  it("propaga nos dois niveis: venda, itens e eventos de nota", () => {
    const args: Args = {
      data: {
        items: { create: [{ productId: "p1" }] },
        events: { create: [{ type: "EMISSAO" }] },
      },
    };
    applyTenantGuard("Invoice", "create", args, scope(TENANT_A));
    expect(args.data).toEqual({
      tenantId: TENANT_A,
      items: { create: [{ productId: "p1", tenantId: TENANT_A }] },
      events: { create: [{ type: "EMISSAO", tenantId: TENANT_A }] },
    });
  });

  it("nao mexe em chaves desconhecidas do payload", () => {
    // Um percorrimento recursivo cego entraria em `where` e `select`, onde
    // `tenantId` nao pertence e a query seria estragada.
    const args: Args = {
      data: { number: "1", where: { id: "x" }, select: { id: true } },
    };
    applyTenantGuard("Sale", "create", args, scope(TENANT_A));
    expect(args.data).toEqual({
      tenantId: TENANT_A,
      number: "1",
      where: { id: "x" },
      select: { id: true },
    });
  });
});

describe("pontes de RBAC, que herdam o escopo do pai", () => {
  it("recusa escrita direta em ponte", () => {
    // `role: { connect: { id } }` prova que o papel existe, nao que ele e desta
    // empresa. A gravacao correta e pelo pai.
    const args: Args = { data: { role: { connect: { id: "role1" } }, permissionKey: "x" } };
    expect(() => applyTenantGuard("RolePermission", "create", args, scope(TENANT_A))).toThrow(
      ParentScopedWriteError,
    );
  });

  it("recusa update em ponte filtrada apenas por id", () => {
    const args: Args = { where: { id: "rp1" }, data: { permissionKey: "y" } };
    expect(() => applyTenantGuard("RolePermission", "update", args, scope(TENANT_A))).toThrow(
      ParentScopedWriteError,
    );
  });

  it("aceita leitura quando o filtro aponta o pai", () => {
    const args: Args = { where: { role: { tenantId: TENANT_A } } };
    const handled = applyTenantGuard("RolePermission", "findMany", args, scope(TENANT_A));
    expect(handled).toBe(false);
  });

  it("recusa leitura em ponte sem filtro do pai", () => {
    const args: Args = { where: { id: "rp1" } };
    expect(() => applyTenantGuard("RolePermission", "findMany", args, scope(TENANT_A))).toThrow(
      MissingTenantScopeError,
    );
  });

  it("recusa leitura em item de negocio sem filtro", () => {
    // `SaleItem` tem tenant proprio, entao SEM escopo e recusado.
    expect(() => applyTenantGuard("SaleItem", "findMany", {}, null)).toThrow(
      MissingTenantScopeError,
    );
  });

  it("filtra item de negocio direto, sem passar pelo pai", () => {
    // O ganho de ter tenantId na folha: nao depende mais de lembrar de filtrar
    // pelo pai para nao vazar.
    const args: Args = {};
    applyTenantGuard("SaleItem", "findMany", args, scope(TENANT_A));
    expect(args.where).toEqual({ tenantId: TENANT_A });
  });
});

describe("acesso cross-tenant autorizado", () => {
  function systemScope(): TenantScope {
    return {
      tenantId: SYSTEM_SCOPE_SENTINEL,
      branchId: null,
      allowedBranchIds: null,
      userId: null,
      sessionId: null,
      isPlatformAdmin: true,
    };
  }

  it("nao injeta filtro para o super admin da plataforma", () => {
    const args: Args = {};
    const handled = applyTenantGuard("Sale", "findMany", args, systemScope());
    expect(handled).toBe(true);
    expect(args.where).toBeUndefined();
  });

  it("recusa a sentinela se ela vazar fora de withSystemScope", () => {
    // `withSystemScope` cria o escopo sentado; nada mais pode. Sem esta
    // verificacao, bastaria um `tenantId` forjado para desligar o filtro.
    const forged: Args = { where: {} };
    const scopeWithForgedSentinel: TenantScope = { ...scope(TENANT_A), tenantId: SYSTEM_SCOPE_SENTINEL };
    expect(() => applyTenantGuard("Sale", "findMany", forged, scopeWithForgedSentinel)).toThrow(
      MissingTenantScopeError,
    );
  });
});
