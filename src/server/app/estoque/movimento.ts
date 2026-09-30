import type { Prisma } from "@/generated/prisma/client";

import { AppError, ErrorCode } from "@/lib/errors";
import { toMoney, toQuantity } from "@/lib/money";
import type { TenantScope } from "@/server/db/tenant-scope";

/**
 * Movimentacao de estoque.
 *
 * Primeiro modulo do sistema a mexer em `stock_items` e `stock_movements`, e
 * por isso ele fixa as regras que compra, transferencia, inventario e devolucao
 * virao seguir.
 *
 * ## OS DOIS SALDOS QUE SE CONFUNDEM
 *
 * `stock_items` tem tres numeros de quantidade, e misturar eles e a origem
 * classica de oversell:
 *
 * | coluna | o que e | some do disponivel? |
 * |---|---|---|
 * | `quantity` | o que esta na prateleira | sim, e a base |
 * | `reservedQuantity` | esta na prateleira, mas prometido a um pedido | **sim** |
 * | `inTransitQuantity` | **ja saiu** desta filial, a caminho de outra | **nao** |
 *
 * `inTransitQuantity` NAO entra no calculo de disponivel porque o estoque ja
 * foi debitado de `quantity` na saida da transferencia. Subtrair os dois
 * contaria o mesmo item duas vezes e faria o sistema recusar uma venda com
 * produto na prateleira — o erro caro, porque a pessoa ve "sem estoque" e nao
 * descobre que ha.
 *
 * Disponivel = `quantity - reservedQuantity`.
 *
 * ## REGRAS DE CUSTO MEDIO
 *
 * - **Saida nao mexe no custo medio.** E o que faz `custo unitario * quantidade`
 *   ser o custo real da venda. Se a saida recalculasse a media, vender o saldo
 *   inteiro zeraria o custo e a margem apareceria como lucro puro.
 * - **Entrada reprecifica o saldo inteiro.** A media nova e
 *   `(valor do saldo + valor da entrada) / saldo em quantidade`, e nao a media
 *   antiga: e custo medio ponderado, o metodo que o contabil brasileiro aceita.
 *   `totalValue` acompanha, por ser derivado.
 * - `balanceAfter` e `averageCostAfter` ficam gravados no proprio movimento. Sao
 *   o extrato: reconstroem o saldo de qualquer dia sem recalcular nada, e e por
 *   eles que um inventario confere contra o historico.
 *
 * ## CONCORRENCIA
 *
 * Duas vendas do mesmo produto no mesmo instante leriam o mesmo saldo e as duas
 * confirmariam, deixando o estoque negativo. A leitura trava a linha com
 * `FOR UPDATE` e a gravacao acontece na mesma transacao: o segundo pedido ESPERA
 * e entao ve o saldo ja debitado.
 *
 * As linhas sao travadas em ordem de `product_id` (o proprio `ORDER BY` do
 * lock). Sem isso, duas vendas com os mesmos dois produtos em ordem inversa se
 * travam mutuamente e o banco aborta uma com deadlock.
 */

type ClienteTx = Pick<Prisma.TransactionClient, "stockItem" | "stockMovement" | "$queryRaw">;

export interface SaldoDeProduto {
  readonly stockItemId: string;
  readonly productId: string;
  readonly quantity: Prisma.Decimal;
  readonly reservedQuantity: Prisma.Decimal;
  /** `quantity - reservedQuantity`. */
  readonly available: Prisma.Decimal;
  readonly averageCost: Prisma.Decimal;
}

export interface ItemParaBaixa {
  /**
   * Posicao da linha na venda. E a chave de tudo aqui.
   *
   * A chave e o indice e nao o `productId` porque uma venda PODE ter o mesmo
   * produto em duas linhas (o mesmo teclado em duas cores, Vendor com
   * precificacao por faixa). Indexando por produto, a segunda linha colidiria
   * com a primeira no `@@unique([tenantId, idempotencyKey])` e a confirmacao
   * falharia com um erro de banco sem significado para a pessoa.
   */
  readonly indice: number;
  readonly productId: string;
  readonly description: string;
  readonly quantity: Prisma.Decimal;
}

export interface ResultadoDaBaixa {
  /** Custo unitario congelado no momento da baixa, por linha da venda. */
  readonly custoPorLinha: ReadonlyMap<number, Prisma.Decimal>;
  /** Saldo de cada produto depois da baixa, por linha. */
  readonly saldoPorLinha: ReadonlyMap<number, Prisma.Decimal>;
}

