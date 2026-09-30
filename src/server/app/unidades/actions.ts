"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppError, ErrorCode, isAppError } from "@/lib/errors";
import type { EstadoFormulario } from "@/lib/formulario";
import { requirePermission } from "@/server/auth/rbac";
import { obterContextoOperacao } from "@/server/app/sessao";
import { erroDeRegra, estadoDeErro, validarFormulario } from "@/server/app/validacao";
import { schemaUnidade, type DadosUnidade } from "@/server/app/unidades/schema";
import { linhaDeMesmoSimbolo } from "@/server/app/unidades/queries";
import { decidirUnicidade } from "@/server/app/unicidade";
import { withTenantDb } from "@/server/db/scoped";
import { log } from "@/lib/logger";

/**
 * Server Actions do cadastro de unidades de medida.
 *
 * A ORDEM DAS CHEGAGENS NESTA PAGINA E O CONTRATO INTEIRO
 *
 * 1. `obterContextoOperacao()` — quem esta operando. Falhar aqui e o certo: sem
 *    escopo, a query nao pode rodar.
 * 2. `requirePermission()` — o que esta pessoa pode fazer. Antes do Zod, e de
 *    proposito: quem nao tem permissao nao tem direito de saber se o simbolo "kg"
 *    ja existe. Inverter a ordem transformaria o cadastro num oraculo de dados
 *    para quem nao deveria ver nada.
 * 3. `validarFormulario()` — o formato da entrada.
 * 4. Regra de negocio (unicidade, em uso) — o que o Zod nao sabe.
 * 5. `withTenantDb()` — a escrita, sempre dentro do escopo.
 *
 * Trocar 2 por 3 nao quebra nada em teste e vaza informacao em producao. Por isso
 * a ordem esta escrita, e nao memorizada.
 *
 * POR QUE CADA ACTION RECONSTRUI O CONTEXTO
 *
 * `obterContextoOperacao()` e chamado de novo em cada action, e nao aproveitado
 * da pagina. A pagina e o servidor sao requisicoes diferentes, com cookies
 * diferentes; um escopo guardado em memoria do processo pertenceu a outra
 * requisicao. Reconstruir custa uma consulta reaproveitada do `cache` do React e
 * remove a unica forma de um escopo vazar entre requisicoes.
 *
 * POR QUE `estadoAnterior` E IGNORADO
 *
 * A assinatura e `(estado, FormData)` porque e o que `useActionState` exige. O
 * estado anterior nao e consultado: nao ha caso em que a action precisa saber se
 * ja falhou antes. Ele existe para a action poder ficar mais esperta no futuro sem
 * mudar a assinatura — e o que mantem `AcaoServidor` unica para todos os
 * formularios.
 */

/** Caminho da listagem, usado no `redirect` e no `revalidatePath`. */
const LISTAGEM = "/cadastros/unidades";

export async function criarUnidade(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "unidade", acao: "create" });

  const validacao = validarFormulario(schemaUnidade, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  // A decisao de unicidade e tomada UMA vez, antes da escrita. Consultar dentro
  // do `try` e consultar antes do `try` daria o mesmo resultado em caso normal,
  // mas abriria uma janela entre a consulta e a gravacao — e a unica forma de o
  // `P2002` aparecer e por concorrencia entre duas sessoes.
  const decisao = decidirUnicidade(await linhaDeMesmoSimbolo(ctx.scope, entrada.nome));
  if (decisao.tipo === "duplicado") {
    return erroDeRegra("Ja existe uma unidade com este simbolo.", "nome", valoresDe(entrada));
  }

  try {
    await withTenantDb(ctx.scope, async (db) => {
      if (decisao.tipo === "restaurar") {
        // Restaurar em vez de criar: a linha excluida continua ocupando o indice
        // unico, entao criar uma nova falharia com `P2002`. Restaurar mantem o
        // `id`, e o que apontava para ela continua valendo. Ver
        // `server/app/unicidade.ts`.
        //
        // `deletedAt: null` nao e decoracao: sem ele a atualizacao reescrevia os
        // campos e mantinha a marcacao de exclusao, e a unidade seguia
        // invisivel para as consultas que filtram `deletedAt: null`.
        await db.unit.update({
          where: { id: decisao.id },
          data: { ...paraAtualizacao(entrada), deletedAt: null },
        });
        return;
      }
      await db.unit.create({ data: paraUnidade(entrada, ctx.tenantId) });
    });
  } catch (erro) {
    registrarFalha(erro, "criar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}

/**
 * O `update` e um update simples, e o banco e quem garante a unicidade.
 *
 * Nao ha "recriar quando o simbolo muda". A tentacao existe porque o indice e
 * `(tenantId, name)` e nome e chave de negocio; mas recriar trocaria o `id`, e o
 * `id` e referenciado por `Product.unitId` e por venda ja emitida. Trocar o id de
 * uma unidade em uso quebraria o historico silenciosamente — o produto apontaria
 * para uma unidade que nao existe mais. `update` mantem o id, e o unico efeito
 * do simbolo novo e que os produtos passam a exibir ele daqui em diante.
 */
export async function atualizarUnidade(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "unidade", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") {
    return erroDeRegra("Registro nao informado.");
  }

  const validacao = validarFormulario(schemaUnidade, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  const decisao = decidirUnicidade(await linhaDeMesmoSimbolo(ctx.scope, entrada.nome, id));
  if (decisao.tipo === "duplicado") {
    return erroDeRegra("Ja existe outra unidade com este simbolo.", "nome");
  }

  try {
    await withTenantDb(ctx.scope, async (db) => {
      const existente = await db.unit.findFirst({ where: { id, deletedAt: null } });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Unidade nao encontrada.");
      await db.unit.update({ where: { id }, data: paraAtualizacao(entrada) });
    });
  } catch (erro) {
    registrarFalha(erro, "atualizar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  revalidatePath(`${LISTAGEM}/${id}`);
  redirect(LISTAGEM);
}

export async function excluirUnidade(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "unidade", acao: "delete" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") {
    return erroDeRegra("Registro nao informado.");
  }

  try {
    await withTenantDb(ctx.scope, async (db) => {
      const existente = await db.unit.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { products: true, services: true } } },
      });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Unidade nao encontrada.");

      // Excluir de verdade quebraria venda antiga, que guarda `unitId`. Entao a
      // regra e: em uso, NAO exclui — orienta a desativar. Desativar mantem o
      // historico legivel e tira a unidade dos selects de novo cadastro.
      if (existente._count.products > 0 || existente._count.services > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Unidade em uso por produto ou servico. Desative em vez de excluir.",
        );
      }

      await db.unit.update({
        where: { id },
        data: { deletedAt: new Date(), active: false },
      });
    });
  } catch (erro) {
    registrarFalha(erro, "excluir");
    return estadoDeErro(erro);
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}

