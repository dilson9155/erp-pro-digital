import type { Prisma } from "@/generated/prisma/client";
import type { Sale } from "@/generated/prisma/client";
import type Decimal from "decimal.js";

import { withTenantDb } from "@/server/db/scoped";
import type { TenantScope } from "@/server/db/tenant-scope";
import { somenteDigitos } from "@/lib/documento";
import { toDecimal } from "@/lib/money";
import { SaleStatus } from "@/generated/prisma/enums";
import { ROTULO_CANAL, ROTULO_TIPO } from "@/server/app/vendas/rotulos";

/**
 * Consulta de vendas.
 *
 * ESTA CONSULTA SO LE. NAO HA AINDA CRIACAO DE VENDA, E ISSO E DECISAO, NAO
 * FALTA.
 *
 * O `Sale` so pode ser gravado com o resto do ciclo montado ao mesmo tempo:
 * numero sequencial, itens com custo congelado, baixa de estoque em
 * `StockMovement`, contas a receber com parcelas e, quando houver, nota fiscal.
 * Metade disso nao existe ainda no codigo. Criar a venda sem a baixa de estoque
 * produziria venda com lucro inflado e saldo de estoque mentiroso, e o erro
 * apareceria no fechamento, quando ja nao da para saber de onde veio.
 *
 * Por isso o modulo comeca pela leitura: ela nao depende de nenhuma das
 * decisoes pendentes, e establish o formato que os outros modulos vao
 * consultar. Ver `vendas/rotulos.ts` para o porque de os rotulos viverem aqui.
 *
 * A DIFERENCA ESTRUTURAL EM RELACAO AOS CADASTROS
 *
 * 1. A ORDENACAO E CRONOLOGICA, E NAO POR NOME. Cliente e produto sao listas de
 *    consulta por nome, e a ordem alfabetica e estavel. Venda e documento: quem
 *    abre a tela quer "o mais recente", e a ordem alfabetica colocaria a venda
 *    0001 antes da 0999, com a pessoa rolando a lista para achar o movimento de
 *    ontem. O `@@index([tenantId, status, soldAt])` existe para esta ordem.
 *
 * 2. NAO EXISTE "MOSTRAR INATIVAS". Cliente e produto tem a coluna `active`, e
 *    esconder inativos e um filtro de leitura legitimo. Venda nao tem `active`:
 *    tem `status`, e uma venda cancelada e um fato economico, nao um registro
 *    obsoleto. Esconder venda cancelada da lista faz o total da tela deixar de
 *    fechar com o extrato do banco. O controle certo aqui e o filtro de
 *    situacao, que mostra todas por padrao.
 *
 * 3. O SALDO E CALCULADO AQUI, E O schema NAO O GUARDA. `Sale` tem `total` e
 *    `paidAmount`, mas nao tem "quanto falta": o dinheiro que falta e
 *    propriedade do financeiro, que o mantem em `AccountsReceivable` e
 *    `Installment`. Ver `saldoDaVenda` para por que a tela mostra os dois
 *    numeros e nao um.
 */

export const TAMANHO_PAGINA = 50;

/** Valor do filtro de situacao que significa "sem filtro". */
export const SITUACAO_TODAS = "todas";

/** Linha da listagem: o minimo para renderizar a tabela. */
export interface VendaListagem {
  readonly id: string;
  readonly numero: string;
  readonly serie: string | null;
  readonly status: Sale["status"];
  readonly tipo: Sale["type"];
  readonly canal: Sale["channel"];
  readonly clienteNome: string | null;
  readonly vendedorNome: string | null;
  readonly soldAt: Date | null;
  readonly total: Sale["total"];
  readonly recebido: Sale["paidAmount"];
  /** `total - paidAmount`, em Decimal. Vem do calculo, nao de coluna. */
  readonly saldo: Decimal;
  readonly quantidadeItens: number;
}

export interface ListagemVendas {
  readonly vendas: readonly VendaListagem[];
  readonly total: number;
  readonly pagina: number;
  readonly totalPaginas: number;
  readonly busca: string;
  readonly situacao: string;
  readonly de: string;
  readonly ate: string;
}

