/**
 * O corpo da confirmacao, separado da Server Action para o teste de integracao.
 *
 * `confirmarVenda` monta o contexto (sessao, RBAC, `FormData`) e repassa para
 * ca; tudo o que a confirmacao faz - estoque, custo, conta a receber, parcelas
 * e recebimento imediato - roda nesta funcao, dentro da MESMA transacao. O
 * teste chama esta funcao com um escopo e o banco de teste, e percorre o
 * mesmo caminho que a action percorre na producao, sem depender de cookie.
 */

import { AppError, ErrorCode } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma/client";
import { toDecimal, toMoney, toQuantity } from "@/lib/money";
import { aplicarBaixaDeVenda } from "@/server/app/estoque/movimento";
import { gerarParcelas, validarTermosSuportados } from "@/server/app/vendas/calculo";
import { MODELOS, proximoNumero } from "@/server/db/numero";
import { withTenantDb } from "@/server/db/scoped";
import type { TenantScope } from "@/server/db/tenant-scope";

/** Termos de pagamento da venda, ou a vista quando nao ha nenhum escolhido. */
interface TermosDaVenda {
  readonly termos: {
    readonly type: string;
    readonly installmentCount: number;
    readonly intervalDays: number;
    readonly fixedDay: number | null;
    readonly interestPercentMonthly: ReturnType<typeof toDecimal>;
  };
  /** Desconto a vista em dinheiro, ja convertido de centavos. */
  readonly descontoVista: ReturnType<typeof toMoney>;
}

async function carregarTermos(scope: TenantScope, paymentTermsId: string | null): Promise<TermosDaVenda> {
  if (paymentTermsId === null) {
    return {
      termos: {
        type: "A_VISTA",
        installmentCount: 1,
        intervalDays: 0,
        fixedDay: null,
        interestPercentMonthly: toDecimal(0),
      },
      descontoVista: toMoney(0),
    };
  }

  const encontrado = await withTenantDb(scope, async (db) =>
    db.paymentTerms.findFirst({ where: { id: paymentTermsId, deletedAt: null, active: true } }),
  );
  if (!encontrado) throw new AppError(ErrorCode.VALIDATION_FAILED, "Condicao de pagamento nao encontrada.");

  const termos = {
    type: encontrado.type as string,
    installmentCount: encontrado.installmentCount,
    intervalDays: encontrado.intervalDays,
    fixedDay: encontrado.fixedDay,
    interestPercentMonthly: toDecimal(encontrado.interestPercentMonthly),
  };
  // A rejeicao de juros e de prazo customizado acontece AQUI, com o valor real
  // do termo. Sem esta chamada, um termo com juros entraria na divisao simples e
  // geraria parcelas que somam menos que o total.
  validarTermosSuportados(termos);

  // O desconto a vista so vale para a vista.
  //
  // `cashDiscountCents` esta no termo, e nao na venda: quem cadastrou "3x sem
  // juros, 2% a vista" wrote a condicao que so se aplica quando o cliente
  // paga a vista. Aplicar os 2% em uma venda de 3 parcelas daria desconto que
  // nao foi concedido e um desconto que so aparece se a venda virar parcela,
  // que e o oposto do combinado. A regra e por TIPO do termo, e nao por "o
  // campo veio preenchido".
  const descontoVista =
    encontrado.type === "A_VISTA"
      ? toMoney(toDecimal(encontrado.cashDiscountCents).dividedBy(100))
      : toMoney(0);

  return { termos, descontoVista };
}

/**
 * Quantas parcelas do recebivel ja estao pagas.
 *
 * E o que decide se a conta a receber fecha como PAGO ou fica PARCIAL depois
 * de um recebimento parcial. Contar em vez de assumir "pago" porque uma venda
 * parcelada recebida so na primeira parcela NAO esta quitada, e marcar como
 * PAGO sumiria do fluxo de caixa um valor que a empresa ainda deve.
 */
export async function contarParcelas(
  db: Pick<Prisma.TransactionClient, "installment">,
  tenantId: string,
  recebivelId: string,
): Promise<number> {
  return db.installment.count({
    where: { tenantId, accountsReceivableId: recebivelId, status: "PAGO" },
  });
}

/**
 * Os dados que a confirmacao precisa do contexto, separados do `ctx` inteiro
 * para a funcao nao depender de sessao.
 */
