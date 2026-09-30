"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppError, ErrorCode, isAppError } from "@/lib/errors";
import type { EstadoFormulario } from "@/lib/formulario";
import { log } from "@/lib/logger";
import { decimalParaCampo } from "@/lib/zod-dinheiro";
import { requirePermission } from "@/server/auth/rbac";
import { obterContextoOperacao } from "@/server/app/sessao";
import { erroDeRegra, estadoDeErro, validarFormulario } from "@/server/app/validacao";
import { schemaProduto, type DadosProduto } from "@/server/app/produtos/schema";
import { linhaDeMesmoSku } from "@/server/app/produtos/queries";
import { decidirUnicidade } from "@/server/app/unicidade";
import { withTenantDb } from "@/server/db/scoped";

/**
 * Server Actions de produto.
 *
 * O que difere dos outros tres cadastros:
 *
 * 1. O SKU e a chave de unicidade, e nao o nome. Duas mercadorias com o mesmo
 *    nome sao coisas diferentes ("Borracha 3/4" e "Borracha 1/2"); dois produtos
 *    com o mesmo SKU sao o mesmo produto. E o `@@unique([tenantId, sku])` nao
 *    aceita `null`, ao contrario do nome de marca — o SKU e obrigatorio, e o
 *    schema faz isso explicito.
 *
 * 2. As relacoes opcionais (categoria, marca) e a obrigatoria (unidade) sao
 *    validadas contra o banco. O Zod garante que o campo nao esta vazio; ele
 *    NAO garante que o id existe. Um `categoriaId` inventado violaria a FK e a
 *    excecao viraria tela branca, entao a checagem e antes.
 *
 * 3. Nenhum campo derivado e aceito do formulario. `totalStock`,
 *    `currentStock`, `averageCost` e `reservedStock` nao aparecem em
 *    `paraAtualizacao`: sao mantidos por movimentacao de estoque, e aceitar o
 *    valor digitado criaria dois-competitive truths — o estoque mostraria um
 *    numero que o saldo real nao confirma.
 */

const LISTAGEM = "/cadastros/produtos";

export async function criarProduto(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "produto", acao: "create" });

  const validacao = validarFormulario(schemaProduto, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  const decisao = decidirUnicidade(await linhaDeMesmoSku(ctx.scope, entrada.sku));
  if (decisao.tipo === "duplicado") {
    return erroDeRegra("Ja existe um produto com este codigo (SKU).", "sku", valoresDe(entrada));
  }

  const problema = await conferirRelacoes(ctx.scope, entrada);
  if (problema) return erroDeRegra(problema.mensagem, problema.campo, valoresDe(entrada));

  try {
    await withTenantDb(ctx.scope, async (db) => {
      if (decisao.tipo === "restaurar") {
        // `deletedAt: null` nao pode faltar: sem ele a linha volta com os dados
        // novos mas continua filtrada por `deletedAt: null` em toda consulta, e
        // quem recadastrou o SKU recebe uma tela de sucesso sem resultado.
        await db.product.update({
          where: { id: decisao.id },
          data: { ...paraAtualizacao(entrada), deletedAt: null },
        });
        return;
      }
      await db.product.create({ data: paraCriacao(entrada, ctx.tenantId) });
    });
  } catch (erro) {
    registrarFalha(erro, "criar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  revalidatePath("/cadastros");
  redirect(LISTAGEM);
}

export async function atualizarProduto(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "produto", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Registro nao informado.");

  const validacao = validarFormulario(schemaProduto, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  const decisao = decidirUnicidade(await linhaDeMesmoSku(ctx.scope, entrada.sku, id));
  if (decisao.tipo === "duplicado") {
    return erroDeRegra(
      "Ja existe outro produto com este codigo (SKU).",
      "sku",
      valoresDe(entrada),
    );
  }

  const problema = await conferirRelacoes(ctx.scope, entrada);
  if (problema) return erroDeRegra(problema.mensagem, problema.campo, valoresDe(entrada));

  try {
    await withTenantDb(ctx.scope, async (db) => {
      const existente = await db.product.findFirst({ where: { id, deletedAt: null } });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Produto nao encontrado.");
      await db.product.update({ where: { id }, data: paraAtualizacao(entrada) });
    });
  } catch (erro) {
    registrarFalha(erro, "atualizar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  revalidatePath("/cadastros");
  redirect(LISTAGEM);
}

/**
 * Exclusao logica.
 *
 * produto que ja foi vendido NAO pode ser excluido de verdade — e nem logica sem
 * cuidado: `SaleItem` guarda `productId`, e apagar a linha deixaria o item de
 * venda sem nome para o relatorio. Este bloco, por isso, so bloqueia; quem tem
 * venda registrada recebe a instrucao de desativar, que preserva o historico e
 * some o produto da lista de venda.
 */
export async function excluirProduto(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "produto", acao: "delete" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Registro nao informado.");

  try {
    await withTenantDb(ctx.scope, async (db) => {
      const existente = await db.product.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { saleItems: true, stockMovements: true } } },
      });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Produto nao encontrado.");

      if (existente._count.saleItems > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Produto com vendas registradas. Desative em vez de excluir.",
        );
      }

      if (existente._count.stockMovements > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Produto com movimentacao de estoque. Desative em vez de excluir.",
        );
      }

      await db.product.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    });
  } catch (erro) {
    registrarFalha(erro, "excluir");
    return estadoDeErro(erro);
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}

