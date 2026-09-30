"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppError, ErrorCode, isAppError } from "@/lib/errors";
import type { EstadoFormulario } from "@/lib/formulario";
import { log } from "@/lib/logger";
import { somenteDigitos } from "@/lib/documento";
import { requirePermission } from "@/server/auth/rbac";
import { obterContextoOperacao } from "@/server/app/sessao";
import { erroDeRegra, estadoDeErro, validarFormulario } from "@/server/app/validacao";
import {
  colunasDocumento,
  schemaFornecedor,
  type DadosFornecedor,
} from "@/server/app/pessoas/schema";
import { linhaDeMesmoDocumento } from "@/server/app/fornecedores/queries";
import { decidirUnicidade } from "@/server/app/unicidade";
import { withTenantDb } from "@/server/db/scoped";

/**
 * Server Actions de fornecedor.
 *
 * Mesma ordem de chegadas de `clientes/actions.ts` — contexto, permissao,
 * validacao, unicidade, escrita — e as mesmas duas regras com nomes diferentes:
 *
 * 1. A chave de unicidade e o DOCUMENTO. Duas empresas com o mesmo nome fazem
 *    compra de materiais diferentes; duas com o mesmo CNPJ sao a mesma empresa,
 *    e o `@@unique([tenantId, cnpj])` existe para isso.
 *
 * 2. A exclusao e bloqueada quando ha compra registrada. `Purchase`,
 *    `Invoice` e `AccountsPayable` guardam `supplierId`: apagar deixaria o
 *    historico de compra e a conta a pagar sem contraparte. A saida e desativar.
 *
 * A diferenca estrutural e `averageLeadTimeDays`, que e o UNICO derivado que
 * aparece na tela de edicao: e media de calculo, nao e digitado por ninguem, e
 * quem cadastra fornecedor consulta para negociar prazo.
 */

const LISTAGEM = "/cadastros/fornecedores";

export async function criarFornecedor(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "FORNECEDORES", recurso: "fornecedor", acao: "create" });

  const validacao = validarFormulario(schemaFornecedor, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  const decisao = decidirUnicidade(
    await linhaDeMesmoDocumento(ctx.scope, entrada.personType, entrada.documento),
  );
  if (decisao.tipo === "duplicado") {
    return erroDeRegra("Ja existe um fornecedor com este CPF/CNPJ.", "documento", valoresDe(entrada));
  }

  try {
    await withTenantDb(ctx.scope, async (db) => {
      if (decisao.tipo === "restaurar") {
        // `deletedAt: null` e obrigatorio. Sem ele a linha volta gravada e
        // continua invisivel para toda consulta que filtra `deletedAt: null`, e a
        // acao termina com tela de sucesso sem fornecedor na lista.
        await db.supplier.update({
          where: { id: decisao.id },
          data: { ...paraAtualizacao(entrada), deletedAt: null },
        });
        return;
      }
      await db.supplier.create({ data: paraCriacao(entrada, ctx.tenantId) });
    });
  } catch (erro) {
    registrarFalha(erro, "criar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  revalidatePath("/cadastros");
  redirect(LISTAGEM);
}

export async function atualizarFornecedor(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "FORNECEDORES", recurso: "fornecedor", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Registro nao informado.");

  const validacao = validarFormulario(schemaFornecedor, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  const decisao = decidirUnicidade(
    await linhaDeMesmoDocumento(ctx.scope, entrada.personType, entrada.documento, id),
  );
  if (decisao.tipo === "duplicado") {
    return erroDeRegra("Ja existe outro fornecedor com este CPF/CNPJ.", "documento", valoresDe(entrada));
  }

  try {
    await withTenantDb(ctx.scope, async (db) => {
      const existente = await db.supplier.findFirst({ where: { id, deletedAt: null } });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Fornecedor nao encontrado.");
      await db.supplier.update({ where: { id }, data: paraAtualizacao(entrada) });
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
 * Exclusao logica, bloqueada quando ha historico.
 *
 * Um fornecedor com compra registrada, nota emitida ou conta a pagar em aberto
 * NAO pode ser excluido: as tres tabelas referenciam `supplierId`. Desativar
 * tira o fornecedor do `<select>` de compra e mantem o historico.
 */
export async function excluirFornecedor(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "FORNECEDORES", recurso: "fornecedor", acao: "delete" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Registro nao informado.");

  try {
    await withTenantDb(ctx.scope, async (db) => {
      const existente = await db.supplier.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { purchases: true, invoices: true, accountsPayable: true } } },
      });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Fornecedor nao encontrado.");

      if (existente._count.purchases > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Fornecedor com compras registradas. Desative em vez de excluir.",
        );
      }
      if (existente._count.invoices > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Fornecedor com notas fiscais emitidas. Desative em vez de excluir.",
        );
      }
      if (existente._count.accountsPayable > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Fornecedor com contas a pagar em aberto. Desative em vez de excluir.",
        );
      }

      await db.supplier.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    });
  } catch (erro) {
    registrarFalha(erro, "excluir");
    return estadoDeErro(erro);
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}

export async function alternarAtividadeFornecedor(dados: FormData): Promise<void> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "FORNECEDORES", recurso: "fornecedor", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return;

  await withTenantDb(ctx.scope, async (db) => {
    const existente = await db.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!existente) return;
    await db.supplier.update({ where: { id }, data: { active: !existente.active } });
  });

  revalidatePath(LISTAGEM);
}