/** Falha de saldo, com o produto e o que faltava, para a tela nomear o item. */
export class EstoqueInsuficiente extends AppError {
  constructor(
    readonly productId: string,
    readonly descricao: string,
    readonly disponivel: Prisma.Decimal,
    readonly pedido: Prisma.Decimal,
  ) {
    super(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      `Estoque insuficiente para "${descricao}".`,
    );
  }
}

/**
 * Saldos de varios produtos, com as linhas travadas.
 *
 * PRECISA ESTAR DENTRO DE UMA TRANSACAO: fora dela o `FOR UPDATE` se solta no
 * fim da propria frase, e a leitura nao protege nada.
 *
 * Produto sem linha de estoque NAO volta no mapa, e isso e o esperado: produto
 * cadastrado nunca movimentado nao tem `stock_items`. A falta e tratada pelo
 * chamador como saldo zero, que e a leitura correta, e nao como erro de banco.
 */
export async function travarSaldos(
  db: ClienteTx,
  scope: TenantScope,
  entrada: { readonly branchId: string; readonly productIds: readonly string[] },
): Promise<Map<string, SaldoDeProduto>> {
  const ids = [...new Set(entrada.productIds)];
  if (ids.length === 0) return new Map();

  const linhas = await db.$queryRaw<
    {
      id: string;
      product_id: string;
      quantity: Prisma.Decimal;
      reserved_quantity: Prisma.Decimal;
      average_cost: Prisma.Decimal;
    }[]
  >`SELECT id, product_id, quantity, reserved_quantity, average_cost
      FROM stock_items
     WHERE tenant_id = ${scope.tenantId}
       AND branch_id = ${entrada.branchId}
       AND product_id = ANY(${ids}::text[])
     ORDER BY product_id
     FOR UPDATE`;

  const saldos = new Map<string, SaldoDeProduto>();
  for (const linha of linhas) {
    const quantity = toQuantity(linha.quantity);
    const reserved = toQuantity(linha.reserved_quantity);
    saldos.set(linha.product_id, {
      stockItemId: linha.id,
      productId: linha.product_id,
      quantity,
      reservedQuantity: reserved,
      available: toQuantity(quantity.minus(reserved)),
      averageCost: toQuantity(linha.average_cost),
    });
  }
  return saldos;
}

/**
 * Baixa o estoque de uma venda, validando o saldo.
 *
 * O `unitCost` devolvido e o que a action congela em `sale_items.unit_cost`.
 * Congelar e obrigatorio: gravar "o custo atual do produto" faria o custo da
 * venda mudar sozinho quando o preco de compra mudasse, e o relatorio de margem
 * de um mes fechado se reescreveria.
 */