/**
 * Alterna `active` sem passar pelo formulario.
 *
 * Existe separado do `atualizarUnidade` porque a operacao e um clique unico na
 * listagem e nao uma edicao: quem desativa quer o efeito imediato e nao quer ver
 * um formulario com dois campos. Reusar `atualizar` exigiria montar `FormData`
 * com os valores atuais, o que traz de volta o bug que o `atualizar` resolve —
 * a tela de edicao comecaria vazia.
 */
export async function alternarAtividadeUnidade(dados: FormData): Promise<void> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "unidade", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return;

  await withTenantDb(ctx.scope, async (db) => {
    const existente = await db.unit.findFirst({ where: { id, deletedAt: null } });
    if (!existente) return;
    await db.unit.update({ where: { id }, data: { active: !existente.active } });
  });

  revalidatePath(LISTAGEM);
}

/**
 * Dados de criacao.
 *
 * O `tenantId` e passado explicitamente E continua sendo injetado pela extensao
 * (`tenant-guard` sobrescreve o valor no `create`, sem condicao). A duplicacao e
 * deliberada, e nao esquecimento: a extensao roda em tempo de execucao e o
 * TypeScript nao ve o que ela faz, entao sem o campo o compilador exige a
 * relacao `tenant: { connect: ... }` — que daria ao chamador a ilusao de poder
 * escolher a empresa. Escrever o id do contexto aqui mantem o codigo honesto: o
 * valor vem da sessao, e a extensao garante que nem um bug aqui escape.
 */
function paraUnidade(entrada: DadosUnidade, tenantId: string) {
  return {
    tenantId,
    name: entrada.nome,
    description: entrada.descricao,
    decimalPlaces: entrada.casasDecimais,
    active: entrada.ativo,
  };
}

/**
 * Dados de atualizacao: SEM `tenantId`.
 *
 * A extensao bloqueia expressamente mover uma linha para outra empresa
 * (`assertTenantNotMoved`), entao repetir o campo aqui seria recusado. E a
 * protecao correta: em `update`, o `tenantId` nao muda nunca.
 */
function paraAtualizacao(entrada: DadosUnidade) {
  return {
    name: entrada.nome,
    description: entrada.descricao,
    decimalPlaces: entrada.casasDecimais,
    active: entrada.ativo,
  };
}

/** Valores para repopular o formulario quando o banco recusa a gravacao. */
function valoresDe(entrada: DadosUnidade): Record<string, string | undefined> {
  return {
    nome: entrada.nome,
    descricao: entrada.descricao ?? "",
    casasDecimais: String(entrada.casasDecimais),
    ativo: entrada.ativo ? "on" : "",
  };
}

/** Log de falha unexpected, para o detalhe chegar a quem pode ve-lo. */
function registrarFalha(erro: unknown, acao: string): void {
  if (isAppError(erro)) {
    log("unidades").warn({ code: erro.code, acao }, "regra de negocio bloqueou a operacao");
    return;
  }
  log("unidades").error({ erro }, "falha inesperada em unidade de medida");
}
