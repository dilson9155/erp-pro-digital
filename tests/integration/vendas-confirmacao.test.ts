/**
 * Confirmacao da venda: a transacao inteira contra o banco real.
 *
 * A Server Action `confirmarVenda` se reduz a autenticar, validar o `FormData`
 * e chamar `confirmarVendaEmTransacao` (em `src/server/app/vendas/confirmacao`)
 * dentro de uma transacao. E esta funcao, e nao a action, que este arquivo
 * testa - o cookie de sessao que a action exige nao existe em teste.
 *
 * ## POR QUE ESTES TESTES SAO ESTES
 *
 * Cada `it` cobre um bug que EXISTIU nesta base:
 *
 * - desconto a vista SOMADO as parcelas em vez de subtraido: uma venda de 60
 *   com 1 de desconto gerava parcelas de 60 numa conta a receber de 59, e o
 *   `remainingAmount` zerava sem a parcela 1 estar paga;
 * - `ProductType.SERVICO` (e o `Service`) baixando estoque na confirmacao:
 *   a venda era recusada por "estoque insuficiente" de um item que nunca teve
 *   saldo, e o custo congelado de quem nem estocou distorcia o resultado;
 * - recebimento imediato: o checkbox `receberAgora` so existe na tela porque o
 *   bloco na action foi escrito antes - e aqui ele prova o que promete, de
 *   quitar a primeira parcela e deixar o restante PARCIAL.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prismaCommon } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant-scope";
import { confirmarVendaEmTransacao } from "@/server/app/vendas/confirmacao";
import {
  closeTestDb,
  createCenarioEstoque,
  createPaymentMethod,
  createPaymentTerms,
  createSaleRascunho,
  createStockItem,
  testDb,
} from "../helpers/factories";
import { readDevDatabaseUrl, testDatabaseUrl, truncateAll } from "../helpers/test-database";

let testUrl = "";

beforeAll(async () => {
  testUrl = testDatabaseUrl(await readDevDatabaseUrl());
});

afterEach(async () => {
  await truncateAll(testUrl);
});

afterAll(async () => {
  await closeTestDb();
});

async function cenario() {
  const c = await createCenarioEstoque();
  const scope: TenantScope = {
    tenantId: c.tenant.id,
    branchId: c.branch.id,
    allowedBranchIds: [c.branch.id],
    userId: null,
    sessionId: null,
    isPlatformAdmin: false,
  };
  return { ...c, scope };
}

/**
 * Roda a confirmacao como a action roda: uma transacao so, com o escopo.
 *
 * `userId: null` e o valor certo para teste - o movemento de estoque aceita
 * nulo, e o `performedById` e FK para `User` com `onDelete: SetNull`.
 */
async function confirmar(
  c: Awaited<ReturnType<typeof cenario>>,
  vendaId: string,
  opcoes: { readonly receberAgora?: boolean; readonly formaPagamento?: string | null } = {},
) {
  await prismaCommon.$transaction((tx) =>
    confirmarVendaEmTransacao(tx, {
      scope: c.scope,
      tenantId: c.tenant.id,
      userId: null,
      vendaId,
      receberAgora: opcoes.receberAgora ?? false,
      formaPagamento: opcoes.formaPagamento ?? null,
    }),
  );
}

describe("confirmacao e o financeiro", () => {
  it("gera conta a receber com o desconto a vista SUBTRAIDO das parcelas", async () => {
    // REGRESSAO. A conta recebia `total` e as parcelas eram calculadas sobre
    // `total` tambem: venda de 60 com 1 de desconto virava parcelas de 60 numa
    // conta de 59, e os 100 centavos de diferenca nao tinham aonde ser cobrados.
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, {
      quantity: "10",
      averageCost: "5",
    });
    const termos = await createPaymentTerms(c.tenant.id, { cashDiscountCents: 100 });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-0001", [
      { productId: c.produtos.mercadoria.id, quantity: "3", unitPrice: "20" },
    ], { paymentTermsId: termos.id });

    await confirmar(c, venda.id);

    const vendaAtual = await testDb().sale.findUniqueOrThrow({
      where: { id: venda.id },
      include: { items: true },
    });
    expect(vendaAtual.status).toBe("CONFIRMADA");
    expect(vendaAtual.costAmount.toNumber()).toBe(15);

    const conta = await testDb().accountsReceivable.findFirstOrThrow({
      where: { saleId: venda.id },
      include: { installments: true },
    });
    // 60 de venda - 1 de desconto a vista = 59, e a SOMA das parcelas e 59.
    expect(conta.originAmount.toNumber()).toBe(60);
    expect(conta.discountAmount.toNumber()).toBe(1);
    expect(conta.totalAmount.toNumber()).toBe(59);
    expect(conta.remainingAmount.toNumber()).toBe(59);
    expect(conta.status).toBe("PENDENTE");
    expect(conta.installments).toHaveLength(1);
    expect(conta.installments[0]!.amount.toNumber()).toBe(59);
    expect(conta.installments[0]!.remainingAmount.toNumber()).toBe(59);

    const saldo = await testDb().stockItem.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId: c.tenant.id, branchId: c.branch.id, productId: c.produtos.mercadoria.id } },
    });
    expect(saldo.quantity.toNumber()).toBe(7);
  });

  it("congela custo e baixa estoque SO da mercadoria", async () => {
    // `Product` de `type: SERVICO` (item de NFS-e) e `Service` nao tem saldo.
    // A confirmacao nao pode debitar do que nao existe: o custo congela 0 para
    // os dois, e o estoque sai so da MERCADORIA.
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, {
      quantity: "10",
      averageCost: "5",
    });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-0002", [
      { productId: c.produtos.mercadoria.id, quantity: "3", unitPrice: "20" },
      { productId: c.produtos.servicoNfs.id, quantity: "1", unitPrice: "10" },
      { serviceId: c.servicos.instalacao.id, quantity: "1", unitPrice: "150" },
    ]);

    await confirmar(c, venda.id);

    const vendaAtual = await testDb().sale.findUniqueOrThrow({
      where: { id: venda.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    expect(vendaAtual.total.toNumber()).toBe(220);
    expect(vendaAtual.costAmount.toNumber()).toBe(15);
    expect(vendaAtual.items.map((i) => i.unitCost.toNumber())).toEqual([5, 0, 0]);
    expect(vendaAtual.items.map((i) => i.costAmount.toNumber())).toEqual([15, 0, 0]);

    const saldo = await testDb().stockItem.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId: c.tenant.id, branchId: c.branch.id, productId: c.produtos.mercadoria.id } },
    });
    expect(saldo.quantity.toNumber()).toBe(7);
  });

  it("aceita rascunho em PENDENTE, como a tela de balcao mantem", async () => {
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "5" });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-0003", [
      { productId: c.produtos.mercadoria.id, quantity: "1", unitPrice: "10" },
    ], { status: "PENDENTE" });

    await confirmar(c, venda.id);

    const vendaAtual = await testDb().sale.findUniqueOrThrow({ where: { id: venda.id } });
    expect(vendaAtual.status).toBe("CONFIRMADA");
  });
});