export async function aplicarBaixaDeVenda(
  db: ClienteTx,
  scope: TenantScope,
  entrada: {
    readonly branchId: string;
    readonly saleId: string;
    readonly saleNumber: string;
    readonly itens: readonly ItemParaBaixa[];
    readonly performedById: string | null;
  },
): Promise<ResultadoDaBaixa> {
  const saldos = await travarSaldos(db, scope, {
    branchId: entrada.branchId,
    productIds: entrada.itens.map((i) => i.productId),
  });

  const custoPorLinha = new Map<number, Prisma.Decimal>();
  const saldoPorLinha = new Map<number, Prisma.Decimal>();
  const agora = new Date();

  // O MESMO PRODUTO EM DUAS LINHAS DA MESMA VENDA
  //
  // `saldos` foi lido UMA vez, com `FOR UPDATE`, e cada `productId` aparece
  // nele uma unica vez. Se a venda tem o mesmo produto duas vezes, as duas
  // linhas leem o MESMO objeto: a segunda calcula `quantity - qtd2` e grava
  // por cima do resultado da primeira, que era `quantity - qtd1`. O estoque
  // final ficaria `quantity - qtd2` em vez de `quantity - qtd1 - qtd2` — a
  // primeira linha baixada "volta" sozinha, e a venda de 3 unidades sai do
  // estoque por 1.
  //
  // Alem disso a checagem de saldo passaria: cada linha e comparada com o
  // disponivel INTEIRO, entao duas linhas de 6 com 10 em estoque aprovam as
  // duas — e o estoque vai para -2.
  //
  // A correcao e manter o saldo corrente em memoria e substituir a entrada do
  // mapa a cada baixa, para que a proxima linha do mesmo produto leia o que a
  // anterior deixou. O `stockItem.update` usa `quantity: novoSaldo`, que ja e
  // o acumulado; a gravacao poderia ser feita uma vez por produto ao fim, mas
  // ficar por linha mantem o `balanceAfter` de cada movimento correto — que e o
  // extrato, e vale mais do que uma escrita a menos.
  const corrente = new Map(saldos);

  // `for` e nao `forEach` porque o `throw` precisa interromper no meio; a
  // transacao inteira desfaz as linhas ja gravadas.
  for (const item of entrada.itens) {
    const saldo = corrente.get(item.productId);
    const disponivel = saldo?.available ?? toQuantity(0);
    const quantidade = toQuantity(item.quantity);

    if (quantidade.greaterThan(disponivel)) {
      throw new EstoqueInsuficiente(item.productId, item.description, disponivel, quantidade);
    }
    if (saldo === undefined) {
      // Sem `stock_items` nao ha linha para debitar. Chegar aqui e impossivel
      // depois do `throw` acima (quantidade > 0 sempre), mas o `undefined` no
      // tipo e melhor resolvido explicitamente do que com `!` no `update`.
      throw new AppError(ErrorCode.NOT_FOUND, "Item de estoque nao encontrado.");
    }

    const unitCost = saldo.averageCost;
    const novoSaldo = toQuantity(saldo.quantity).minus(quantidade);

    corrente.set(item.productId, {
      ...saldo,
      quantity: novoSaldo,
      available: toQuantity(novoSaldo.minus(saldo.reservedQuantity)),
    });

    await db.stockMovement.create({
      data: {
        tenantId: scope.tenantId,
        branchId: entrada.branchId,
        productId: item.productId,
        type: "SAIDA",
        origin: "VENDA",
        // Negativo por convencao do schema: positivo e entrada.
        quantity: quantidade.neg(),
        unitCost,
        totalValue: toMoney(quantidade.times(unitCost)),
        balanceAfter: novoSaldo,
        // Saida nao reprecifica: ver REGRAS DE CUSTO MEDIO.
        averageCostAfter: unitCost,
        documentType: "SALE",
        documentId: entrada.saleId,
        documentNumber: entrada.saleNumber,
        // Uma baixa por LINHA: um retry da confirmacao bate aqui e nao move o
        // estoque duas vezes. O indice no fim e o que permite o mesmo produto
        // em duas linhas.
        idempotencyKey: CHAVE_BAIXA.montar(entrada.saleId, item.indice),
        performedById: entrada.performedById,
      },
    });

    await db.stockItem.update({
      where: { id: saldo.stockItemId },
      data: { quantity: novoSaldo, lastMovementAt: agora },
    });

    custoPorLinha.set(item.indice, unitCost);
    saldoPorLinha.set(item.indice, novoSaldo);
  }

  return { custoPorLinha, saldoPorLinha };
}

/**
 * Estorno da baixa, para o cancelamento da venda.
 *
 * Entrada reprecifica o saldo (REGRAS DE CUSTO MEDIO), porque a devolucao traz
 * de volta um lote com o custo que ele tinha na saida — o `unitCost` gravado no
 * movimento original, e nao a media atual. Repor na media atual inflaria o
 * custo do saldo e apagaria a margem real de tudo que ja foi vendido.
 *
 * Os movimentos originais sao lidos do proprio extrato em vez de recalculados
 * a partir da venda: e o historico dizendo o que devolver, o que continua
 * valendo mesmo que a venda tenha sido confirmada e estornada em EPCs diferentes.
 */