/** O filtro aceita "todas" e os valores de `SaleStatus`. */
export function ehSituacao(valor: string): valor is SaleStatus | typeof SITUACAO_TODAS {
  return valor === SITUACAO_TODAS || (Object.values(SaleStatus) as string[]).includes(valor);
}

export function filtroDeSituacao(situacao: string): Prisma.SaleWhereInput {
  return situacao === SITUACAO_TODAS ? {} : { status: situacao as SaleStatus };
}

/**
 * Filtro de periodo sobre `soldAt`.
 *
 * A VENDA NAO TEM DATA DE VENDA: e `soldAt`, e ela e NULA ENQUANTO A VENDA E
 * RASCUNHO. Entao aplicar periodo e o mesmo que excluir rascunho, e isso e
 * coerente: rascunho nao tem quando aconteceu. Quem filtra por mes quer o que
 * foi vendido no mes, e o rascunho ainda pode mudar de valor ou de cliente.
 *
 * O `ate` usa `lt` do dia SEGUINTE, e nao `lte` do proprio dia. `lte` com a
 * meia-noite do dia escolhido tiraria da lista tudo o que foi vendido depois da
 * meia-noite — ou seja, o dia inteiro que a pessoa pediu para ver. E um erro que
 * so aparece no ultimo dia do filtro, que e o dia que as pessoas conferem.
 *
 * As bordas sao em UTC para concordar com a conversao de `dataNascimento` e dos
 * demais campos de data, que ja gravam `T12:00:00.000Z`.
 */
export function filtroDePeriodo(de: string, ate: string): Prisma.SaleWhereInput {
  if (de === "" && ate === "") return {};

  const condicao: Prisma.DateTimeFilter = {};
  if (de !== "") condicao.gte = new Date(`${de}T00:00:00.000Z`);
  if (ate !== "") condicao.lt = new Date(`${fimDoDia(ate)}T00:00:00.000Z`);

  return { soldAt: condicao };
}

/** Proximo dia em `YYYY-MM-DD`, para transformar "ate" em limite exclusivo. */
function fimDoDia(data: string): string {
  const dia = new Date(`${data}T00:00:00.000Z`);
  dia.setUTCDate(dia.getUTCDate() + 1);
  return dia.toISOString().slice(0, 10);
}

/**
 * `where` de busca.
 *
 * O numero da venda e o termo mais frequente, e o nome do cliente o segundo.
 * O documento do cliente entra tambem, porque quem esta na frente do balcao tem
 * o CNPJ da mao e nao o nome: "venda do 11.222.333/0001-30" e a forma real de
 * procurar uma venda antiga.
 */
export function filtroBusca(busca: string): Prisma.SaleWhereInput {
  const termo = busca.trim();
  if (termo === "") return {};

  const condicoes: Prisma.SaleWhereInput[] = [
    { number: { contains: termo, mode: "insensitive" } },
    { customer: { name: { contains: termo, mode: "insensitive" } } },
    { seller: { name: { contains: termo, mode: "insensitive" } } },
  ];

  const digitos = somenteDigitos(termo);
  if (digitos !== "") {
    condicoes.push(
      { customer: { cpf: { contains: digitos } } },
      { customer: { cnpj: { contains: digitos } } },
    );
  }

  return { OR: condicoes };
}

