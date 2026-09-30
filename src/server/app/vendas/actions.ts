"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import Decimal from "decimal.js";

import { AppError, ErrorCode, isAppError } from "@/lib/errors";
import type { EstadoFormulario } from "@/lib/formulario";
import { log } from "@/lib/logger";
import { parseBrazilianNumber, toDecimal, toMoney, toQuantity } from "@/lib/money";
import { requirePermission } from "@/server/auth/rbac";
import { obterContextoOperacao } from "@/server/app/sessao";
import { erroDeRegra, estadoDeErro, validarFormulario } from "@/server/app/validacao";
import { calcularVenda, type VendaCalculada } from "@/server/app/vendas/calculo";
import {
  confirmarVendaEmTransacao,
  contarParcelas,
} from "@/server/app/vendas/confirmacao";
import { schemaVenda, type DadosVenda } from "@/server/app/vendas/schema";
import { aplicarEstornoDeVenda, ehEstoqueInsuficiente } from "@/server/app/estoque/movimento";
import { MODELOS, dentroDeTransacao, proximoNumero } from "@/server/db/numero";
import { withTenantDb } from "@/server/db/scoped";
import type { TenantScope } from "@/server/db/tenant-scope";

/**
 * Server Actions de venda.
 *
 * ## O CICLO DE VIDA, E POR QUE ELE TEM TRES PASSOS
 *
 *   RASCUNHO  ->  CONFIRMADA  ->  CANCELADA
 *
 * O rascunho existe para a venda nao precisar estar pronta no instante em que
 * o cliente decided. Ele ja grava o numero e os itens, entao a confirmacao nao
 * precisa recalcular preco nenhum — o que o vendedor digitou e o que vai para o
 * documento.
 *
 * ## A REGRA QUE ORGANIZA TUDO AQUI
 *
 * **Estoque so mexe na confirmacao.** O rascunho nao reserva, nao baixa e nao
 * custa. Um rascunho abandonado nao pode ter baixado estoque de produto que
 * alguem mais foi vender enquanto a venda estava "pendente"; a reserva aqui
 * seria um segundo sistema de estoque (quantidade reservada, liberacao por
 * expiracao) que nao existe ainda. A consequencia e o oposto: duas pessoas
 * montam rascunhos do mesmo produto e uma confirmacao falha por falta de saldo.
 * A tela mostra o saldo no momento da confirmacao justamente por isso.
 *
 * ## A CONFIRMACAO E UMA TRANSACAO INTEIRA
 *
 * Estoque, custo, conta a receber, parcelas e pagamento entram juntos, ou nada
 * entra. Venda confirmada com estoque debitado e sem conta a receber e o pior
 * estado possivel de um ERP: o dinheiro sumiu e o estoque tambem.
 */

const LISTAGEM = "/vendas";

/** Uma linha de venda ja resolvida contra o banco. */
interface LinhaResolvida {
  readonly indice: number;
  readonly productId: string | null;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: ReturnType<typeof toQuantity>;
  readonly unitPrice: ReturnType<typeof toDecimal>;
  readonly discountAmount: ReturnType<typeof toMoney>;
  readonly unitCost: ReturnType<typeof toQuantity> | null;
}

// ---------------------------------------------------------------------------
// Rascunho
// ---------------------------------------------------------------------------

/**
 * Cria a venda em RASCUNHO.
 *
 * O numero e alocado AQUI, e nao na confirmacao, por dois motivos. Primeiro, a
 * listagem mostra o rascunho e uma venda sem numero parece um registro quebrado.
 * Segundo, e a sequencia que precisa de lock: fazer isso na confirmacao
 * concentraria a disputa no momento em que varias pessoas estao vendendo ao
 * mesmo tempo, que e o pior lugar para ter espera.
 *
 * A consequencia de alocar no rascunho e que um rascunho descartado queima um
 * numero. Isso e aceitavel e ate desejavel: numero com buraco e normal em
 * documento fiscal, e numero REUTILIZADO quebra a serie.
 */
