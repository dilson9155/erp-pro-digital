"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppError, ErrorCode, isAppError } from "@/lib/errors";
import type { EstadoFormulario } from "@/lib/formulario";
import { log } from "@/lib/logger";
import { somenteDigitos } from "@/lib/documento";
import { decimalParaCampo } from "@/lib/zod-dinheiro";
import { requirePermission } from "@/server/auth/rbac";
import { obterContextoOperacao } from "@/server/app/sessao";
import { erroDeRegra, estadoDeErro, validarFormulario } from "@/server/app/validacao";
import { schemaCliente, colunasDocumento, type DadosCliente } from "@/server/app/pessoas/schema";
import { linhaDeMesmoDocumento } from "@/server/app/clientes/queries";
import { decidirUnicidade } from "@/server/app/unicidade";
import { withTenantDb } from "@/server/db/scoped";

/**
 * Server Actions de cliente.
 *
 * O QUE DIFERE DOS CADASTROS DE CATALOGO
 *
 * 1. A chave de unicidade e o DOCUMENTO, e nao o nome. Dois clientes com o mesmo
 *    nome sao coisas diferentes — a loja tem "Maria Silva" tres vezes, e sao tres
 *    pessoas. Dois clientes com o mesmo CPF sao a MESMA pessoa, e o
 *    `@@unique([tenantId, cpf])` existe para isso. Por isso o nome passa
 *    deliberadamente sem verificacao de unicidade: barrar o segundo "Maria
 *    Silva" seria um cadastro impossivel numa loja de rua.
 *
 * 2. A exclusao e BLOQUEADA quando o cliente tem movimentacao. `Sale`,
 *    `Invoice` e `AccountsReceivable` guardam `customerId`: apagar a linha
 *    deixaria o historico sem nome para o relatorio e a conta a receber sem
 *    contraparte. A saida e desativar, que e o que preserva o historico e tira o
 *    cliente da lista de venda.
 *
 * 3. `marketingConsentAt` e uma DATA, e nao um booleano. O schema marca
 *    `marketingConsent` como checkbox e a action guarda `now()` quando marcado.
 *    Desmarcar em edicao nao apaga a data: apago seria perder a prova de que o
 *    consentimento existiu, e `ConsentLog` e justamente o registro disso.
 */

const LISTAGEM = "/cadastros/clientes";

export async function criarCliente(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "CLIENTES", recurso: "cliente", acao: "create" });

  const validacao = validarFormulario(schemaCliente, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  const decisao = decidirUnicidade(
    await linhaDeMesmoDocumento(ctx.scope, entrada.personType, entrada.documento),
  );
  if (decisao.tipo === "duplicado") {
    return erroDeRegra("Ja existe um cliente com este CPF/CNPJ.", "documento", valoresDe(entrada));
  }

  try {
    await withTenantDb(ctx.scope, async (db) => {
      if (decisao.tipo === "restaurar") {
        // `deletedAt: null` e obrigatorio: sem ele a linha volta gravada e
        // continua invisivel para toda consulta que filtra `deletedAt: null`, e
        // quem recadastrou receberia tela de sucesso sem cliente. Restaurar e
        // criar de novo sao caminhos diferentes justamente porque o
        // `@@unique([tenantId, cpf])` continua ocupado pela linha antiga.
        await db.customer.update({
          where: { id: decisao.id },
          data: { ...paraAtualizacao(entrada, null), deletedAt: null },
        });
        return;
      }
      await db.customer.create({ data: paraCriacao(entrada, ctx) });
    });
  } catch (erro) {
    registrarFalha(erro, "criar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  revalidatePath("/cadastros");
  redirect(LISTAGEM);
}

export async function atualizarCliente(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "CLIENTES", recurso: "cliente", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Registro nao informado.");

  const validacao = validarFormulario(schemaCliente, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  const decisao = decidirUnicidade(
    await linhaDeMesmoDocumento(ctx.scope, entrada.personType, entrada.documento, id),
  );
  if (decisao.tipo === "duplicado") {
    return erroDeRegra("Ja existe outro cliente com este CPF/CNPJ.", "documento", valoresDe(entrada));
  }

  try {
    await withTenantDb(ctx.scope, async (db) => {
      const existente = await db.customer.findFirst({ where: { id, deletedAt: null } });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Cliente nao encontrado.");
      await db.customer.update({ where: { id }, data: paraAtualizacao(entrada, existente) });
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
 * Um cliente com venda faturada, invoice emitida ou conta a receber em aberto NAO
 * pode ser excluido: `SaleItem` e `Invoice` referenciam `customerId`, e apagar a
 * linha deixaria o relatorio sem nome e a conta a receber sem contraparte. A
 * alternativa correta e desativar — `active: false` tira o cliente do `<select>`
 * de venda e mantem tudo o que ja foi registrado.
 */
export async function excluirCliente(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "CLIENTES", recurso: "cliente", acao: "delete" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Registro nao informado.");

  try {
    await withTenantDb(ctx.scope, async (db) => {
      const existente = await db.customer.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { sales: true, invoices: true, accountsReceivable: true } } },
      });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Cliente nao encontrado.");

      if (existente._count.sales > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Cliente com vendas registradas. Desative em vez de excluir.",
        );
      }
      if (existente._count.invoices > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Cliente com notas fiscais emitidas. Desative em vez de excluir.",
        );
      }
      if (existente._count.accountsReceivable > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Cliente com contas a receber em aberto. Desative em vez de excluir.",
        );
      }

      await db.customer.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    });
  } catch (erro) {
    registrarFalha(erro, "excluir");
    return estadoDeErro(erro);
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}

export async function alternarAtividadeCliente(dados: FormData): Promise<void> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "CLIENTES", recurso: "cliente", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return;

  await withTenantDb(ctx.scope, async (db) => {
    const existente = await db.customer.findFirst({ where: { id, deletedAt: null } });
    if (!existente) return;
    await db.customer.update({ where: { id }, data: { active: !existente.active } });
  });

  revalidatePath(LISTAGEM);
}