export async function listarVendas(
  scope: TenantScope,
  entrada: {
    busca?: string;
    pagina?: number;
    situacao?: string;
    de?: string;
    ate?: string;
  } = {},
): Promise<ListagemVendas> {
  const busca = entrada.busca?.trim() ?? "";
  const pagina = Math.max(1, entrada.pagina ?? 1);
  const situacao = entrada.situacao ?? SITUACAO_TODAS;
  const de = entrada.de ?? "";
  const ate = entrada.ate ?? "";

  const where: Prisma.SaleWhereInput = {
    deletedAt: null,
    ...filtroDeSituacao(situacao),
    ...filtroDePeriodo(de, ate),
    ...filtroBusca(busca),
  };

  return withTenantDb(scope, async (db) => {
    const [vendas, total] = await Promise.all([
      db.sale.findMany({
        where,
        // Cronologica, e nao alfabetica. Ver o cabecalho do arquivo. O `soldAt`
        // vem primeiro porque e a data que a pessoa esta procurando, e o
        // `createdAt` desempata as vendas do mesmo dia.
        orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
        skip: (pagina - 1) * TAMANHO_PAGINA,
        take: TAMANHO_PAGINA,
        select: {
          id: true,
          number: true,
          series: true,
          status: true,
          type: true,
          channel: true,
          soldAt: true,
          total: true,
          paidAmount: true,
          customer: { select: { name: true } },
          seller: { select: { name: true } },
          _count: { select: { items: true } },
        },
      }),
      db.sale.count({ where }),
    ]);

    return {
      vendas: vendas.map((v) => ({
        id: v.id,
        numero: v.number,
        serie: v.series,
        status: v.status,
        tipo: v.type,
        canal: v.channel,
        clienteNome: v.customer?.name ?? null,
        vendedorNome: v.seller?.name ?? null,
        soldAt: v.soldAt,
        total: v.total,
        recebido: v.paidAmount,
        saldo: saldoDaVenda(v.total, v.paidAmount),
        quantidadeItens: v._count.items,
      })),
      total,
      pagina,
      totalPaginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)),
      busca,
      situacao,
      de,
      ate,
    };
  });
}

/**
 * Quanto ainda falta receber da venda.
 *
 * `total - paidAmount` em Decimal, e nao em `number`. Os dois campos sao
 * `Decimal(14,2)` e a diferenca e dinheiro: subtrair em `number` reintroduz a
 * erro de ponto flutuante que `src/lib/money.ts` existe para evitar, e o erro
 * apareceria como "falta 0,01" numa venda de mil reais, que e exatamente o tipo
 * de diferença que faz a pessoa desconfiar do sistema inteiro.
 */