function paraCriacao(entrada: DadosFornecedor, tenantId: string) {
  return { tenantId, ...paraAtualizacao(entrada) };
}

/**
 * Mapeamento para o Prisma.
 *
 * QUATRO CAMPOS FICAM DE FORA, E TODOS DERIVADOS
 *
 * `totalPurchased`, `purchaseCount`, `lastPurchaseAt` e `averageLeadTimeDays`
 * sao recalculados por job a partir de `Purchase`. Aceitar o valor digitado
 * criaria dois verdadeiros, e o pior deles e o "prazo medio zero" — que e o que
 * a tela mostraria para um fornecedor recem-cadastrado que nunca entregou, e que
 * a equipe de compras levaria a serio como "entrega no mesmo dia".
 *
 * `branchId` tambem nao entra, pelo mesmo motivo do cliente: fornecedor atende a
 * empresa, nao a filial, e o `NULL` do schema significa exatamente isso.
 */
function paraAtualizacao(entrada: DadosFornecedor) {
  return {
    personType: entrada.personType,
    name: entrada.nome,
    tradeName: entrada.nomeFantasia,
    ...colunasDocumento(entrada.personType, somenteDigitos(entrada.documento)),
    stateRegistration: entrada.inscricaoEstadual,
    municipalRegistration: entrada.inscricaoMunicipal,
    documentRaw: entrada.documentoBruto,
    contactName: entrada.nomeContato,
    email: entrada.email,
    phone: entrada.telefone,
    whatsapp: entrada.whatsapp,
    zipCode: entrada.cep,
    street: entrada.logradouro,
    streetNumber: entrada.numero,
    streetComplement: entrada.complemento,
    district: entrada.bairro,
    city: entrada.cidade,
    state: entrada.uf,
    bankName: entrada.banco,
    bankCode: entrada.codigoBanco,
    agency: entrada.agencia,
    agencyDigit: entrada.digitoAgencia,
    accountNumber: entrada.conta,
    accountDigit: entrada.digitoConta,
    pixKeyType: entrada.tipoChavePix,
    pixKey: entrada.chavePix,
    notes: entrada.observacoes,
    active: entrada.ativo,
  };
}

function valoresDe(entrada: DadosFornecedor): Record<string, string | undefined> {
  return {
    personType: entrada.personType,
    nome: entrada.nome,
    nomeFantasia: entrada.nomeFantasia ?? "",
    documento: entrada.documento,
    inscricaoEstadual: entrada.inscricaoEstadual ?? "",
    inscricaoMunicipal: entrada.inscricaoMunicipal ?? "",
    documentoBruto: entrada.documentoBruto ?? "",
    nomeContato: entrada.nomeContato ?? "",
    email: entrada.email ?? "",
    telefone: entrada.telefone ?? "",
    whatsapp: entrada.whatsapp ?? "",
    cep: entrada.cep ?? "",
    logradouro: entrada.logradouro ?? "",
    numero: entrada.numero ?? "",
    complemento: entrada.complemento ?? "",
    bairro: entrada.bairro ?? "",
    cidade: entrada.cidade ?? "",
    uf: entrada.uf ?? "",
    banco: entrada.banco ?? "",
    codigoBanco: entrada.codigoBanco ?? "",
    agencia: entrada.agencia ?? "",
    digitoAgencia: entrada.digitoAgencia ?? "",
    conta: entrada.conta ?? "",
    digitoConta: entrada.digitoConta ?? "",
    tipoChavePix: entrada.tipoChavePix ?? "",
    chavePix: entrada.chavePix ?? "",
    observacoes: entrada.observacoes ?? "",
    ativo: entrada.ativo ? "on" : "",
  };
}

function registrarFalha(erro: unknown, acao: string): void {
  if (isAppError(erro)) {
    log("fornecedores").warn({ code: erro.code, acao }, "regra de negocio bloqueou a operacao");
    return;
  }
  log("fornecedores").error({ erro }, "falha inesperada em fornecedor");
}
