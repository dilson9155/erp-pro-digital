"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppError, ErrorCode, isAppError } from "@/lib/errors";
import type { EstadoFormulario } from "@/lib/formulario";
import { log } from "@/lib/logger";
import { requirePermission } from "@/server/auth/rbac";
import { obterContextoOperacao } from "@/server/app/sessao";
import { erroDeRegra, estadoDeErro, validarFormulario } from "@/server/app/validacao";
import { schemaCategoria, type DadosCategoria } from "@/server/app/categorias/schema";
import {
  buscarCategoria,
  categoriaEhDescendente,
  linhaDeMesmoNome,
} from "@/server/app/categorias/queries";
import { decidirUnicidade } from "@/server/app/unicidade";
import { withTenantDb } from "@/server/db/scoped";
import type { TenantScope } from "@/server/db/tenant-scope";

/**
 * Server Actions de categoria.
 *
 * Mesma ordem de chegadas de `unidades/actions.ts`: contexto, permissao,
 * validacao, regra de negocio, escrita. A unica regra EXTRA e a anti-ciclo, e ela
 * e o que diferencia este cadastro dos outros dois: `parentId` e uma chave
 * estrangeira que pode apontar para a propria linha.
 */

const LISTAGEM = "/cadastros/categorias";

export async function criarCategoria(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "categoria", acao: "create" });

  const validacao = validarFormulario(schemaCategoria, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  const problema = await validarArvore(ctx.scope, entrada, undefined);
  if (problema) return problema;

  const decisao = decidirUnicidade(await linhaDeMesmoNome(ctx.scope, entrada.nome));
  if (decisao.tipo === "duplicado") {
    return erroDeRegra("Ja existe uma categoria com este nome.", "nome", valoresDe(entrada));
  }

  try {
    await withTenantDb(ctx.scope, async (db) => {
      if (decisao.tipo === "restaurar") {
        // `deletedAt: null` nao pode faltar. Sem ele, a linha volta gravada com
        // os dados novos e continua filtrada por `deletedAt: null` em toda
        // consulta: quem recadastrou o nome recebe tela de sucesso e nao ve a
        // categoria na lista. A coluna de unicidade continuaria ocupada nos dois
        // casos — por isso restaurar, e nao criar.
        await db.category.update({
          where: { id: decisao.id },
          data: { ...paraAtualizacao(entrada), deletedAt: null },
        });
        return;
      }
      await db.category.create({ data: paraCriacao(entrada, ctx.tenantId) });
    });
  } catch (erro) {
    registrarFalha(erro, "criar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  revalidatePath("/cadastros");
  redirect(LISTAGEM);
}

export async function atualizarCategoria(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "categoria", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Registro nao informado.");

  const validacao = validarFormulario(schemaCategoria, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  const problema = await validarArvore(ctx.scope, entrada, id);
  if (problema) return problema;

  const decisao = decidirUnicidade(await linhaDeMesmoNome(ctx.scope, entrada.nome, id));
  if (decisao.tipo === "duplicado") {
    return erroDeRegra("Ja existe outra categoria com este nome.", "nome", valoresDe(entrada));
  }

  try {
    await withTenantDb(ctx.scope, async (db) => {
      const existente = await db.category.findFirst({ where: { id, deletedAt: null } });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Categoria nao encontrada.");
      await db.category.update({ where: { id }, data: paraAtualizacao(entrada) });
    });
  } catch (erro) {
    registrarFalha(erro, "atualizar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  revalidatePath("/cadastros");
  redirect(LISTAGEM);
}

export async function excluirCategoria(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "categoria", acao: "delete" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Registro nao informado.");

  try {
    await withTenantDb(ctx.scope, async (db) => {
      const existente = await db.category.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { products: true, services: true, children: true } } },
      });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Categoria nao encontrada.");

      if (existente._count.products > 0 || existente._count.services > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Categoria em uso por produto ou servico. Desative em vez de excluir.",
        );
      }

      // Categoria com FILHA nao e um no da arvore: excluir deixaria a filha
      // apontando para uma linha invisivel, e o filtro de listagem — que
      // esconde `deletedAt` — mostraria a filha como raiz, sem o caminho. A
      // regra e: exclua a folha primeiro.
      if (existente._count.children > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Esta categoria tem subcategorias. Exclua ou mova as subcategorias primeiro.",
        );
      }

      await db.category.update({
        where: { id },
        data: { deletedAt: new Date(), active: false, parentId: null },
      });
    });
  } catch (erro) {
    registrarFalha(erro, "excluir");
    return estadoDeErro(erro);
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}