describe("recebimento imediato na confirmacao", () => {
  it("quita a primeira parcela e deixa a conta PARCIAL", async () => {
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "10" });
    const termos = await createPaymentTerms(c.tenant.id, {
      type: "PARCELADO",
      installmentCount: 2,
      intervalDays: 30,
    });
    const forma = await createPaymentMethod(c.tenant.id, { name: "Dinheiro" });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-0010", [
      { productId: c.produtos.mercadoria.id, quantity: "4", unitPrice: "25" },
    ], { paymentTermsId: termos.id });

    await confirmar(c, venda.id, { receberAgora: true, formaPagamento: forma.id });

    const conta = await testDb().accountsReceivable.findFirstOrThrow({
      where: { saleId: venda.id },
      include: { installments: { orderBy: { number: "asc" } } },
    });
    // 100 dividido em 2x de 50: receber agora quita so a primeira.
    expect(conta.installments.map((p) => p.status)).toEqual(["PAGO", "PENDENTE"]);
    expect(conta.installments[0]!.paidAmount.toNumber()).toBe(50);
    expect(conta.installments[1]!.remainingAmount.toNumber()).toBe(50);
    expect(conta.status).toBe("PARCIAL");
    expect(conta.paidAmount.toNumber()).toBe(50);
    expect(conta.remainingAmount.toNumber()).toBe(50);
    expect(conta.settledDate).toBeNull();

    const vendaAtual = await testDb().sale.findUniqueOrThrow({ where: { id: venda.id } });
    expect(vendaAtual.paidAmount.toNumber()).toBe(50);
  });

  it("quita a venda a vista inteira", async () => {
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "10" });
    const forma = await createPaymentMethod(c.tenant.id, { name: "Dinheiro" });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-0011", [
      { productId: c.produtos.mercadoria.id, quantity: "3", unitPrice: "20" },
    ]);

    await confirmar(c, venda.id, { receberAgora: true, formaPagamento: forma.id });

    const transacoes = await testDb().paymentTransaction.findMany({ where: { saleId: venda.id } });
    expect(transacoes).toHaveLength(1);
    expect(transacoes[0]!.type).toBe("APROVADA");
    expect(transacoes[0]!.amount.toNumber()).toBe(60);

    const conta = await testDb().accountsReceivable.findFirstOrThrow({
      where: { saleId: venda.id },
      include: { installments: true },
    });
    expect(conta.status).toBe("PAGO");
    expect(conta.remainingAmount.toNumber()).toBe(0);
    expect(conta.settledDate).not.toBeNull();
    expect(conta.installments[0]!.status).toBe("PAGO");

    const vendaAtual = await testDb().sale.findUniqueOrThrow({ where: { id: venda.id } });
    expect(vendaAtual.paidAmount.toNumber()).toBe(60);
  });
});

describe("recusas da confirmacao", () => {
  it("nao confirma duas vezes a mesma venda", async () => {
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "10" });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-0020", [
      { productId: c.produtos.mercadoria.id, quantity: "1", unitPrice: "10" },
    ]);

    await confirmar(c, venda.id);
    await expect(confirmar(c, venda.id)).rejects.toThrow(/ja foi confirmada ou encerrada/);
  });

  it("recusa venda que nao existe", async () => {
    const c = await cenario();
    await expect(confirmar(c, "venda-que-nao-existe")).rejects.toThrow(/Venda nao encontrada/);
  });

  it("recusa rascunho sem itens", async () => {
    const c = await cenario();
    // Sem `items: create`, o rascunho nasce vazio - estado que o schema do
    // formulario nao produz, mas que o banco aceita e a confirmacao tem de
    // recusar antes de gravar conta a receber de venda nenhuma.
    const venda = await testDb().sale.create({
      data: { tenantId: c.tenant.id, branchId: c.branch.id, number: "V-0021", status: "RASCUNHO" },
    });

    await expect(confirmar(c, venda.id)).rejects.toThrow(/nao tem itens/);
  });
});