export async function aplicarEstornoDeVenda(
  db: ClienteTx,
  scope: TenantScope,
  entrada: {
    readonly branchId: string;
    readonly saleId: string;
    readonly saleNumber: string;
    readonly performedById: string | null;
  },
): Promise<void> {
  const originais = await db.stockMovement.findMany({
    where: {
      tenantId: scope.tenantId,
      branchId: entrada.branchId,
      documentId: entrada.saleId,
      type: "SAIDA",
      origin: "VENDA",
    },
    orderBy: { productId: "asc" },
  });
  if (originais.length === 0) return;

  // Locks na mesma ordem da baixa, para o estorno nao inverter um deadlock.
  await travarSaldos(db, scope, {
    branchId: entrada.branchId,
    productIds: originais.map((m) => m.productId),
  });

  const agora = new Date();
  for (const original of originais) {
    // O indice do original fecha a chave: o estorno da linha 0 nao pode colidir
    // com o estorno da linha 1 do mesmo produto.
    const indice = CHAVE_BAIXA.indice(original.idempotencyKey);
    if (indice === null) {
      throw new AppError(
        ErrorCode.BUSINESS_RULE_VIOLATION,
        "Baixa de estoque com chave de idempotencia invalida. Venda nao pode ser cancelada.",
      );
    }
    const chave = CHAVE_BAIXA.montarEstorno(entrada.saleId, indice);

    const jaEstornado = await db.stockMovement.findFirst({
      where: { tenantId: scope.tenantId, idempotencyKey: chave },
      select: { id: true },
    });
    if (jaEstornado !== null) continue;

    const item = await db.stockItem.findFirst({
      where: {
        tenantId: scope.tenantId,
        branchId: entrada.branchId,
        productId: original.productId,
      },
    });
    if (item === null) continue;

    const quantidade = toQuantity(original.quantity).abs();
    const unitCost = toQuantity(original.unitCost);
    const novoSaldo = toQuantity(item.quantity).plus(quantidade);

    const valorAtual = toMoney(toQuantity(item.quantity).times(toQuantity(item.averageCost)));
    const valorEntrada = toMoney(quantidade.times(unitCost));
    const mediaNova = novoSaldo.isZero()
      ? toQuantity(0)
      : toQuantity(toMoney(valorAtual.plus(valorEntrada)).dividedBy(novoSaldo));

    await db.stockMovement.create({
      data: {
        tenantId: scope.tenantId,
        branchId: entrada.branchId,
        productId: original.productId,
        type: "CANCELAMENTO",
        origin: "CANCELAMENTO",
        quantity: quantidade,
        unitCost,
        totalValue: valorEntrada,
        balanceAfter: novoSaldo,
        averageCostAfter: mediaNova,
        documentType: "SALE",
        documentId: entrada.saleId,
        documentNumber: entrada.saleNumber,
        idempotencyKey: chave,
        performedById: entrada.performedById,
        notes: `Estorno da venda ${entrada.saleNumber}.`,
      },
    });

    await db.stockItem.update({
      where: { id: item.id },
      data: {
        quantity: novoSaldo,
        averageCost: mediaNova,
        totalValue: toMoney(novoSaldo.times(mediaNova)),
        lastMovementAt: agora,
      },
    });
  }
}

/** `true` quando a falha foi de saldo, e nao outra coisa. */
export function ehEstoqueInsuficiente(erro: unknown): erro is EstoqueInsuficiente {
  return erro instanceof EstoqueInsuficiente;
}

/**
 * As QUATRO SEGMENTOS da chave de baixa, para o teste conferir o parse.
 *
 * A chave esta escrita em `aplicarBaixaDeVenda` e lida em `indiceDaChave`, e o
 * parse ja falhou uma vez por conta de contagem de segmentos. Exportar a forma
 * como um unico lugar elimina a segunda copia do formato — a que existe dentro
 * do teste, que e a que passa a divergir quando o formato muda.
 */
export const CHAVE_BAIXA = {
  /** `venda:<saleId>:baixa:<indice>`. */
  montar(saleId: string, indice: number): string {
    return `venda:${saleId}:baixa:${indice}`;
  },
  /** `venda:<saleId>:estorno:<indice>`. */
  montarEstorno(saleId: string, indice: number): string {
    return `venda:${saleId}:estorno:${indice}`;
  },
  /** O indice da linha, ou `null` se a chave nao for de baixa. */
  indice(chave: string | null): number | null {
    return indiceDaChave(chave);
  },
};

/**
 * O indice da linha, lido de volta da chave de idempotencia da baixa.
 *
 * A chave ja foi gravada com este formato, entao o parse e so uma operacao
 * invertida. Ainda assim, uma chave fora do formato e IMPOSSIVEL de tratar
 * adiante — a linha perderia o vinculo com a baixa original e o estoque
 * entraria duas vezes. Por isso devolve `null` e deixa o chamador recusar, em
 * vez de assumir um indice.
 */
function indiceDaChave(chave: string | null): number | null {
  const partes = chave?.split(":") ?? [];
  // QUATRO segmentos, nao cinco: `venda:<saleId>:baixa:<indice>`. A confusao
  // entre o numero de segmentos e o indice do `saleId` era o bug — o `saleId`
  // e um `cuid()`, que nao contem `:`. Com `length !== 5` o `estorno` de
  // TODA venda falhava, e o erro era "chave de idempotencia invalida", que
  // nao sugere nem perto de "contei os segmentos errado".
  if (partes.length !== 4 || partes[0] !== "venda" || partes[2] !== "baixa") return null;
  const indice = Number(partes[3]);
  return Number.isInteger(indice) ? indice : null;
}