export function saldoDaVenda(total: Decimal.Value, recebido: Decimal.Value): Decimal {
  return toDecimal(total).minus(toDecimal(recebido));
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

/**
 * Item da venda, ja com o nome do produto resolvido.
 *
 * `description` e o que foi gravado no momento da venda, e `product.name` e o
 * nome ATUAL do produto. Os dois aparecem, e a distincao importa: o
 * `description` e o congelado (item-description na nota), e se o produto foi
 * renomeado depois, mostrar so o nome novo faria a nota antiga parecer
 * incorreta. Com os dois, a pessoa ve o que foi vendido e o que o produto se
 * chama hoje.
 */
export interface ItemVendaDetalhe {
  readonly id: string;
  readonly descricao: string;
  readonly produtoNome: string | null;
  readonly produtoSku: string | null;
  readonly quantidade: Decimal;
  readonly precoUnitario: Decimal;
  readonly desconto: Decimal;
  readonly total: Decimal;
  /** Custo unitario congelado no momento da venda. */
  readonly custoUnitario: Decimal;
  readonly custoTotal: Decimal;
  readonly devolvido: Decimal;
  readonly tributado: boolean;
}

export interface PagamentoVenda {
  readonly id: string;
  readonly parcela: number;
  readonly forma: string | null;
  readonly tipo: string;
  readonly valor: Decimal;
  readonly pagoEm: Date | null;
  readonly bandeira: string | null;
  readonly ultimosDigitos: string | null;
  readonly motivoFalha: string | null;
}

export interface ParcelaConta {
  readonly numero: number;
  readonly situacao: string;
  readonly vencimento: Date;
  readonly valor: Decimal;
  readonly pago: Decimal;
  readonly restante: Decimal;
  readonly pagoEm: Date | null;
}

export interface ContaReceberDetalhe {
  readonly id: string;
  readonly numero: string;
  readonly situacao: string;
  readonly vencimento: Date;
  readonly total: Decimal;
  readonly pago: Decimal;
  readonly restante: Decimal;
  readonly parcelas: readonly ParcelaConta[];
}

export interface NotaVenda {
  readonly id: string;
  readonly numero: number;
  readonly serie: string | null;
  readonly situacao: string;
  readonly modelo: string;
  readonly direcao: string;
  readonly autorizadaEm: Date | null;
}

export interface VendaDetalhe {
  readonly id: string;
  readonly numero: string;
  readonly serie: string | null;
  readonly status: Sale["status"];
  readonly tipo: Sale["type"];
  readonly canal: Sale["channel"];
  readonly finalidade: string | null;
  readonly clienteId: string | null;
  readonly clienteNome: string | null;
  readonly vendedorNome: string | null;
  readonly filialId: string;
  readonly filialNome: string;
  readonly formaPagamento: string | null;
  readonly condicaoPagamento: string | null;
  readonly subtotal: Decimal;
  readonly desconto: Decimal;
  readonly frete: Decimal;
  readonly tributos: Decimal;
  readonly retencao: Decimal;
  readonly total: Decimal;
  readonly recebido: Decimal;
  readonly custo: Decimal;
  readonly lucro: Decimal;
  readonly margem: Decimal | null;
  readonly soldAt: Date | null;
  readonly entregueEm: Date | null;
  readonly canceladaEm: Date | null;
  readonly motivoCancelamento: string | null;
  readonly observacoes: string | null;
  readonly observacoesInternas: string | null;
  readonly criadaEm: Date;
  readonly criadaPor: string | null;
  readonly itens: readonly ItemVendaDetalhe[];
  readonly pagamentos: readonly PagamentoVenda[];
  readonly contas: readonly ContaReceberDetalhe[];
  readonly notas: readonly NotaVenda[];
}

/**
 * Venda inteira para a tela de detalhe.
 *
 * O PONTO QUE MERECE ATENCAO NESTA FUNCAO
 *
 * `Sale.paidAmount` e a soma dos `PaymentTransaction` aprovados. O dinheiro que
 * falta esta em `AccountsReceivable.remainingAmount`, dividido em
 * `Installment`. Os dois numeros respondem a perguntas diferentes e, por um
 * tempo, NAO CONFEREM entre si:
 *
 * - Se o cliente pagou adiantamento antes de a venda ser faturada, ha
 *   `PaymentTransaction` com `invoiceId` nulo e nenhuma parcela existindo. A
 *   venda aparece com `saldoDaVenda` menor, e a lista de contas a receber nao tem
 *   parcela nenhuma para abatesse.
 * - Se a venda foi faturada e o financeiro quitou a parcela pelo fluxo de caixa,
 *   a parcela esta paga e o `paidAmount` da venda sobe se o recebimento foi
 *   lancado como `PaymentTransaction`.
 *
 * Tratar os dois como o mesmo numero, e mostrar um so, esconde exatamente o
 * caso que a pessoa abriu a tela para investigar: "por que esta venda diz que
 * falta R$ 300 e o financeiro diz que esta quitada". Por isso a tela mostra o
 * saldo da venda E as contas a receber, separadas, e nao soma um com o outro.
 */
export async function buscarVenda(scope: TenantScope, id: string): Promise<VendaDetalhe | null> {
  return withTenantDb(scope, async (db) => {
    const venda = await db.sale.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        number: true,
        series: true,
        status: true,
        type: true,
        channel: true,
        purpose: true,
        subtotal: true,
        discountAmount: true,
        shippingAmount: true,
        taxAmount: true,
        retentionAmount: true,
        total: true,
        paidAmount: true,
        costAmount: true,
        profitAmount: true,
        soldAt: true,
        deliveredAt: true,
        cancelledAt: true,
        cancellationReason: true,
        notes: true,
        internalNotes: true,
        createdAt: true,
        // `branchId` alem do nome: a tela de detalhe usa a filial DA VENDA para
        // ler o saldo dos produtos, e nao a filial ativa do contexto. Sao a
        // mesma em 99% dos casos, e a venda aberta de outra filial e exatamente
        // o caso em que a diferenca importa.
        branchId: true,
        customer: { select: { id: true, name: true } },
        seller: { select: { name: true } },
        createdBy: { select: { name: true } },
        branch: { select: { name: true } },
        paymentMethod: { select: { name: true } },
        paymentTerms: { select: { name: true } },
        items: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            description: true,
            quantity: true,
            unitPrice: true,
            discountAmount: true,
            total: true,
            unitCost: true,
            costAmount: true,
            returnedQuantity: true,
            taxAmount: true,
            product: { select: { name: true, sku: true } },
          },
        },
        payments: {
          orderBy: [{ installmentNumber: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            installmentNumber: true,
            type: true,
            amount: true,
            paidAt: true,
            cardBrand: true,
            cardLastFour: true,
            failureReason: true,
            paymentMethod: { select: { name: true } },
          },
        },
        accountsReceivable: {
          orderBy: { dueDate: "asc" },
          select: {
            id: true,
            number: true,
            status: true,
            dueDate: true,
            totalAmount: true,
            paidAmount: true,
            remainingAmount: true,
            installments: {
              orderBy: { number: "asc" },
              select: {
                number: true,
                status: true,
                dueDate: true,
                amount: true,
                paidAmount: true,
                remainingAmount: true,
                paidAt: true,
              },
            },
          },
        },
        invoices: {
          orderBy: { authorizedAt: "desc" },
          select: {
            id: true,
            number: true,
            series: true,
            status: true,
            model: true,
            direction: true,
            authorizedAt: true,
          },
        },
      },
    });

    if (venda === null) return null;

    // Margem em percentual so faz sentido com custo conhecido. Venda de rascunho
    // nao tem custo congelado ainda, e exibir "0%" seria afirmar que a venda deu
    // zero de margem, que e uma afirmacao economica falsa. Sem custo, a margem
    // e `null` e a tela esconde o numero em vez de mostrar 0.
    const margem =
      venda.costAmount.gt(0) ? toDecimal(venda.profitAmount).div(toDecimal(venda.costAmount)).mul(100) : null;

    return {
      id: venda.id,
      numero: venda.number,
      serie: venda.series,
      status: venda.status,
      tipo: venda.type,
      canal: venda.channel,
      finalidade: venda.purpose,
      clienteId: venda.customer?.id ?? null,
      clienteNome: venda.customer?.name ?? null,
      vendedorNome: venda.seller?.name ?? null,
      filialId: venda.branchId,
      filialNome: venda.branch.name,
      formaPagamento: venda.paymentMethod?.name ?? null,
      condicaoPagamento: venda.paymentTerms?.name ?? null,
      subtotal: venda.subtotal,
      desconto: venda.discountAmount,
      frete: venda.shippingAmount,
      tributos: venda.taxAmount,
      retencao: venda.retentionAmount,
      total: venda.total,
      recebido: venda.paidAmount,
      custo: venda.costAmount,
      lucro: venda.profitAmount,
      margem,
      soldAt: venda.soldAt,
      entregueEm: venda.deliveredAt,
      canceladaEm: venda.cancelledAt,
      motivoCancelamento: venda.cancellationReason,
      observacoes: venda.notes,
      observacoesInternas: venda.internalNotes,
      criadaEm: venda.createdAt,
      criadaPor: venda.createdBy?.name ?? null,
      itens: venda.items.map((item) => ({
        id: item.id,
        descricao: item.description,
        produtoNome: item.product?.name ?? null,
        produtoSku: item.product?.sku ?? null,
        quantidade: item.quantity,
        precoUnitario: item.unitPrice,
        desconto: item.discountAmount,
        total: item.total,
        custoUnitario: item.unitCost,
        custoTotal: item.costAmount,
        devolvido: item.returnedQuantity,
        tributado: item.taxAmount.gt(0),
      })),
      pagamentos: venda.payments.map((pagamento) => ({
        id: pagamento.id,
        parcela: pagamento.installmentNumber,
        forma: pagamento.paymentMethod?.name ?? null,
        tipo: pagamento.type,
        valor: pagamento.amount,
        pagoEm: pagamento.paidAt,
        bandeira: pagamento.cardBrand,
        ultimosDigitos: pagamento.cardLastFour,
        motivoFalha: pagamento.failureReason,
      })),
      contas: venda.accountsReceivable.map((conta) => ({
        id: conta.id,
        numero: conta.number,
        situacao: conta.status,
        vencimento: conta.dueDate,
        total: conta.totalAmount,
        pago: conta.paidAmount,
        restante: conta.remainingAmount,
        parcelas: conta.installments.map((parcela) => ({
          numero: parcela.number,
          situacao: parcela.status,
          vencimento: parcela.dueDate,
          valor: parcela.amount,
          pago: parcela.paidAmount,
          restante: parcela.remainingAmount,
          pagoEm: parcela.paidAt,
        })),
      })),
      notas: venda.invoices.map((nota) => ({
        id: nota.id,
        numero: nota.number,
        serie: nota.series,
        situacao: nota.status,
        modelo: nota.model,
        direcao: nota.direction,
        autorizadaEm: nota.authorizedAt,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Opcoes do formulario de venda
// ---------------------------------------------------------------------------

/** Um produto ou servico selecionavel, com o preco e o saldo que a tela mostra ao lado. */
export interface OpcaoProdutoVenda {
  /**
   * `produto:<id>` ou `servico:<id>`.
   *
   * O prefixo nao e decoracao: e o que diz ao formulario qual campo gravar.
   * `Product` e `Service` sao tabelas diferentes com ids diferentes, entao um
   * `<select>` so so funciona se o valor carregar a origem. Sem o prefixo o
   * `productId` receberia o id de um servico (ou o contrario) e a gravacao
   * falharia na FK — mas so depois de a pessoa preencher a venda inteira.
   */
  readonly value: string;
  readonly rotulo: string;
  /** `true` quando `value` aponta para `Service`. */
  readonly origem: "produto" | "servico";
  /** Preco de venda do cadastro, ja em texto: vira o preco do item ao escolher. */
  readonly preco: string;
  /**
   * Saldo disponivel na filial ativa, para a pessoa nao descobrir na confirmacao.
   *
   * `null` para SERVICO e COMPOSTO: os dois nao tem saldo proprio, e mostrar
   * "0,0000" ao lado do preco faria a pessoa concluir que o item esta zerado.
   */
  readonly disponivel: string | null;
  /**
   * `true` para SERVICO e COMPOSTO — os tipos que NAO movimentam estoque.
   *
   * O `<select>` do formulario e unico, e precisa saber. Sem esta flag, um
   * servico escolhido cairia em `productId`, e a confirmacao tentaria debitar
   * `stock_items` de um item que nunca teve saldo: a venda seria recusada com
   * "estoque insuficiente" para um servico que foi literalmente comprado.
   */
  readonly semEstoque: boolean;
}

export interface OpcoesVenda {
  readonly clientes: readonly { readonly value: string; readonly rotulo: string }[];
  readonly vendedores: readonly { readonly value: string; readonly rotulo: string }[];
  readonly condicoesPagamento: readonly { readonly value: string; readonly rotulo: string }[];
  readonly formasPagamento: readonly { readonly value: string; readonly rotulo: string }[];
  readonly produtos: readonly OpcaoProdutoVenda[];
  readonly tipos: readonly { readonly value: string; readonly rotulo: string }[];
  readonly canais: readonly { readonly value: string; readonly rotulo: string }[];
}

/**
 * O rascunho em edicao, ou `null` se nao existe ou ja saiu do rascunho.
 *
 * "Saiu do rascunho" e `null` por design, e nao um status: a tela de edicao
 * responde `notFound()` para uma venda confirmada, e a resposta correta para
 * "esta venda nao e editavel" e a mesma de "esta venda nao existe" — nas duas
 * o que a pessoa fez foi abrir a URL errada. Devolver o status obrigaria a tela
 * a ter uma mensagem So para esse caso, e ela apareceria no lugar de um
 * formulario, sem contexto.
 */
export async function buscarRascunhoVenda(
  scope: TenantScope,
  id: string,
): Promise<RascunhoParaEdicao | null> {
  const venda = await withTenantDb(scope, async (db) =>
    db.sale.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        number: true,
        branchId: true,
        type: true,
        channel: true,
        customerId: true,
        sellerId: true,
        paymentTermsId: true,
        paymentMethodId: true,
        soldAt: true,
        notes: true,
        items: {
          orderBy: { sortOrder: "asc" },
          select: {
            productId: true,
            serviceId: true,
            description: true,
            quantity: true,
            unitPrice: true,
            discountAmount: true,
          },
        },
      },
    }),
  );

  // O estreitamento para `status: "RASCUNHO"` e explicito porque o tipo
  // devolvido promete isso. Deixar o Prisma inferir devolveria `SaleStatus`, e
  // a tela passaria a tratar "venda confirmada" como editavel — que e
  // exatamente o que a funcao existe para impedir.
  if (venda === null || venda.status !== "RASCUNHO") return null;
  return { ...venda, status: "RASCUNHO" };
}

export interface RascunhoParaEdicao {
  readonly id: string;
  readonly status: "RASCUNHO";
  readonly number: string;
  readonly branchId: string;
  readonly type: string;
  readonly channel: string;
  readonly customerId: string | null;
  readonly sellerId: string | null;
  readonly paymentTermsId: string | null;
  readonly paymentMethodId: string | null;
  readonly soldAt: Date | null;
  readonly notes: string | null;
  readonly items: readonly {
    readonly productId: string | null;
    readonly serviceId: string | null;
    readonly description: string;
    readonly quantity: Decimal;
    readonly unitPrice: Decimal;
    readonly discountAmount: Decimal;
  }[];
}

/**
 * Tudo que o `<select>` do formulario de venda precisa, em uma consulta so.
 *
 * `branchId` entra porque o SALDO do produto e por filial: o mesmo produto pode
 * ter 12 unidades na matriz e zero na loja deShopping, e e a filial ativa que
 * decide se a confirmacao passa.
 *
 * Traz o saldo de todas as formas porque o formulario mostra o disponivel de
 * cada produto. Sao duas leituras a mais por produto, e a alternativa — nao
 * mostrar — empurra o erro "sem estoque" para a confirmacao, quando a pessoa ja
 * digitou a venda inteira e o preco.
 */
export async function opcoesVenda(
  scope: TenantScope,
  branchId: string,
): Promise<OpcoesVenda> {
  return withTenantDb(scope, async (db) => {
    const [clientes, vendedores, condicoes, formas, produtos, servicos, saldos] = await Promise.all([
      db.customer.findMany({
        where: { deletedAt: null, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 500,
      }),
      // `User.status`, e nao um `active`: um usuario bloqueado nao pode ser
      // vendedor de uma venda nova, mas um usuario em `PENDENTE_ATIVACAO`
      // tambem nao — os dois ficam de fora, e o filtro e o mesmo dos dois lados.
      db.user.findMany({
        where: { status: "ATIVO" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.paymentTerms.findMany({
        where: { deletedAt: null, active: true },
        select: { id: true, name: true, type: true, installmentCount: true, intervalDays: true },
        orderBy: { name: "asc" },
      }),
      db.paymentMethod.findMany({
        where: { deletedAt: null, active: true },
        select: { id: true, name: true, type: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      db.product.findMany({
        where: { deletedAt: null, active: true },
        select: { id: true, name: true, sku: true, unitPrice: true, type: true },
        orderBy: { name: "asc" },
        take: 1000,
      }),
      // `Service` e um MODELO SEPARADO de `Product`, e `SaleItem.serviceId`
      // aponta para ele por FK (`SaleItem.service Service @relation(...)`).
      // Nao existe `Product` que "seja um servico": `ProductType.SERVICO` e um
      // item de NFS-e que NAO esta no catalogo de servicos. Consultar `Product`
      // para preencher `serviceId` gravava um id de produto em `service_id` e
      // o proprio banco recusava com violacao de FK.
      db.service.findMany({
        where: { deletedAt: null, active: true },
        select: { id: true, name: true, code: true, unitPrice: true },
        orderBy: { name: "asc" },
        take: 1000,
      }),
      db.stockItem.findMany({
        where: { branchId },
        select: { productId: true, quantity: true, reservedQuantity: true },
      }),
    ]);

    const saldoPorProduto = new Map(
      saldos.map((s) => [s.productId, toDecimal(s.quantity).minus(toDecimal(s.reservedQuantity))]),
    );

    return {
      clientes: clientes.map((c) => ({ value: c.id, rotulo: c.name })),
      vendedores: vendedores.map((v) => ({ value: v.id, rotulo: v.name })),
      // O rotulo do prazo mostra a parcela, porque "3x" e o que a pessoa precisa
      // ler antes de escolher, e "Parcelado" nao diz nada.
      condicoesPagamento: condicoes.map((c) => ({
        value: c.id,
        rotulo: c.type === "PARCELADO" && c.installmentCount > 1
          ? `${c.name} (${c.installmentCount}x)`
          : c.name,
      })),
      formasPagamento: formas.map((f) => ({ value: f.id, rotulo: f.name })),
      // Um `<select>` so, com as duas tabelas misturadas. O `value` sozinho nao
      // distingue as duas, entao a origem vai no proprio id prefixado — o
      // formulario abre em `servico:` ou `produto:` e grava o campo certo, e o
      // servidor revalida. Sem o prefixo, dois ids iguais (o mesmo `cuid` nao
      // colide, mas o MESMO nome aparece duas vezes) deixariam a pessoa sem
      // saber qual esta escolhendo.
      produtos: [
        ...produtos.map((p) => {
          // `MERCADORIA` e o unico tipo com saldo. `SERVICO` e `COMPOSTO` de
          // `Product` entram no mesmo `<select>` — quem vende os tres nao quer
          // dois campos — mas so a mercadoria mostra e valida saldo.
          const semEstoque = p.type !== "MERCADORIA";
          const disponivel = saldoPorProduto.get(p.id) ?? toDecimal(0);
          return {
            value: `produto:${p.id}`,
            rotulo: p.sku ? `${p.name} (${p.sku})` : p.name,
            preco: toDecimal(p.unitPrice).toFixed(2).replace(".", ","),
            disponivel: semEstoque ? null : formatarQuantidadeTexto(disponivel),
            semEstoque,
            origem: "produto" as const,
          };
        }),
        ...servicos.map((s) => ({
          value: `servico:${s.id}`,
          rotulo: s.code ? `${s.name} (${s.code})` : s.name,
          preco: toDecimal(s.unitPrice).toFixed(2).replace(".", ","),
          // Servico nao tem `stock_items`: saldo e `null`, e nunca "0,0000".
          disponivel: null,
          semEstoque: true,
          origem: "servico" as const,
        })),
      ],
      tipos: Object.entries(ROTULO_TIPO).map(([value, rotulo]) => ({ value, rotulo })),
      canais: Object.entries(ROTULO_CANAL).map(([value, rotulo]) => ({ value, rotulo })),
    };
  });
}

/**
 * Quantidade em texto pt-BR, sem zeros a direita e sem virgula pendurada.
 *
 * O `replace(/0+$/, "")` ingênuo — o jeito que este numero era formatado antes
 * — apaga os zeros do FIM da string, e em "7.0000" eles vem depois do ponto:
 * sobra "7." e a troca do separador produz "7,". A tela mostrava "Saldo: 7,"
 * ao lado do preco, que e o tipo de detalhe que faz a pessoa desconfiar do
 * sistema inteiro.
 *
 * `7.5000` -> "7,5" e `7.0000` -> "7": corta os zeros so depois do ponto e
 * descarta o ponto que sobrou sem nada depois dele.
 */
function formatarQuantidadeTexto(valor: Decimal): string {
  const bruto = valor.toFixed(4);
  const semZeros = bruto.includes(".") ? bruto.replace(/0+$/, "").replace(/\.$/, "") : bruto;
  return semZeros.replace(".", ",");
}