export async function criarVenda(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "create" });

  const validacao = validarFormulario(schemaVenda, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  try {
    {
      const linhas = await resolverLinhas(ctx.scope, entrada);
      const calculo = calcularVenda(paraCalculo(linhas), {
        descontoCabecalho: entrada.desconto,
        frete: entrada.frete,
      });

      await verificarReferencias(ctx.scope, entrada);

      const venda = await dentroDeTransacao(ctx.scope, async (tx) => {
        const numero = await proximoNumero(tx, ctx.scope, {
          model: MODELOS.venda,
          branchId: ctx.branchId,
        });

        return tx.sale.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            number: numero,
            status: "RASCUNHO",
            type: entrada.tipo,
            channel: entrada.canal,
            customerId: entrada.clienteId,
            sellerId: entrada.vendedorId ?? ctx.userId,
            paymentTermsId: entrada.paymentTermsId,
            paymentMethodId: entrada.paymentMethodId,
            // A data escolhida no rascunho ja e a `soldAt` definitiva. Uma
            // venda de marco registrada em marco tem que aparecer na consulta de
            // marco, mesmo que a confirmacao tenha vindo em abril.
            soldAt: entrada.data ?? new Date(),
            subtotal: calculo.subtotal,
            discountAmount: calculo.discountAmount,
            shippingAmount: calculo.shippingAmount,
            taxAmount: calculo.taxAmount,
            total: calculo.total,
            // Custo e ZERO no rascunho, e nao uma estimativa: `unit_cost` so
            // pode ser congelado na confirmacao, com o custo que vale no
            // momento em que o estoque sai. Uma estimativa aqui viraria lucro
            // aparente no rascunho e mudaria na confirmacao.
            costAmount: calculo.costAmount,
            profitAmount: calculo.profitAmount,
            notes: entrada.observacoes,
            internalNotes: entrada.observacoesInternas,
            createdById: ctx.userId,
            items: {
              create: paraItens(ctx.tenantId, calculo),
            },
          },
          select: { id: true, number: true },
        });
      });

      log("vendas").info({ vendaId: venda.id, numero: venda.number }, "venda criada em rascunho");
    }
  } catch (erro) {
    registrarFalha(erro, "criar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}

/** Edita um rascunho. So rascunho: venda confirmada e documento. */
export async function atualizarVendaRascunho(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Venda nao informada.");

  const validacao = validarFormulario(schemaVenda, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  // Resolucao e validacao ANTES da transacao: sao leituras, e nenhuma delas
  // segura lock. Deixar as duas fora do `dentroDeTransacao` tambem evita que
  // cada `withTenantDb` aninhado abra um escopo de tenant dentro do escopo da
  // transacao — o mesmo escopo, duas vezes, e a segunda apertura e gratuita.
  const linhas = await resolverLinhas(ctx.scope, entrada).catch((erro) => {
    registrarFalha(erro, "atualizar");
    return null;
  });
  if (linhas === null) return estadoDeErro(new AppError(ErrorCode.VALIDATION_FAILED, "Itens invalidos."), valoresDe(entrada));

  const calculo = calcularVenda(paraCalculo(linhas), {
    descontoCabecalho: entrada.desconto,
    frete: entrada.frete,
  });

  try {
    await verificarReferencias(ctx.scope, entrada);

    // `deleteMany` + `create` em vez de atualizar item a item: o item editado e
    // o item novo sao a MESMA coisa para quem le a venda, e reconciliar exigiria
    // diff posicional que erra mal quando a ordem muda.
    //
    // E transacional, obrigatoriamente. Sem a transacao, uma falha no `update`
    // — um `total` acima do limite, um `check` de banco — deixava a venda sem
    // nenhum item: o rascunho que estava la desapareceu e o total continuava
    // o antigo. Perder a lista de itens de uma edicao nao-recuperavel e o tipo
    // de bug que so aparece quando alguem ja tinha digitado vinte minutos de
    // venda.
    await dentroDeTransacao(ctx.scope, async (tx) => {
      const atual = await tx.sale.findFirst({
        where: { id, deletedAt: null },
        select: { status: true },
      });
      if (!atual) throw new AppError(ErrorCode.NOT_FOUND, "Venda nao encontrada.");
      if (atual.status !== "RASCUNHO") {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Somente rascunho pode ser editado. Cancele a venda e faca outra.",
        );
      }

      await tx.saleItem.deleteMany({ where: { saleId: id, tenantId: ctx.tenantId } });
      await tx.sale.update({
        where: { id },
        data: {
          type: entrada.tipo,
          channel: entrada.canal,
          customerId: entrada.clienteId,
          sellerId: entrada.vendedorId ?? ctx.userId,
          paymentTermsId: entrada.paymentTermsId,
          paymentMethodId: entrada.paymentMethodId,
          soldAt: entrada.data ?? new Date(),
          subtotal: calculo.subtotal,
          discountAmount: calculo.discountAmount,
          shippingAmount: calculo.shippingAmount,
          taxAmount: calculo.taxAmount,
          total: calculo.total,
          costAmount: calculo.costAmount,
          profitAmount: calculo.profitAmount,
          notes: entrada.observacoes,
          internalNotes: entrada.observacoesInternas,
          items: { create: paraItens(ctx.tenantId, calculo) },
        },
      });
    });
  } catch (erro) {
    registrarFalha(erro, "atualizar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}

// ---------------------------------------------------------------------------
// Confirmacao
// ---------------------------------------------------------------------------

/**
 * Confirma a venda: baixa estoque, congela custo, gera conta a receber.
 *
 * Tudo numa transacao so. A ordem dentro dela importa em um ponto: o estoque e
 * debitado ANTES do `total` ser gravado, porque a checagem de saldo vem da
 * linha de `stock_items` ja travada. Inverter deixaria o `total` gravado se a
 * baixa falhasse.
 */
export async function confirmarVenda(dados: FormData): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Venda nao informada.");

  const receberAgora = dados.get("receberAgora") === "on";
  const formaPagamento = opcional(dados.get("formaPagamentoId"));
  // O checkbox "Receber agora" marcado sem forma e erro de formulario, e nao
  // um "vai sem forma": o bloco abaixo so funciona com `formaPagamento` nulo
  // nao fazendo nada, e a pessoa acharia que recebeu e a venda sairia aberta.
  if (receberAgora && formaPagamento === null) {
    return erroDeRegra("Escolha a forma de pagamento para receber junto com a confirmacao.");
  }

  try {
    await dentroDeTransacao(ctx.scope, (tx) =>
      confirmarVendaEmTransacao(tx, {
        scope: ctx.scope,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        vendaId: id,
        receberAgora,
        formaPagamento,
      }),
    );
  } catch (erro) {
    registrarFalha(erro, "confirmar");
    return estadoDeErro(erro);
  }

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}/${id}`);
}

/**
 * Registra um recebimento em uma venda ja confirmada.
 *
 * Exige forma de pagamento e valor, e nao assume a parcela: a pessoa pode
 * pagar a parcela 3 antes da 1, e um modulo que so sabe quitar "a proxima"
 * registraria o dinheiro na parcela errada — o caso que faz o controle de
 * vencimentos mostrar "venceu" num titulo que ja foi pago.
 *
 * O excedente NAO vira troco. `overpaymentAmount` e um numero que existe no
 * schema para o caso em que o caixa precisa saber que ha sobra a devolver; o
 * caixa aqui e registro de entrada, e tratar o excedente como saldo a favor
 * exigiria um modulo de caixa que ainda nao existe. A sobra fica na conta a
 * receber, e o pagamento carrega o valor inteiro como documentacao do que
 * entrou.
 */
export async function registrarRecebimentoVenda(dados: FormData): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Venda nao informada.");
  const formaPagamento = opcional(dados.get("formaPagamentoId"));
  const valorTexto = opcional(dados.get("valor"));

  if (formaPagamento === null) return erroDeRegra("Informe a forma do pagamento.", "formaPagamentoId");
  if (valorTexto === null) return erroDeRegra("Informe o valor recebido.", "valor");

  let valor: ReturnType<typeof toMoney>;
  try {
    valor = toMoney(parseBrazilianNumber(valorTexto));
  } catch {
    return erroDeRegra("Valor recebido invalido.", "valor");
  }
  if (valor.lte(0)) return erroDeRegra("O valor recebido deve ser maior que zero.", "valor");

  try {
    await dentroDeTransacao(ctx.scope, async (tx) => {
      const venda = await tx.sale.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, number: true, status: true, paidAmount: true, branchId: true },
      });
      if (!venda) throw new AppError(ErrorCode.NOT_FOUND, "Venda nao encontrada.");
      if (venda.status === "RASCUNHO") {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Rascunho nao tem conta a receber. Confirme a venda antes de receber.",
        );
      }
      if (venda.status === "CANCELADA" || venda.status === "DEVOLVIDA") {
        throw new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, "Venda encerrada nao aceita recebimento.");
      }

      const conta = await tx.accountsReceivable.findFirst({
        where: { tenantId: ctx.tenantId, saleId: venda.id, status: { in: ["PENDENTE", "PARCIAL"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, remainingAmount: true },
      });
      if (!conta) {
        throw new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, "Esta venda nao tem conta a receber em aberto.");
      }
      const restante = toMoney(conta.remainingAmount);
      if (restante.lte(0)) {
        throw new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, "Esta venda nao tem saldo a receber.");
      }

      // O excedente e aceito e NAO aplicado: `aplicado` fica no valor que
      // quita a conta. Registrar o valor cheio em `overpaymentAmount` e o que
      // permite o modulo de caixa mostrar "entrou 100, a empresa deve 90"
      // quando ele existir, sem precisar reconstruir pelo historico.
      const aplicado = toMoney(Decimal.min(valor, restante));
      const excedente = toMoney(valor.minus(aplicado));

      // Quitando da parcela mais antiga para a mais nova: e a ordem que a
      // pessoa espera, e a unica que nao deixa um titulo vencido em aberto com
      // outro adiante quitado.
      const parcelas = await tx.installment.findMany({
        where: {
          tenantId: ctx.tenantId,
          accountsReceivableId: conta.id,
          status: { in: ["PENDENTE", "PARCIAL"] },
        },
        orderBy: { number: "asc" },
        select: { id: true, number: true, paidAmount: true, paidAt: true, remainingAmount: true },
      });
      if (parcelas.length === 0) {
        throw new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, "Nao ha parcela em aberto nesta conta.");
      }

      let restantePago = toMoney(0);
      let ultimaParcela: number | null = null;
      for (const parcela of parcelas) {
        if (restantePago.gte(aplicado)) break;
        const devendo = toMoney(parcela.remainingAmount);
        const destaVez = toMoney(Decimal.min(devendo, aplicado.minus(restantePago)));
        const novoRestante = toMoney(devendo.minus(destaVez));
        // `paidAmount` ACUMULA, e nao recebe so `destaVez`: uma parcela
        // `PARCIAL` ja tem pagamento anterior, e escrever `destaVez` nela
        // apagaria a memoria do que ja foi recebido — a parcela voltaria a
        // deber mais do que deve, e o total da conta nao bateria com a soma
        // das parcelas.
        const pago = toMoney(parcela.paidAmount).plus(destaVez);

        await tx.installment.update({
          where: { id: parcela.id },
          data: {
            status: novoRestante.isZero() ? "PAGO" : "PARCIAL",
            paidAmount: pago,
            remainingAmount: novoRestante,
            // `paidAt` so quando a parcela FECHA. Marcar a data em todo
            // recebimento parcial faria a parcela de 300 quitada em 3x mostrar
            // "paga em" na primeira das tres.
            paidAt: novoRestante.isZero() ? new Date() : parcela.paidAt,
          },
        });
        restantePago = toMoney(restantePago.plus(destaVez));
        ultimaParcela = parcela.number;
      }

      await tx.paymentTransaction.create({
        data: {
          tenantId: ctx.tenantId,
          saleId: venda.id,
          paymentMethodId: formaPagamento,
          installmentNumber: ultimaParcela ?? parcelas[0]?.number ?? 1,
          type: "APROVADA",
          amount: valor,
          changeAmount: toMoney(0),
          overpaymentAmount: excedente,
          paidAt: new Date(),
        },
      });

      const totalPago = toMoney(toMoney(conta.remainingAmount).minus(restante).plus(restantePago));
      const restanteConta = toMoney(conta.remainingAmount).minus(restantePago);
      const statusParcelas = await contarParcelas(tx, ctx.tenantId, conta.id);

      await tx.accountsReceivable.update({
        where: { id: conta.id },
        data: {
          status: statusParcelas === parcelas.length || restanteConta.isZero() ? "PAGO" : "PARCIAL",
          paidAmount: totalPago,
          remainingAmount: restanteConta,
          settledDate: restanteConta.isZero() ? new Date() : null,
        },
      });

      await tx.sale.update({
        where: { id: venda.id },
        data: { paidAmount: toMoney(venda.paidAmount).plus(restantePago) },
      });

      log("vendas").info(
        { vendaId: venda.id, valor: valor.toString(), aplicado: aplicado.toString() },
        "recebimento registrado",
      );
    });
  } catch (erro) {
    registrarFalha(erro, "receber");
    return estadoDeErro(erro);
  }

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}/${id}`);
}

/**
 * Exclui um rascunho.
 *
 * RASCUNHO E O UNICO ESTADO QUE PODE SUMIR. A partir de `CONFIRMADA` a venda
 * tem numero,movimento de estoque, conta a receber e historico — apagar seria
 * perder documento. O cancelamento e o caminho correto dali em diante.
 *
 * Excluir em vez de cancelar evita queimar numero: o `NumberSequence` nao
 * retrocede, e um rascunho excluido deixa buraco na serie. A sequencia da venda
 * volta a ser o proximo numero livre, e o buraco que ficar e menor do que a
 * confusao de "numero 47 sumiu" numa serie de documentos.
 */
export async function excluirRascunhoVenda(dados: FormData): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  // `update`, e nao `delete`. `VENDAS.venda` NAO tem `delete` no catalogo — e a
  // decisao esta escrita la: "venda nao se apaga, se cancela". Pedir `delete`
  // aqui nao dava erro, dava silencio: `podeOperar` devolvia sempre `false`,
  // o botao nunca aparecia e a action nunca era alcancavel. E o motivo do
  // catalogo nao se aplica a rascunho: rascunho nao tem baixa, nao tem conta a
  // receber, nao tem historico. Quem pode editar um rascunho pode descarta-lo.
  await requirePermission(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Venda nao informada.");

  try {
    await dentroDeTransacao(ctx.scope, async (tx) => {
      const venda = await tx.sale.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!venda) throw new AppError(ErrorCode.NOT_FOUND, "Venda nao encontrada.");
      if (venda.status !== "RASCUNHO") {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Somente rascunho pode ser excluido. Venda confirmada deve ser cancelada.",
        );
      }
      // `delete`, e nao `deletedAt`: os itens nao tem `deletedAt` proprio, e um
      // soft delete na venda deixaria os itens orfaos visiveis em consulta por
      // `saleId`. Rascunho nao tem historico a preservar.
      await tx.saleItem.deleteMany({ where: { tenantId: ctx.tenantId, saleId: venda.id } });
      await tx.sale.delete({ where: { id: venda.id } });
    });
  } catch (erro) {
    registrarFalha(erro, "excluir");
    return estadoDeErro(erro);
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}

/**
 * Cancela a venda e devolve o estoque.
 *
 * Cancelar e ESTORNAR, nunca apagar: a venda existe, foi confirmada e o
 * documento precisa continuar aparecendo na consulta com a situacao CANCELADA.
 * E o estorno tem que vir junto, senao o estoque some e a pessoa descobre o
 * problema semanas depois, no inventario.
 */
export async function cancelarVenda(dados: FormData): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "VENDAS", recurso: "venda", acao: "cancel" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Venda nao informada.");
  const motivo = opcional(dados.get("motivo"));

  try {
    {
      await dentroDeTransacao(ctx.scope, async (tx) => {
        const venda = await tx.sale.findFirst({
          where: { id, deletedAt: null },
          select: { id: true, number: true, branchId: true, status: true, paidAmount: true },
        });
        if (!venda) throw new AppError(ErrorCode.NOT_FOUND, "Venda nao encontrada.");

        // Uma venda devolvida ja tem o estoque devolvido pelo fluxo de devolucao.
        // Estornar aqui de novo colocaria no estoque mercadoria que NUNCA SAIU
        // DESSA VENDA: o saldo da filial subiria sozinho, com inventario batendo
        // errado e ninguem tendo comprado nada. Por isso devolucao nao volta
        // para "cancelada" — o caminho dela e a devolucao, e o estado
        // `DEVOLVIDA` ja diz tudo que a listagem precisa mostrar.
        if (venda.status === "DEVOLVIDA" || venda.status === "PARCIALMENTE_DEVOLVIDA") {
          throw new AppError(
            ErrorCode.BUSINESS_RULE_VIOLATION,
            "Venda com devolucao registrada nao pode ser cancelada. O estoque ja foi devolvido.",
          );
        }
        if (venda.status === "CANCELADA") {
          throw new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, "Esta venda ja esta cancelada.");
        }
        if (toMoney(venda.paidAmount).gt(0)) {
          // Cancelar uma venda com dinheiro recebido deixa o caixa com um valor
          // sem documento. O caminho e o estorno do pagamento, que so existe
          // depois que o modulo de financeiro entrar; ate la, recusar aqui e
          // melhor do que duplicar o dinheiro no outro lado.
          throw new AppError(
            ErrorCode.BUSINESS_RULE_VIOLATION,
            "Esta venda ja tem pagamento registrado. Estorne o pagamento antes de cancelar.",
          );
        }

        // O estorno so faz sentido para venda que chegou a debitar estoque.
        // Rascunho cancelado nao teve baixa, e estornar aqui criaria uma
        // entrada de estoque que nunca teve saida correspondente.
        //
        // A lista e explicita, e nao "tudo que nao seja RASCUNHO/PENDENTE",
        // porque um `SaleStatus` novo no schema passaria a estornar por padrao.
        // O padrao seguro para um estado desconhecido e nao mexer no estoque.
        const debitouEstoque =
          venda.status === "CONFIRMADA" || venda.status === "CONCLUIDA" || venda.status === "ENTREGUE";
        if (debitouEstoque) {
          await aplicarEstornoDeVenda(tx, ctx.scope, {
            branchId: venda.branchId,
            saleId: venda.id,
            saleNumber: venda.number,
            performedById: ctx.userId,
          });
        }

        await tx.sale.update({
          where: { id: venda.id },
          data: {
            status: "CANCELADA",
            cancelledAt: new Date(),
            cancellationReason: motivo,
            cancelledById: ctx.userId,
          },
        });

        // A conta a receber e o recebivel do cancelamento: sem isso, a venda
        // sumiria da lista mas o valor continuaria no controle de vencimentos.
        await tx.accountsReceivable.updateMany({
          where: { tenantId: ctx.tenantId, saleId: venda.id, status: { not: "CANCELADO" } },
          data: { status: "CANCELADO" },
        });
        await tx.installment.updateMany({
          where: {
            tenantId: ctx.tenantId,
            accountsReceivable: { saleId: venda.id },
            status: { not: "CANCELADO" },
          },
          data: { status: "CANCELADO" },
        });
      });
    }
  } catch (erro) {
    registrarFalha(erro, "cancelar");
    return estadoDeErro(erro);
  }

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}/${id}`);
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

/**
 * Resolve as linhas do formulario contra o banco.
 *
 * Traz o NOME do produto quando a descricao veio vazia. A descricao e gravada na
 * venda porque e o que vai para o documento impresso, e o nome do produto pode
 * mudar depois: relatorio de mes fechado precisa mostrar o que foi vendido,
 * nao o que o produto se chama hoje.
 */
async function resolverLinhas(scope: TenantScope, entrada: DadosVenda): Promise<LinhaResolvida[]> {
  // `Product` e `Service` sao DOIS MODELOS com duas tabelas e duas FKs
  // separadas em `SaleItem` (`product Product?` e `service Service?`). Uma
  // consulta so nao resolve os dois: ela buscaria o id do servico na tabela de
  // produtos, nao acharia, e a linha seria recusada como "servico indisponivel"
  // — ou, se o id existisse nos dois lados, gravaria o ponteiro errado.
  const idsProduto = unicos(entrada.itens.map((item) => item.productId));
  const idsServico = unicos(entrada.itens.map((item) => item.serviceId));

  const [products, services] = await withTenantDb(scope, async (db) =>
    Promise.all([
      db.product.findMany({
        where: { id: { in: idsProduto }, deletedAt: null, active: true },
        select: { id: true, name: true, type: true },
      }),
      db.service.findMany({
        where: { id: { in: idsServico }, deletedAt: null, active: true },
        select: { id: true, name: true },
      }),
    ]),
  );

  const produtosPorId = new Map(products.map((p) => [p.id, p]));
  const servicosPorId = new Map(services.map((s) => [s.id, s]));

  return entrada.itens.map((item, indice) => {
    const produto = item.productId === null ? undefined : produtosPorId.get(item.productId);
    const servico = item.serviceId === null ? undefined : servicosPorId.get(item.serviceId);
    if (item.productId !== null && produto === undefined) {
      // Produto informado e inexistente, ou desativado entre a tela abrir e o
      // clique. Aceitar deixaria uma linha de venda apontando para nada.
      throw new AppError(ErrorCode.VALIDATION_FAILED, `Item ${indice + 1}: produto indisponivel.`);
    }
    if (item.serviceId !== null && servico === undefined) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, `Item ${indice + 1}: servico indisponivel.`);
    }
    return {
      indice,
      productId: item.productId,
      serviceId: item.serviceId,
      // O nome vem do cadastro quando a pessoa nao digitou descricao. Sem o
      // fallback para o servico, uma linha so com `serviceId` gravava
      // `description: ""` e a listagem mostrava um item sem nome nenhum.
      description: item.descricao !== "" ? item.descricao : (produto?.name ?? servico?.name ?? ""),
      quantity: toQuantity(item.quantidade),
      unitPrice: toDecimal(item.precoUnitario),
      discountAmount: toMoney(item.desconto),
      // Custo so na confirmacao: ver NOTA DO RASCUNHO em `criarVenda`.
      unitCost: null,
    };
  });
}

/** IDs informados, sem `null` e sem repeticao — para o `IN` da consulta. */
function unicos(ids: readonly (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null && id !== ""))];
}

/**
 * Confere que cliente, vendedor, prazo e forma de pagamento existem.
 *
 * Os itens NAO sao conferidos aqui: `resolverLinhas` ja valida produto e
 * servico, e a unica linha com `productId` e `serviceId` nulos — que o schema
 * rejeita — nunca chega a esta funcao. Checaria os mesmos IDs duas vezes.
 */
async function verificarReferencias(scope: TenantScope, entrada: DadosVenda): Promise<void> {
  await withTenantDb(scope, async (db) => {
    if (entrada.clienteId !== null) {
      const cliente = await db.customer.findFirst({
        where: { id: entrada.clienteId, deletedAt: null },
        select: { id: true },
      });
      if (!cliente) throw new AppError(ErrorCode.VALIDATION_FAILED, "Cliente nao encontrado.");
    }
    if (entrada.vendedorId !== null) {
      // `status: "ATIVO"`, e nao so `id`: um usuario bloqueado nao pode virar o
      // vendedor de uma venda nova, e o select do formulario ja filtra por
      // status — mas o select e uma foto de quando a tela abriu, e a confirmacao
      // pode acontecer minutos depois.
      const vendedor = await db.user.findFirst({
        where: { id: entrada.vendedorId, status: "ATIVO" },
        select: { id: true },
      });
      if (!vendedor) throw new AppError(ErrorCode.VALIDATION_FAILED, "Vendedor nao encontrado ou inativo.");
    }
    if (entrada.paymentTermsId !== null) {
      const termos = await db.paymentTerms.findFirst({
        where: { id: entrada.paymentTermsId, deletedAt: null, active: true },
        select: { id: true },
      });
      if (!termos) throw new AppError(ErrorCode.VALIDATION_FAILED, "Condicao de pagamento nao encontrada.");
    }
    if (entrada.paymentMethodId !== null) {
      const forma = await db.paymentMethod.findFirst({
        where: { id: entrada.paymentMethodId, deletedAt: null, active: true },
        select: { id: true },
      });
      if (!forma) throw new AppError(ErrorCode.VALIDATION_FAILED, "Forma de pagamento nao encontrada.");
    }

  });
}



function paraCalculo(linhas: readonly LinhaResolvida[]) {
  return linhas.map((linha) => ({
    indice: linha.indice,
    productId: linha.productId,
    serviceId: linha.serviceId,
    description: linha.description,
    quantity: linha.quantity,
    unitPrice: linha.unitPrice,
    discountAmount: linha.discountAmount,
    unitCost: linha.unitCost,
  }));
}

/**
 * As linhas para `sale_items.create`.
 *
 * Sai de `calculo.itens` e nao de `linhas`: `ItemCalculado` ja tem tudo que o
 * banco precisa, e percorrer os dois arrays em paralelo exigiria casar as
 * posicoes na mao. `indice` viaja dentro do proprio item justamente para isso
 * nao depender de ordem.
 *
 * `tenantId` vem do contexto e nao do item: `SaleItem` tem `tenantId` proprio
 * (o `tenant-guard` nao preenche coluna de filho automaticamente) e um item de
 * venda sem tenant fica invisivel para toda consulta que filtra por ele.
 *
 * `unitCost` e `costAmount` vao zero: so a confirmacao congela o custo, com o
 * valor do `averageCost` no momento em que o estoque sai.
 */
function paraItens(tenantId: string, calculo: VendaCalculada) {
  return calculo.itens.map((item) => ({
    tenantId,
    productId: item.productId,
    serviceId: item.serviceId,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    taxPercent: item.taxPercent,
    taxAmount: item.taxAmount,
    grossTaxAmount: item.grossTaxAmount,
    total: item.total,
    unitCost: toQuantity(0),
    costAmount: toMoney(0),
    sortOrder: item.indice,
  }));
}

/**
 * Os valores do formulario, para a tela repopular depois de um erro.
 *
 * `itens` ENTRA aqui, serializado como JSON — o mesmo formato que o formulario
 * envia. Sem ele, um erro de confirmacao (estoque insuficiente, cliente
 * removido) devolvia a tela com o cabecalho preenchido e a tabela de itens VAZIA:
 * a pessoa perdia a venda inteira por causa de um erro de estoque. O
 * `formulario-venda` le `itens` do estado de erro com o mesmo parse que usa no
 * `FormData`, entao os dois caminhos tem um formato so.
 */
function valoresDe(entrada: DadosVenda): Record<string, string | undefined> {
  return {
    clienteId: entrada.clienteId ?? undefined,
    vendedorId: entrada.vendedorId ?? undefined,
    paymentTermsId: entrada.paymentTermsId ?? undefined,
    paymentMethodId: entrada.paymentMethodId ?? undefined,
    tipo: entrada.tipo,
    canal: entrada.canal,
    data: entrada.data?.toISOString().slice(0, 10),
    desconto: entrada.desconto.toString(),
    frete: entrada.frete.toString(),
    observacoes: entrada.observacoes ?? undefined,
    observacoesInternas: entrada.observacoesInternas ?? undefined,
    itens: JSON.stringify(
      entrada.itens.map((item) => ({
        productId: item.productId,
        serviceId: item.serviceId,
        descricao: item.descricao,
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
        desconto: item.desconto,
      })),
    ),
  };
}

function opcional(valor: FormDataEntryValue | null): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/**
 * Log da falha, no nivel certo para cada tipo.
 *
 * `EstoqueInsuficiente` tem tratamento proprio porque e a falha ESPERADA da
 * confirmacao — duas pessoas vendendo o mesmo produto ao mesmo tempo. Ela entra
 * como `info` com o produto e o que faltava, e nao como `warn` de regra de
 * negocio: um `warn` por venda recusada enche o log com entries que ninguem vai
 * olhar, e o alerta que importaria (saldo negativo) deixaria de aparecer porque
 * todo dia tem warning.
 *
 * O `log.warn` generico continua para as regras que realmente sao erro de uso:
 * editar uma venda confirmada, cancelar uma venda devolvida, receber um
 * rascunho.
 */
function registrarFalha(erro: unknown, acao: string): void {
  if (ehEstoqueInsuficiente(erro)) {
    log("vendas").info(
      {
        acao,
        produto: erro.descricao,
        disponivel: erro.disponivel.toString(),
        pedido: erro.pedido.toString(),
      },
      "confirmacao recusada por saldo insuficiente",
    );
    return;
  }
  if (isAppError(erro)) {
    log("vendas").warn({ code: erro.code, acao }, "regra de negocio bloqueou a operacao");
    return;
  }
  log("vendas").error({ erro }, "falha inesperada em venda");
}