export async function alternarAtividadeProduto(dados: FormData): Promise<void> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "produto", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return;

  await withTenantDb(ctx.scope, async (db) => {
    const existente = await db.product.findFirst({ where: { id, deletedAt: null } });
    if (!existente) return;
    await db.product.update({ where: { id }, data: { active: !existente.active } });
  });

  revalidatePath(LISTAGEM);
}

/**
 * Confere se as relacoes informadas existem.
 *
 * `unidadeId` e `NOT NULL` com `onDelete: Restrict`, entao um id invalido aqui
 * vira `P2003` do Postgres — que, sozinha, aparece como "Nao foi possivel
 * concluir a operacao". A mensagem boa ("a unidade informada nao existe") so
 * aparece se a consulta vier antes.
 *
 * Todas as tres buscas rodam em `Promise.all` porque sao independentes, e
 * `withTenantDb` ja garante o escopo de tenant em cada uma.
 */
async function conferirRelacoes(
  scope: Parameters<typeof withTenantDb>[0],
  entrada: DadosProduto,
): Promise<{ readonly mensagem: string; readonly campo: string } | null> {
  const [unidade, categoria, marca] = await withTenantDb(scope, async (db) =>
    Promise.all([
      db.unit.findFirst({
        where: { id: entrada.unidadeId, deletedAt: null },
        select: { id: true },
      }),
      entrada.categoriaId
        ? db.category.findFirst({
            where: { id: entrada.categoriaId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve(null),
      entrada.marcaId
        ? db.brand.findFirst({ where: { id: entrada.marcaId, deletedAt: null }, select: { id: true } })
        : Promise.resolve(null),
    ]),
  );

  if (!unidade) {
    return { mensagem: "A unidade de medida informada nao existe.", campo: "unidadeId" };
  }
  if (entrada.categoriaId && !categoria) {
    return { mensagem: "A categoria informada nao existe.", campo: "categoriaId" };
  }
  if (entrada.marcaId && !marca) {
    return { mensagem: "A marca informada nao existe.", campo: "marcaId" };
  }
  return null;
}

function paraCriacao(entrada: DadosProduto, tenantId: string) {
  return { tenantId, ...paraAtualizacao(entrada) };
}

/**
 * Mapeamento para o Prisma.
 *
 * A SEPARACAO ENTRE O QUE A PESSOA DIGITA E O QUE O SISTEMA CALCULA E O
 * heart deste arquivo. Aqui so entram campos digitados; `totalStock`,
 * `currentStock`, `reservedStock`, `averageCost` e `lastPurchasePrice` ficam de
 * fora de proposito, e cada um deles pertence a um job de movimentacao.
 *
 * `stockCostMethod` nao entra por escolha de produto: o default do banco
 * (`MEDIA_MOVIMENTACAO`) e o metodo que a maioria dos erps brasileiro usa, e
 * oferecer PEPS/UEPS aqui sem a tela de configuracao que explica a diferenca
 * seria um campo que a pessoa marca sem saber o que esta escolhendo.
 */
function paraAtualizacao(entrada: DadosProduto) {
  return {
    sku: entrada.sku,
    barcode: entrada.barcode ?? null,
    name: entrada.nome,
    description: entrada.descricao ?? null,
    type: entrada.tipo,
    unitId: entrada.unidadeId,
    categoryId: entrada.categoriaId ?? null,
    brandId: entrada.marcaId ?? null,
    unitPrice: entrada.precoVenda,
    targetMarginPercent: entrada.margemAlvoPercent,
    minStock: entrada.estoqueMinimo,
    maxStock: entrada.estoqueMaximo,
    allowNegativeStock: entrada.permitirNegativo,
    negativeStockBehavior: entrada.comportamentoNegativo,
    weightKg: entrada.pesoKg,
    lengthM: entrada.comprimentoM,
    widthM: entrada.larguraM,
    heightM: entrada.alturaM,
    trackBatch: entrada.rastrearLote,
    trackSerialNumber: entrada.rastrearSerie,
    trackExpiryDate: entrada.rastrearValidade,
    ncmCode: entrada.ncmCode ?? null,
    cestCode: entrada.cestCode ?? null,
    productOrigin: entrada.origem,
    icmsTaxCode: entrada.icmsTaxCode ?? null,
    nationalTaxPercent: entrada.tributacaoFederalPercent,
    importTaxPercent: entrada.importacaoPercent,
    icmsStMvaPercent: entrada.icmsStMvaPercent,
    icmsStFraction: entrada.aliquotaSt,
    active: entrada.ativo,
  };
}

/**
 * Valores que voltam ao formulario quando o servidor recusa.
 *
 * `precoVenda` e as quantities voltam como TEXTO em pt-BR, via
 * `decimalParaCampo`. Nao se pode devolver o `Decimal` cru: o `<input type="text">`
 * mostraria "1234.56" para quem digitou "1.234,56", e a proxima submissao
 * passaria pelo `PADRAO_NUMERO` como numero americano e falharia.
 */
function valoresDe(entrada: DadosProduto): Record<string, string | undefined> {
  return {
    sku: entrada.sku,
    barcode: entrada.barcode ?? "",
    nome: entrada.nome,
    descricao: entrada.descricao ?? "",
    tipo: entrada.tipo,
    unidadeId: entrada.unidadeId,
    categoriaId: entrada.categoriaId ?? "",
    marcaId: entrada.marcaId ?? "",
    precoVenda: decimalParaCampo(entrada.precoVenda),
    margemAlvoPercent: decimalParaCampo(entrada.margemAlvoPercent),
    estoqueMinimo: decimalParaCampo(entrada.estoqueMinimo),
    estoqueMaximo: decimalParaCampo(entrada.estoqueMaximo),
    permitirNegativo: entrada.permitirNegativo ? "on" : "",
    comportamentoNegativo: entrada.comportamentoNegativo,
    pesoKg: decimalParaCampo(entrada.pesoKg),
    comprimentoM: decimalParaCampo(entrada.comprimentoM),
    larguraM: decimalParaCampo(entrada.larguraM),
    alturaM: decimalParaCampo(entrada.alturaM),
    rastrearLote: entrada.rastrearLote ? "on" : "",
    rastrearSerie: entrada.rastrearSerie ? "on" : "",
    rastrearValidade: entrada.rastrearValidade ? "on" : "",
    ncmCode: entrada.ncmCode ?? "",
    cestCode: entrada.cestCode ?? "",
    origem: entrada.origem ?? "",
    icmsTaxCode: entrada.icmsTaxCode ?? "",
    tributacaoFederalPercent: decimalParaCampo(entrada.tributacaoFederalPercent),
    importacaoPercent: decimalParaCampo(entrada.importacaoPercent),
    icmsStMvaPercent: decimalParaCampo(entrada.icmsStMvaPercent),
    aliquotaSt: String(entrada.aliquotaSt),
    ativo: entrada.ativo ? "on" : "",
  };
}

function registrarFalha(erro: unknown, acao: string): void {
  if (isAppError(erro)) {
    log("produtos").warn({ code: erro.code, acao }, "regra de negocio bloqueou a operacao");
    return;
  }
  log("produtos").error({ erro }, "falha inesperada em produto");
}
