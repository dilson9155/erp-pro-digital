/**
 * Movimentacao de estoque contra o banco real.
 *
 * Aqui nao ha mock. `FOR UPDATE`, `@@unique([tenantId, idempotencyKey])` e o
 * `Decimal(14,4)` do Postgres sao exatamente o que produz na producao, e um
 * teste com cliente falso passaria para codigo que depende dos tres.
 *
 * ## O QUE ESTES TESTES PROVAM, E POR QUE SAO ESTES
 *
 * Cada `it` abaixo corresponde a um bug que EXISTIU nesta base:
 *
 * - produto repetido na mesma venda, com o saldo sobrescrito;
 * - `indiceDaChave` contando cinco segmentos em uma chave de quatro, que fazia
 *   o estorno de toda venda falhar;
 * - desconto a vista somado as parcelas em vez de subtraido.
 *
 * A regra de escrita foi a mesma do `rbac.test.ts`: "que linha, se apagada,
 * quebraria o sistema?". O que nao responde a isso nao entrou.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { toQuantity } from "@/lib/money";
import {
  aplicarBaixaDeVenda,
  aplicarEstornoDeVenda,
  CHAVE_BAIXA,
  EstoqueInsuficiente,
  travarSaldos,
} from "@/server/app/estoque/movimento";
import { prismaCommon } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant-scope";
import {
  closeTestDb,
  createCenarioEstoque,
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

/** Cenario + escopo, que e o par que toda funcao de estoque exige. */
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

describe("chave de idempotencia da baixa", () => {
  it("faz round-trip do indice de cada linha", () => {
    // Esta e a regressao do bug do estorno: a chave tem QUATRO segmentos, e o
    // parse conferia cinco. O estorno de toda venda falhava com "chave de
    // idempotencia invalida" — mensagem que nao sugere contagem de segmento.
    for (const indice of [0, 1, 7, 42]) {
      expect(CHAVE_BAIXA.indice(CHAVE_BAIXA.montar("venda-abc123", indice))).toBe(indice);
    }
  });

  it("recusa uma chave que nao e de baixa, em vez de assumir indice", () => {
    // Chave corrompida ou de outro modulo. Devolver `0` faria o estorno
    // colidir com o da primeira linha e o estoque entraria duas vezes.
    expect(CHAVE_BAIXA.indice("venda:abc:entrada:0")).toBeNull();
    expect(CHAVE_BAIXA.indice("venda:abc:baixa:x")).toBeNull();
    expect(CHAVE_BAIXA.indice(null)).toBeNull();
    expect(CHAVE_BAIXA.indice("")).toBeNull();
  });

  it("nao confunde o prefixo de outro documento", () => {
    // `idempotencyKey` e uma coluna compartilhada por compra, transferencia e
    // inventario. Uma chave `venda:x:baixa:0` que passou a ser lida como baixa
    // de linha 0 estornaria a linha errada.
    expect(CHAVE_BAIXA.indice("compra:abc:baixa:0")).toBeNull();
  });
});

