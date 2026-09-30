/**
 * Itens de venda: `Product` e `Service` sao duas tabelas, nao uma.
 *
 * ## O BUG QUE ESTE ARQUIVO PROVA QUE ESTAVA LA
 *
 * `SaleItem` tem DUAS chaves estrangeiras distintas:
 *
 *     product  Product? @relation(fields: [productId],  references: [id])
 *     service  Service? @relation(fields: [serviceId],  references: [id])
 *
 * `opcoesVenda` e `resolverLinhas` tratavam `serviceId` como se apontasse para
 * `Product`, distinguindo os dois por `ProductType.SERVICO`. Consequencias, em
 * ordem de gravidade:
 *
 * 1. A opcao de servico que a tela oferecia era um id de `Product`, e gravar
 *    esse id em `service_id` viola a FK - a venda falhava ao SALVAR, depois de
 *    a pessoa ter preenchido tudo.
 * 2. Servicos reais do catalogo (`Service`) nunca apareciam na tela.
 * 3. Um `Product` de `type: SERVICO` gravado em `productId` era tratado como
 *    mercadoria na confirmacao e a venda era recusada por "estoque insuficiente"
 *    de um item que nunca teve saldo.
 *
 * Nenhum dos tres produzia mensagem de erro util. Por isso o teste nao verifica
 * so "funciona": ele grava `serviceId` de verdade e confere que o banco aceitou,
 * que o nome saiu do `Service`, e que o estoque nao foi tocado.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { opcoesVenda } from "@/server/app/vendas/queries";
import type { TenantScope } from "@/server/db/tenant-scope";
import { closeTestDb, createCenarioEstoque, createStockItem, testDb } from "../helpers/factories";
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

describe("opcoes de item da venda", () => {
  it("oferece o servico do catalogo `Service`, e nao um `Product`", async () => {
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "10" });

    const opcoes = await opcoesVenda(c.scope, c.branch.id);

    const servico = opcoes.produtos.find((p) => p.origem === "servico");
    // `Service.code` e `SRV-001`, o mesmo texto do `Product` com
    // `type: SERVICO`. A distincao so aparece no prefixo do `value` - e e por
    // isso que o prefixo, e nao o rotulo, e o que o formulario usa.
    expect(servico).toBeDefined();
    expect(servico?.value).toBe(`servico:${c.servicos.instalacao.id}`);
    expect(servico?.rotulo).toContain("Instalacao");
    expect(servico?.preco).toBe("150,00");
  });

  it("mantem o `Product` de `type: SERVICO` como `produto`, sem saldo", async () => {
    // `ProductType.SERVICO` e um item de NFS-e do catalogo de PRODUTOS. Ele
    // continua com `productId` gravado, mas nao tem `stock_items` - e por isso
    // `disponivel` e `null`, e nao "0". Mostrar "0" ao lado do preco faria a
    // pessoa concluir que o item esta zerado.
    const c = await cenario();
    const opcoes = await opcoesVenda(c.scope, c.branch.id);

    const nfs = opcoes.produtos.find((p) => p.value === `produto:${c.produtos.servicoNfs.id}`);
    expect(nfs).toBeDefined();
    expect(nfs?.origem).toBe("produto");
    expect(nfs?.semEstoque).toBe(true);
    expect(nfs?.disponivel).toBeNull();
  });

  it("so a MERCADORIA com saldo mostra disponibilidade", async () => {
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, {
      quantity: "10",
      reserved: "3",
    });

    const opcoes = await opcoesVenda(c.scope, c.branch.id);
    const mercadoria = opcoes.produtos.find((p) => p.value === `produto:${c.produtos.mercadoria.id}`);

    // 10 - 3 reservados = 7. O saldo vem da filial da tela, e o reservado
    // conta: 7 e o que a pessoa pode vender agora.
    expect(mercadoria?.disponivel).toBe("7");
    expect(mercadoria?.semEstoque).toBe(false);
  });

  it("nao deixa virgula pendurada no saldo inteiro", async () => {
    // REGRESSAO. O saldo era formatado com `toFixed(4)` seguido de
    // `replace(/0+$/, "")`, que apaga os zeros do FIM da string — em "7.0000"
    // eles vem depois do ponto, sobra "7." e a troca do separador produz
    // "7,". A tela mostrava "Saldo: 7," ao lado do preco. Este `expect` e
    // sobre a virgula, nao sobre o valor: o numero estava certo e aparecia
    // errado.
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "7" });

    const opcoes = await opcoesVenda(c.scope, c.branch.id);
    const mercadoria = opcoes.produtos.find((p) => p.value === `produto:${c.produtos.mercadoria.id}`);

    expect(mercadoria?.disponivel).toBe("7");
    expect(mercadoria?.disponivel).not.toContain(",");
  });

  it("mantem as casas decimais que o saldo realmente tem", async () => {
    // O outro lado do mesmo ajuste: cortar zeros e para nao mostrar
    // "7,5000", mas um saldo fracionario de verdade tem que aparecer.
    const c = await cenario();
    await createStockItem(c.tenant.id, c.branch.id, c.produtos.mercadoria.id, { quantity: "7.5" });

    const opcoes = await opcoesVenda(c.scope, c.branch.id);
    const mercadoria = opcoes.produtos.find((p) => p.value === `produto:${c.produtos.mercadoria.id}`);

    expect(mercadoria?.disponivel).toBe("7,5");
  });

  it("nunca devolve dois itens com o mesmo `value`", async () => {
    // `Product` e `Service` tem chaves separadas e idENTSOS: um id cru
    // repetiria entre as duas listas, e o `<select>` mostraria dois "Selecione"
    // iguais. O prefixo torna a chave unica por construcao.
    const c = await cenario();
    const opcoes = await opcoesVenda(c.scope, c.branch.id);

    const valores = opcoes.produtos.map((p) => p.value);
    expect(new Set(valores).size).toBe(valores.length);
  });

  it("esconde o item desativado de qualquer lado", async () => {
    const c = await cenario();
    await testDb().service.update({ where: { id: c.servicos.instalacao.id }, data: { active: false } });
    await testDb().product.update({ where: { id: c.produtos.mercadoria.id }, data: { active: false } });

    const opcoes = await opcoesVenda(c.scope, c.branch.id);
    expect(opcoes.produtos.find((p) => p.value === `servico:${c.servicos.instalacao.id}`)).toBeUndefined();
    expect(opcoes.produtos.find((p) => p.value === `produto:${c.produtos.mercadoria.id}`)).toBeUndefined();
  });
});

describe("gravacao do item de servico", () => {
  it("aceita `serviceId` de `Service` e grava o preco e o nome dele", async () => {
    // A prova de que a FK e para `Service`. Com a versao antiga, este `create`
    // seria recusado pelo Postgres com violacao de `service_items_service_id_fkey`
    // - que a tela mostrava como "erro interno" depois de a venda estar pronta.
    const c = await cenario();

    const item = await testDb().saleItem.create({
      data: {
        tenantId: c.tenant.id,
        saleId: (
          await testDb().sale.create({
            data: { tenantId: c.tenant.id, branchId: c.branch.id, number: "V-SRV-1", status: "RASCUNHO" },
          })
        ).id,
        serviceId: c.servicos.instalacao.id,
        description: "Instalacao",
        quantity: 2,
        unitPrice: 150,
        total: 300,
      },
      include: { service: { select: { name: true, unitPrice: true } } },
    });

    expect(item.serviceId).toBe(c.servicos.instalacao.id);
    expect(item.productId).toBeNull();
    expect(item.service?.name).toBe("Instalacao");
  });

  it("recusa um id de `Product` em `serviceId`", async () => {
    // O comportamento correto do banco, e a razao do form prefixar o valor. Um
    // id de `Service` em `productId` falha igual, pela FK de `product_id`.
    const c = await cenario();
    const venda = await testDb().sale.create({
      data: { tenantId: c.tenant.id, branchId: c.branch.id, number: "V-BAD-1", status: "RASCUNHO" },
    });

    await expect(
      testDb().saleItem.create({
        data: {
          tenantId: c.tenant.id,
          saleId: venda.id,
          // `mercadoria` e um `Product`. Este era EXATAMENTE o que a versao
          // antiga da tela gravava em `service_id`.
          serviceId: c.produtos.mercadoria.id,
          description: "Teclado",
          quantity: 1,
          unitPrice: 10,
          total: 10,
        },
      }),
    ).rejects.toThrow();
  });
});