export interface ParametrosConfirmacaoVenda {
  readonly scope: TenantScope;
  readonly tenantId: string;
  readonly userId: string | null;
  readonly vendaId: string;
  readonly receberAgora: boolean;
  readonly formaPagamento: string | null;
}

/**
 * Confirma a venda: baixa estoque de MERCADORIA, congela custo, gera a conta
 * a receber com as parcelas e, quando pedido, registra o recebimento imediato.
 *
 * A ordem dentro da transacao importa em um ponto: o estoque e debitado ANTES
 * do `total` ser gravado, porque a checagem de saldo vem da linha de
 * `stock_items` ja travada. Inverter deixaria o `total` gravado se a baixa
 * falhasse.
 */
export async function confirmarVendaEmTransacao(
  tx: Prisma.TransactionClient,
  parametros: ParametrosConfirmacaoVenda,
): Promise<void> {
  const venda = await tx.sale.findFirst({
    where: { id: parametros.vendaId, deletedAt: null },
    // `product.type` vem junto porque a baixa e decidida AQUI, e nao pela
    // tela: um `Product` de `type: SERVICO` e `COMPOSTO` nao movimenta
    // estoque, e o `productId` dele esta preenchido. Sem o `type`, o
    // filtro abaixo baixaria estoque de um item que nao tem saldo — e a
    // venda seria recusada por um saldo que ninguem gastou.
    include: { items: { include: { product: { select: { type: true } } }, orderBy: { sortOrder: "asc" } } },
  });
  if (!venda) throw new AppError(ErrorCode.NOT_FOUND, "Venda nao encontrada.");

  if (venda.status !== "RASCUNHO" && venda.status !== "PENDENTE") {
    throw new AppError(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      "Esta venda ja foi confirmada ou encerrada.",
    );
  }
  if (venda.items.length === 0) {
    throw new AppError(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      "A venda nao tem itens. Edite o rascunho e adicione itens.",
    );
  }

  // --- 1. Estoque e custo congelado -------------------------------
  // So `MERCADORIA` baixa. Um `Product` de `type: SERVICO`/`COMPOSTO`
  // continua com `productId` gravado — ele e um item de NFS-e do
  // catalogo de produtos, nao um `Service` — mas nao tem `stock_items`,
  // e debitar por ter `productId` seria recusar a venda por falta de um
  // saldo que nunca existiu. O item nao baixado recebe custo 0 abaixo,
  // e `custo.isZero()` e o que a tela le como "calculado na confirmacao".
  const comProduto = venda.items.filter(
    (item) => item.productId !== null && item.product?.type === "MERCADORIA",
  );
  const baixa = await aplicarBaixaDeVenda(tx, parametros.scope, {
    branchId: venda.branchId,
    saleId: venda.id,
    saleNumber: venda.number,
    itens: comProduto.map((item) => ({
      indice: item.sortOrder,
      productId: item.productId as string,
      description: item.description,
      quantity: toQuantity(item.quantity),
    })),
    performedById: parametros.userId,
  });

  let custoTotal = toMoney(0);
  for (const item of venda.items) {
    // Linha sem `productId` (servico) ou com produto que nao baixou
    // (SERVICO/COMPOSTO) recebe custo 0 — e a leitura correta: o item nao
    // tem custo de estoque para congelar.
    const unitCost =
      item.productId === null || item.product?.type !== "MERCADORIA"
        ? toQuantity(0)
        : (baixa.custoPorLinha.get(item.sortOrder) ?? toQuantity(0));
    const costAmount = toMoney(toQuantity(item.quantity).times(unitCost));
    custoTotal = toMoney(custoTotal.plus(costAmount));

    await tx.saleItem.update({
      where: { id: item.id },
      data: { unitCost, costAmount },
    });
  }

  // --- 2. Totais da venda -----------------------------------------
  const total = toMoney(venda.total);
  await tx.sale.update({
    where: { id: venda.id },
    data: {
      status: "CONFIRMADA",
      soldAt: venda.soldAt ?? new Date(),
      costAmount: custoTotal,
      // `profitAmount` e a coluna do schema: total - tributos - custo.
      profitAmount: toMoney(total.minus(toMoney(venda.taxAmount)).minus(custoTotal)),
    },
  });

  // --- 3. Conta a receber e parcelas ------------------------------
  const termos = await carregarTermos(parametros.scope, venda.paymentTermsId);
  // Sem condicao de pagamento escolhida, a regra e a vista: e o que uma
  // venda sem prazo significa em qualquer balcao, e inventar 30 dias
  // seria criar um prazo que ninguem combinou.
  const descontoVista = termos.descontoVista;
  const aReceber = toMoney(total.minus(descontoVista));
  // AS PARCELAS SOMAM `aReceber`, NAO `total`.
  //
  // A ordem das duas linhas e o ponto. Calcular as parcelas sobre `total` e
  // so depois descontar o dinheiro deixava a conta a receber em
  // `aReceber` e as parcelas somando o valor cheio: uma venda de 1.000 com
  // 100 de desconto a vista gerava parcelas de 1.000 numa conta de 900.
  // A diferenca de 100 nao tinha aonde ser cobrada, e `remainingAmount`
  // zerava sem a parcela 1 estar paga.
  const parcelas = gerarParcelas(aReceber, termos.termos, venda.soldAt ?? new Date());

  const numeroRecebivel = await proximoNumero(tx, parametros.scope, {
    model: MODELOS.contaReceber,
    branchId: venda.branchId,
  });

  const recebivel = await tx.accountsReceivable.create({
    data: {
      tenantId: parametros.tenantId,
      branchId: venda.branchId,
      customerId: venda.customerId,
      saleId: venda.id,
      paymentTermsId: venda.paymentTermsId,
      number: numeroRecebivel,
      kind: "CONTAS_A_RECEBER",
      status: "PENDENTE",
      originAmount: total,
      discountAmount: descontoVista,
      totalAmount: aReceber,
      paidAmount: toMoney(0),
      remainingAmount: aReceber,
      // Vencimento e o da PRIMEIRA parcela. Uma conta a receber com
      // parcelas tem vencimento na primeira: e o que o sistema de
      // cobranca olha para dizer "vence hoje".
      dueDate: parcelas[0]?.dueDate ?? (venda.soldAt ?? new Date()),
      competenceDate: venda.soldAt ?? new Date(),
      documentType: "SALE",
      documentId: venda.id,
      documentNumber: venda.number,
      documentDate: venda.soldAt ?? new Date(),
    },
  });

  for (const parcela of parcelas) {
    await tx.installment.create({
      data: {
        tenantId: parametros.tenantId,
        branchId: venda.branchId,
        accountsReceivableId: recebivel.id,
        paymentMethodId: parametros.formaPagamento ?? venda.paymentMethodId,
        number: parcela.numero,
        total: parcela.total,
        status: "PENDENTE",
        // O valor da parcela ja vem dividido com o resto de centavo
        // resolvido em `splitAmount`; somar os valores aqui daria o total
        // exato, e nao o total arredondado para baixo.
        amount: parcela.amount,
        paidAmount: toMoney(0),
        remainingAmount: parcela.amount,
        dueDate: parcela.dueDate,
      },
    });
  }

  // --- 4. Recebimento imediato, quando pedido ---------------------
  if (parametros.receberAgora && parametros.formaPagamento !== null) {
    const primeira = parcelas[0];
    if (primeira) {
      await tx.paymentTransaction.create({
        data: {
          tenantId: parametros.tenantId,
          saleId: venda.id,
          paymentMethodId: parametros.formaPagamento,
          installmentNumber: primeira.numero,
          type: "APROVADA",
          amount: primeira.amount,
          changeAmount: toMoney(0),
          overpaymentAmount: toMoney(0),
          paidAt: new Date(),
        },
      });

      await tx.installment.updateMany({
        where: { tenantId: parametros.tenantId, accountsReceivableId: recebivel.id, number: primeira.numero },
        data: {
          status: "PAGO",
          paidAmount: primeira.amount,
          remainingAmount: toMoney(0),
          paidAt: new Date(),
        },
      });

      const pago = toMoney(primeira.amount);
      const restante = toMoney(aReceber.minus(pago));
      const statusParcelas = await contarParcelas(tx, parametros.tenantId, recebivel.id);

      await tx.accountsReceivable.update({
        where: { id: recebivel.id },
        data: {
          status: statusParcelas === parcelas.length ? "PAGO" : restante.isZero() ? "PAGO" : "PARCIAL",
          paidAmount: pago,
          remainingAmount: restante,
          settledDate: restante.isZero() ? new Date() : null,
        },
      });

      await tx.sale.update({
        where: { id: venda.id },
        data: { paidAmount: pago },
      });
    }
  }

  log("vendas").info(
    { vendaId: venda.id, numero: venda.number, parcelas: parcelas.length },
    "venda confirmada",
  );
}