describe("baixa de estoque", () => {
  it("debita o saldo e grava o extrato com o custo congelado", async () => {
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, {
      quantity: "10",
      averageCost: "5",
    });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-000001", [
      { productId: c.produtos.mercadoria.id, quantity: "3", unitPrice: "20" },
    ]);

    const resultado = await prismaCommon.$transaction(async (tx) =>
      aplicarBaixaDeVenda(tx, c.scope, {
        branchId: c.branch.id,
        saleId: venda.id,
        saleNumber: venda.number,
        itens: [
          {
            indice: 0,
            productId: c.produtos.mercadoria.id,
            description: "Teclado",
            quantity: toQuantity(3),
          },
        ],
        performedById: null,
      }),
    );

    const item = await testDb().stockItem.findFirstOrThrow({
      where: { productId: c.produtos.mercadoria.id },
    });
    expect(item.quantity.toString()).toBe("7");

    // Custo congelado: e o que `confirmarVenda` grava em `sale_items.unit_cost`.
    // Se voltasse `0`, a margem da venda apareceria como lucro integral.
    expect(resultado.custoPorLinha.get(0)?.toString()).toBe("5");

    const movimento = await testDb().stockMovement.findFirstOrThrow({
      where: { idempotencyKey: CHAVE_BAIXA.montar(venda.id, 0) },
    });
    // Negativo por convencao do schema.
    expect(movimento.quantity.toString()).toBe("-3");
    expect(movimento.balanceAfter.toString()).toBe("7");
    // Saida NAO reprecifica: `averageCostAfter` e o custo que ja estava.
    expect(movimento.averageCostAfter.toString()).toBe("5");
  });

  it("baixa o mesmo produto em duas linhas sem perder a primeira", async () => {
    // A REGRESSAO MAIS CARA. `travarSaldos` le cada `productId` uma vez, e as
    // duas linhas liam o mesmo objeto: a segunda gravava `10 - 4 = 6` por cima
    // do `10 - 2 = 8` da primeira. Estoque final 6 em vez de 4.
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "10" });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-000002", [
      { productId: c.produtos.mercadoria.id, quantity: "2", unitPrice: "20" },
      { productId: c.produtos.mercadoria.id, quantity: "4", unitPrice: "20" },
    ]);

    await prismaCommon.$transaction(async (tx) =>
      aplicarBaixaDeVenda(tx, c.scope, {
        branchId: c.branch.id,
        saleId: venda.id,
        saleNumber: venda.number,
        itens: [
          { indice: 0, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(2) },
          { indice: 1, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(4) },
        ],
        performedById: null,
      }),
    );

    const item = await testDb().stockItem.findFirstOrThrow({
      where: { productId: c.produtos.mercadoria.id },
    });
    // 10 - 2 - 4 = 4. O valor 6 seria o bug.
    expect(item.quantity.toString()).toBe("4");

    // E os dois movimentos existem, com saldos intermediarios coerentes: e o
    // extrato que um inventario confere.
    const movimentos = await testDb().stockMovement.findMany({
      where: { documentId: venda.id },
      orderBy: { quantity: "desc" },
    });
    expect(movimentos).toHaveLength(2);
    expect(movimentos.map((m) => m.balanceAfter.toString()).sort()).toEqual(["4", "8"]);
  });

  it("recusa a segunda linha quando o saldo so cobre a primeira", async () => {
    // 6 + 6 > 10. Cada linha isolada passaria na checagem contra o disponivel
    // INTEIRO, e o estoque iria para -2. A transacao inteira desfaz.
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "10" });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-000003", [
      { productId: c.produtos.mercadoria.id, quantity: "6", unitPrice: "20" },
      { productId: c.produtos.mercadoria.id, quantity: "6", unitPrice: "20" },
    ]);

    await expect(
      prismaCommon.$transaction(async (tx) =>
        aplicarBaixaDeVenda(tx, c.scope, {
          branchId: c.branch.id,
          saleId: venda.id,
          saleNumber: venda.number,
          itens: [
            { indice: 0, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(6) },
            { indice: 1, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(6) },
          ],
          performedById: null,
        }),
      ),
    ).rejects.toBeInstanceOf(EstoqueInsuficiente);

    const item = await testDb().stockItem.findFirstOrThrow({
      where: { productId: c.produtos.mercadoria.id },
    });
    expect(item.quantity.toString()).toBe("10");
  });

  it("desconta o reservado do disponivel, e nao o que esta em transito", async () => {
    // `inTransitQuantity` NAO subtrai: o item ja saiu de `quantity` na
    // transferencia. Subtrair os dois faria o sistema recusar uma venda com
    // produto na prateleira.
    const c = await cenario();
    const item = await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, {
      quantity: "10",
      reserved: "4",
    });
    await testDb().stockItem.update({
      where: { id: item.id },
      data: { inTransitQuantity: 50 },
    });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-000004", [
      { productId: c.produtos.mercadoria.id, quantity: "6", unitPrice: "20" },
    ]);

    // 10 - 4 reservados = 6 disponiveis. Com o `inTransit` subtraindo, 6 seria
    // recusado e o erro seria "sem estoque" com 10 unidades na prateleira.
    const resultado = await prismaCommon.$transaction(async (tx) =>
      aplicarBaixaDeVenda(tx, c.scope, {
        branchId: c.branch.id,
        saleId: venda.id,
        saleNumber: venda.number,
        itens: [
          { indice: 0, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(6) },
        ],
        performedById: null,
      }),
    );
    expect(resultado.saldoPorLinha.get(0)?.toString()).toBe("4");
  });

  it("trata produto sem linha de estoque como saldo zero", async () => {
    // Produto cadastrado nunca movimentado nao tem `stock_items`. Deve recusar
    // com saldo insuficiente, e nao com erro de banco.
    const c = await cenario();
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-000005", [
      { productId: c.produtos.mercadoria.id, quantity: "1", unitPrice: "20" },
    ]);

    await expect(
      prismaCommon.$transaction(async (tx) =>
        aplicarBaixaDeVenda(tx, c.scope, {
          branchId: c.branch.id,
          saleId: venda.id,
          saleNumber: venda.number,
          itens: [
            { indice: 0, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(1) },
          ],
          performedById: null,
        }),
      ),
    ).rejects.toBeInstanceOf(EstoqueInsuficiente);
  });

  it("ignora produto de outra filial, mesmo com saldo nesta", async () => {
    // O filtro por filial e o que impede debitar o estoque de outra loja. Um
    // `FOR UPDATE` sem `branch_id` traria a linha, e o `stockItem.update`
    // reprecificaria a filial errada.
    const c = await cenario();
    const outra = await testDb().branch.create({
      data: {
        tenantId: c.tenant.id,
        companyId: (await testDb().branch.findFirstOrThrow({ where: { id: c.branch.id } })).companyId,
        name: "Loja 2",
        code: "L2",
        cnpj: "00000196000195",
      },
    });
    await createStockItem(c.tenant.id, outra.id, c.produtos.mercadoria.id, { quantity: "50" });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-000006", [
      { productId: c.produtos.mercadoria.id, quantity: "1", unitPrice: "20" },
    ]);

    await expect(
      prismaCommon.$transaction(async (tx) =>
        aplicarBaixaDeVenda(tx, c.scope, {
          branchId: c.branch.id,
          saleId: venda.id,
          saleNumber: venda.number,
          itens: [
            { indice: 0, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(1) },
          ],
          performedById: null,
        }),
      ),
    ).rejects.toBeInstanceOf(EstoqueInsuficiente);

    // E a outra filial segue intacta.
    const saldoDaOutra = await testDb().stockItem.findFirstOrThrow({
      where: { branchId: outra.id, productId: c.produtos.mercadoria.id },
    });
    expect(saldoDaOutra.quantity.toString()).toBe("50");
  });
});