/**
 * `branchId` NAO entra em `paraAtualizacao`, e a ausencia e uma decisao.
 *
 * A coluna existe com o comentario "NULL = cadastro global da empresa". Cliente
 * e uma PESSOA que compra na loja, nao um estoque de uma filial: o mesmo cliente
 * compra no matriz e na loja do bairro, e vincular o cadastro a uma filial
 * obrigaria a duplicar o cadastro — com o `@@unique([tenantId, cpf])` barrando a
 * segunda via. Por isso o cadastro nasce global, o que e exatamente o que o
 * `NULL` do schema significa.
 *
 * O mesmo vale para `CountryCode`, `ibgeCode`, `addressKind` e
 * `fiscalAddressKind`: sao colunas do modelo usadas pelo modulo fiscal, que vai
 * Nautilus escrever quando existir. O formulario de cliente nao as mostra porque
 * nao ha nada a decidir aqui — quem decide e o emissor de documento, e um valor
 * inventado nesta tela seria pior que `null`.
 */
function paraCriacao(entrada: DadosCliente, ctx: { tenantId: string }) {
  return { tenantId: ctx.tenantId, ...paraAtualizacao(entrada, null) };
}

/**
 * Mapeamento para o Prisma.
 *
 * TRES CAMPOS DECIDIDOS AQUI, E NAO NO FORMULARIO
 *
 * 1. `documento` (um campo) vira `cpf` OU `cnpj`, conforme `personType`. E o que
 *    `colunasDocumento` faz, e o mesmo criterio de `linhaDeMesmoDocumento`: os
 *    dois `@@unique` sao independentes e nao se excluem, entao gravar no campo
 *    errado deixaria o documento sem indice e permitiria o mesmo cliente duas
 *    vezes.
 *
 * 2. `marketingConsent` (checkbox) vira `marketingConsentAt` (data) so quando
 *    marcado. Desmarcar em edicao nao limpa a data: `ConsentLog` registra a
 *    manifestacao, e apagar a evidencia de que o consentimento existiu seria o
 *    oposto do que a coluna existe para provar.
 *
 * 3. `totalPurchased`, `totalDebt`, `purchaseCount` e `lastPurchaseAt` NAO
 *    entram. Sao denormalizados e recalculados por job a partir de `Sale`; e
 *    aceitar o valor digitado criaria dois verdadeiros, e o pior deles e o
 *    "cliente com saldo zero" que existe porque alguem digitou zero.
 */
function paraAtualizacao(
  entrada: DadosCliente,
  existente: { readonly marketingConsentAt: Date | null } | null,
) {
  return {
    personType: entrada.personType,
    name: entrada.nome,
    tradeName: entrada.nomeFantasia,
    ...colunasDocumento(entrada.personType, somenteDigitos(entrada.documento)),
    stateRegistration: entrada.inscricaoEstadual,
    municipalRegistration: entrada.inscricaoMunicipal,
    documentRaw: entrada.documentoBruto,
    birthDate: entrada.dataNascimento,
    email: entrada.email,
    phone: entrada.telefone,
    whatsapp: entrada.whatsapp,
    marketingConsentAt: entrada.marketingConsent
      ? (existente?.marketingConsentAt ?? new Date())
      : existente?.marketingConsentAt ?? null,
    zipCode: entrada.cep,
    street: entrada.logradouro,
    streetNumber: entrada.numero,
    streetComplement: entrada.complemento,
    district: entrada.bairro,
    city: entrada.cidade,
    state: entrada.uf,
    creditLimit: entrada.limiteCredito,
    notes: entrada.observacoes,
    active: entrada.ativo,
  };
}

/**
 * Valores que voltam ao formulario quando o servidor recusa.
 *
 * `creditLimit` volta como TEXTO em pt-BR via `decimalParaCampo`: o `Decimal` cru
 * viraria "1500.00" para quem digitou "1.500,00", e a proxima submissao
 * reprovaria no `PADRAO_NUMERO`.
 */
function valoresDe(entrada: DadosCliente): Record<string, string | undefined> {
  return {
    personType: entrada.personType,
    nome: entrada.nome,
    nomeFantasia: entrada.nomeFantasia ?? "",
    documento: entrada.documento,
    inscricaoEstadual: entrada.inscricaoEstadual ?? "",
    inscricaoMunicipal: entrada.inscricaoMunicipal ?? "",
    documentoBruto: entrada.documentoBruto ?? "",
    dataNascimento: entrada.dataNascimento ? entrada.dataNascimento.toISOString().slice(0, 10) : "",
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
    limiteCredito: decimalParaCampo(entrada.limiteCredito),
    observacoes: entrada.observacoes ?? "",
    marketingConsent: entrada.marketingConsent ? "on" : "",
    ativo: entrada.ativo ? "on" : "",
  };
}

function registrarFalha(erro: unknown, acao: string): void {
  if (isAppError(erro)) {
    log("clientes").warn({ code: erro.code, acao }, "regra de negocio bloqueou a operacao");
    return;
  }
  log("clientes").error({ erro }, "falha inesperada em cliente");
}