export async function alternarAtividadeCategoria(dados: FormData): Promise<void> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "categoria", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return;

  await withTenantDb(ctx.scope, async (db) => {
    const existente = await db.category.findFirst({ where: { id, deletedAt: null } });
    if (!existente) return;
    await db.category.update({ where: { id }, data: { active: !existente.active } });
  });

  revalidatePath(LISTAGEM);
}

/**
 * Regras da arvore, antes de qualquer escrita.
 *
 * Duas verificacoes, e a segunda e a que o banco nao faz por voce:
 *
 * 1. O pai TEM QUE EXISTIR. `parentId` e chave estrangeira, entao o banco
 *    recusaria com erro de FK — uma mensagem de infraestrutura para um erro de
 *    campo. Verificar antes devolve "categoria pai nao encontrada", que e
 *    acionavel.
 * 2. O pai NAO PODE SER DESCENDENTE. Nao existe FK que faca isso: `A -> B -> A`
 *    e um estado valido para o banco, e invalido para quem navega. A unica
 *    defesa e comparar a cadeia de ancestrais.
 *
 * Ambas sao verificadas mesmo quando o id do pai nao veio: um `null` e raiz, e
 * raiz e valido. O que nao e valido e pai inexistente, e a checagem 1 existe
 * para essa distincao.
 */
async function validarArvore(
  scope: TenantScope,
  entrada: DadosCategoria,
  ignorarId: string | undefined,
): Promise<EstadoFormulario | null> {
  if (entrada.categoriaPaiId === null || entrada.categoriaPaiId === undefined) return null;

  const pai = await buscarCategoria(scope, entrada.categoriaPaiId);
  if (!pai) {
    return erroDeRegra("A categoria pai informada nao existe.", "categoriaPaiId", valoresDe(entrada));
  }

  if (ignorarId && (await categoriaEhDescendente(scope, ignorarId, entrada.categoriaPaiId))) {
    return erroDeRegra(
      "A categoria pai nao pode ser uma subcategoria desta propria categoria.",
      "categoriaPaiId",
      valoresDe(entrada),
    );
  }

  return null;
}

function paraCriacao(entrada: DadosCategoria, tenantId: string) {
  return { tenantId, ...paraAtualizacao(entrada) };
}

function paraAtualizacao(entrada: DadosCategoria) {
  return {
    name: entrada.nome,
    code: entrada.codigo,
    description: entrada.descricao,
    sortOrder: entrada.ordem,
    parentId: entrada.categoriaPaiId,
    active: entrada.ativo,
  };
}

function valoresDe(entrada: DadosCategoria): Record<string, string | undefined> {
  return {
    nome: entrada.nome,
    codigo: entrada.codigo ?? "",
    descricao: entrada.descricao ?? "",
    ordem: String(entrada.ordem),
    categoriaPaiId: entrada.categoriaPaiId ?? "",
    ativo: entrada.ativo ? "on" : "",
  };
}

function registrarFalha(erro: unknown, acao: string): void {
  if (isAppError(erro)) {
    log("categorias").warn({ code: erro.code, acao }, "regra de negocio bloqueou a operacao");
    return;
  }
  log("categorias").error({ erro }, "falha inesperada em categoria");
}