describe("estorno da baixa", () => {
  it("cancela uma venda com o MESMO produto em duas linhas", async () => {
    // O caminho completo que o `confirmarVenda` percorre: baixa das duas
    // linhas e estorno das duas. Com o `indiceDaChave` contando cinco
    // segmentos, este `estorno` lancava e o cancelamento de QUALQUER venda
    // terminava em erro — inclusive a mais simples, de um item so.
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, {
      quantity: "10",
      averageCost: "5",
    });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-000011", [
      { productId: c.produtos.mercadoria.id, quantity: "1", unitPrice: "20" },
      { productId: c.produtos.mercadoria.id, quantity: "2", unitPrice: "20" },
    ]);
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.outraMercadoria.id, { quantity: "5" });

    await prismaCommon.$transaction(async (tx) => {
      await aplicarBaixaDeVenda(tx, c.scope, {
        branchId: c.branch.id,
        saleId: venda.id,
        saleNumber: venda.number,
        itens: [
          { indice: 0, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(1) },
          { indice: 1, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(2) },
          { indice: 2, productId: c.produtos.outraMercadoria.id, description: "Mouse", quantity: toQuantity(5) },
        ],
        performedById: null,
      });
      await aplicarEstornoDeVenda(tx, c.scope, {
        branchId: c.branch.id,
        saleId: venda.id,
        saleNumber: venda.number,
        performedById: null,
      });
    });

    const item = await testDb().stockItem.findFirstOrThrow({
      where: { productId: c.produtos.mercadoria.id },
    });
    expect(item.quantity.toString()).toBe("10");

    // O `mouse` foi vendido e devolvido no mesmo instante: a transacao termina
    // com os dois saldos como estavam, e com extrato dos dois lados.
    const movimentos = await testDb().stockMovement.findMany({
      where: { documentId: venda.id },
    });
    expect(movimentos.filter((m) => m.origin === "VENDA")).toHaveLength(3);
    expect(movimentos.filter((m) => m.origin === "CANCELAMENTO")).toHaveLength(3);
  });

  it("devolve o saldo ao valor original e recalcula o custo medio", async () => {
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, {
      quantity: "10",
      averageCost: "5",
    });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-000007", [
      { productId: c.produtos.mercadoria.id, quantity: "3", unitPrice: "20" },
    ]);

    await prismaCommon.$transaction(async (tx) =>
      aplicarBaixaDeVenda(tx, c.scope, {
        branchId: c.branch.id,
        saleId: venda.id,
        saleNumber: venda.number,
        itens: [
          { indice: 0, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(3) },
        ],
        performedById: null,
      }),
    );

    // Entrada deprecifica: o custo da reposicao e o do movimento ORIGINAL, e
    // nao a media do momento. Repor na media atual inflaria o custo do saldo.
    await testDb().stockMovement.create({
      data: {
        tenantId: c.tenant.id,
        branchId: c.branch.id,
        productId: c.produtos.mercadoria.id,
        type: "ENTRADA",
        origin: "COMPRA",
        quantity: 10,
        unitCost: 8,
        totalValue: 80,
        balanceAfter: 17,
        averageCostAfter: 6.2,
        idempotencyKey: "compra:xyz:entrada:0",
      },
    });
    const itemAtual = await testDb().stockItem.findFirstOrThrow({
      where: { productId: c.produtos.mercadoria.id },
    });
    await testDb().stockItem.update({
      where: { id: itemAtual.id },
      data: { quantity: 17, averageCost: 6.2, totalValue: 105.4 },
    });

    await prismaCommon.$transaction(async (tx) =>
      aplicarEstornoDeVenda(tx, c.scope, {
        branchId: c.branch.id,
        saleId: venda.id,
        saleNumber: venda.number,
        performedById: null,
      }),
    );

    const depois = await testDb().stockItem.findFirstOrThrow({
      where: { productId: c.produtos.mercadoria.id },
    });
    expect(depois.quantity.toString()).toBe("20");

    // Media ponderada: (17 * 6.2 + 3 * 5) / 20 = 6.02.
    expect(depois.averageCost.toString()).toBe("6.02");

    const estorno = await testDb().stockMovement.findFirstOrThrow({
      where: { idempotencyKey: CHAVE_BAIXA.montarEstorno(venda.id, 0) },
    });
    // O custo do movimento ORIGINAL, nao a media vigente.
    expect(estorno.unitCost.toString()).toBe("5");
    expect(estorno.quantity.toString()).toBe("3");
  });

  it("estorna as duas linhas do mesmo produto", async () => {
    // Sem isto, o `@@unique` da chave de estorno colidiria entre as linhas e o
    // cancelamento falharia com P2002, que nao diz "venda com produto repetido".
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "10" });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-000008", [
      { productId: c.produtos.mercadoria.id, quantity: "2", unitPrice: "20" },
      { productId: c.produtos.mercadoria.id, quantity: "4", unitPrice: "20" },
    ]);

    await prismaCommon.$transaction(async (tx) =>
      aplicarBaixaDeVenda(tx, c.scope, {
        branchId: c.branch.id,
        saleId: venda.id,
        saleNumber: venda.number,
        itens: [
          { indice: 0, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(2) },
          { indice: 1, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(4) },
        ],
        performedById: null,
      }),
    );

    await prismaCommon.$transaction(async (tx) =>
      aplicarEstornoDeVenda(tx, c.scope, {
        branchId: c.branch.id,
        saleId: venda.id,
        saleNumber: venda.number,
        performedById: null,
      }),
    );

    const item = await testDb().stockItem.findFirstOrThrow({
      where: { productId: c.produtos.mercadoria.id },
    });
    expect(item.quantity.toString()).toBe("10");

    const estornos = await testDb().stockMovement.findMany({
      where: { idempotencyKey: { startsWith: `venda:${venda.id}:estorno:` } },
    });
    expect(estornos).toHaveLength(2);
  });

  it("nao entra duas vezes quando o estorno e repetido", async () => {
    // Idempotencia do estorno: um retry do cancelamento nao pode dobrar o
    // estoque. A checagem e por chave, e nao por "ja foi estornado", porque
    // duas linhas de produtos diferentes podem ter a mesma descricao.
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "10" });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-000009", [
      { productId: c.produtos.mercadoria.id, quantity: "3", unitPrice: "20" },
    ]);

    const entrada = {
      branchId: c.branch.id,
      saleId: venda.id,
      saleNumber: venda.number,
      performedById: null,
    };
    await prismaCommon.$transaction(async (tx) =>
      aplicarBaixaDeVenda(tx, c.scope, {
        ...entrada,
        itens: [
          { indice: 0, productId: c.produtos.mercadoria.id, description: "Teclado", quantity: toQuantity(3) },
        ],
      }),
    );
    await prismaCommon.$transaction(async (tx) => aplicarEstornoDeVenda(tx, c.scope, entrada));
    await prismaCommon.$transaction(async (tx) => aplicarEstornoDeVenda(tx, c.scope, entrada));

    const item = await testDb().stockItem.findFirstOrThrow({
      where: { productId: c.produtos.mercadoria.id },
    });
    // 10 - 3 + 3 = 10. Um segundo estorno daria 13.
    expect(item.quantity.toString()).toBe("10");
  });

  it("nao faz nada quando a venda nunca baixou estoque", async () => {
    // Rascunho cancelado nao tem movimento de saida. Estornar aqui criaria uma
    // entrada de estoque que nunca teve saida correspondente.
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "10" });
    const venda = await createSaleRascunho(c.tenant.id, c.branch.id, "V-000010", []);

    await prismaCommon.$transaction(async (tx) =>
      aplicarEstornoDeVenda(tx, c.scope, {
        branchId: c.branch.id,
        saleId: venda.id,
        saleNumber: venda.number,
        performedById: null,
      }),
    );

    const movimentos = await testDb().stockMovement.count({ where: { documentId: venda.id } });
    expect(movimentos).toBe(0);
  });
});

describe("travamento de saldos", () => {
  it("devolve so os produtos da filial, na ordem de travamento", async () => {
    // A ordem por `product_id` e o que evita deadlock entre duas vendas com os
    // mesmos dois produtos em ordem inversa. Um `Map` sem ordem nao garante
    // nada, e o teste verifica que a consulta ordena.
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "10" });
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.outraMercadoria.id, { quantity: "4" });

    const saldos = await prismaCommon.$transaction(async (tx) =>
      travarSaldos(tx, c.scope, {
        branchId: c.branch.id,
        // Passados na ordem INVERSA de creation, para a ordenacao da consulta
        // ser a unica coisa que determina a ordem do lock.
        productIds: [c.produtos.outraMercadoria.id, c.produtos.mercadoria.id],
      }),
    );

    expect(saldos.size).toBe(2);
    const ordenados = [...saldos.keys()].sort();
    expect([...saldos.keys()]).toEqual(ordenados);
  });

  it("calcula o disponivel como quantity menos reserved", async () => {
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, {
      quantity: "10",
      reserved: "3",
    });

    const saldos = await prismaCommon.$transaction(async (tx) =>
      travarSaldos(tx, c.scope, { branchId: c.branch.id, productIds: [c.produtos.mercadoria.id] }),
    );

    const saldo = saldos.get(c.produtos.mercadoria.id);
    expect(saldo?.quantity.toString()).toBe("10");
    expect(saldo?.reservedQuantity.toString()).toBe("3");
    expect(saldo?.available.toString()).toBe("7");
  });

  it("devolve mapa vazio sem consulta quando nao ha produto", async () => {
    const c = await cenario();
    const saldos = await prismaCommon.$transaction(async (tx) =>
      travarSaldos(tx, c.scope, { branchId: c.branch.id, productIds: [] }),
    );
    expect(saldos.size).toBe(0);
  });
});
