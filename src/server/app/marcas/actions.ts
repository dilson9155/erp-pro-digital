"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppError, ErrorCode, isAppError } from "@/lib/errors";
import type { EstadoFormulario } from "@/lib/formulario";
import { log } from "@/lib/logger";
import { requirePermission } from "@/server/auth/rbac";
import { obterContextoOperacao } from "@/server/app/sessao";
import { erroDeRegra, estadoDeErro, validarFormulario } from "@/server/app/validacao";
import { schemaMarca, type DadosMarca } from "@/server/app/marcas/schema";
import { linhaDeMesmoNome } from "@/server/app/marcas/queries";
import { decidirUnicidade } from "@/server/app/unicidade";
import { withTenantDb } from "@/server/db/scoped";

/**
 * Server Actions de marca.
 *
 * O mais direto dos tres cadastros de catalogo: sem arvore, sem relacao
 * obrigatoria, sem risco de ciclo. A unica regra alem de validacao e a
 * unicidade, e ela tem o mesmo tratamento de soft-delete das outras.
 */

const LISTAGEM = "/cadastros/marcas";

export async function criarMarca(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "marca", acao: "create" });

  const validacao = validarFormulario(schemaMarca, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  const decisao = decidirUnicidade(await linhaDeMesmoNome(ctx.scope, entrada.nome));
  if (decisao.tipo === "duplicado") {
    return erroDeRegra("Ja existe uma marca com este nome.", "nome", valoresDe(entrada));
  }

  try {
    await withTenantDb(ctx.scope, async (db) => {
      if (decisao.tipo === "restaurar") {
        // `deletedAt: null` e obrigatorio aqui, e a omissao era um bug real: a
        // restauracao reescrevia nome, codigo e logo, mas deixava `deletedAt`
        // intacto. A linha voltava com os dados novos e continuava invisivel
        // para toda consulta, que filtra `deletedAt: null`. O sintoma era a
        // pessoa recadastrando a marca "outra vez" e o sistema aceitando sem
        // erro nem resultado.
        await db.brand.update({
          where: { id: decisao.id },
          data: { ...paraAtualizacao(entrada), deletedAt: null },
        });
        return;
      }
      await db.brand.create({ data: paraCriacao(entrada, ctx.tenantId) });
    });
  } catch (erro) {
    registrarFalha(erro, "criar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  revalidatePath("/cadastros");
  redirect(LISTAGEM);
}

export async function atualizarMarca(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "marca", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Registro nao informado.");

  const validacao = validarFormulario(schemaMarca, dados);
  if (!validacao.ok) return validacao.estado;
  const entrada = validacao.dados;

  const decisao = decidirUnicidade(await linhaDeMesmoNome(ctx.scope, entrada.nome, id));
  if (decisao.tipo === "duplicado") {
    return erroDeRegra("Ja existe outra marca com este nome.", "nome", valoresDe(entrada));
  }

  try {
    await withTenantDb(ctx.scope, async (db) => {
      // `findFirst` e nao `buscarMarca`: a funcao de query ja abriria um segundo
      // `withTenantDb` por dentro, e duas camadas de escopo para a mesma leitura
      // so adicionam uma transacao implicita e um ponto a mais de onde a query
      // pode falhar.
      const existente = await db.brand.findFirst({ where: { id, deletedAt: null } });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Marca nao encontrada.");
      await db.brand.update({ where: { id }, data: paraAtualizacao(entrada) });
    });
  } catch (erro) {
    registrarFalha(erro, "atualizar");
    return estadoDeErro(erro, valoresDe(entrada));
  }

  revalidatePath(LISTAGEM);
  revalidatePath("/cadastros");
  redirect(LISTAGEM);
}

export async function excluirMarca(
  _estadoAnterior: EstadoFormulario | null,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "marca", acao: "delete" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return erroDeRegra("Registro nao informado.");

  try {
    await withTenantDb(ctx.scope, async (db) => {
      const existente = await db.brand.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { products: true } } },
      });
      if (!existente) throw new AppError(ErrorCode.NOT_FOUND, "Marca nao encontrada.");

      if (existente._count.products > 0) {
        throw new AppError(
          ErrorCode.BUSINESS_RULE_VIOLATION,
          "Marca em uso por produto. Desative em vez de excluir.",
        );
      }

      await db.brand.update({
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

export async function alternarAtividadeMarca(dados: FormData): Promise<void> {
  const ctx = await obterContextoOperacao();
  await requirePermission(ctx.rbac, { modulo: "ESTOQUE", recurso: "marca", acao: "update" });

  const id = dados.get("id");
  if (typeof id !== "string" || id === "") return;

  await withTenantDb(ctx.scope, async (db) => {
    const existente = await db.brand.findFirst({ where: { id, deletedAt: null } });
    if (!existente) return;
    await db.brand.update({ where: { id }, data: { active: !existente.active } });
  });

  revalidatePath(LISTAGEM);
}

function paraCriacao(entrada: DadosMarca, tenantId: string) {
  return { tenantId, ...paraAtualizacao(entrada) };
}

function paraAtualizacao(entrada: DadosMarca) {
  return {
    name: entrada.nome,
    code: entrada.codigo,
    logoUrl: entrada.logoUrl,
    active: entrada.ativo,
  };
}

function valoresDe(entrada: DadosMarca): Record<string, string | undefined> {
  return {
    nome: entrada.nome,
    codigo: entrada.codigo ?? "",
    logoUrl: entrada.logoUrl ?? "",
    ativo: entrada.ativo ? "on" : "",
  };
}

function registrarFalha(erro: unknown, acao: string): void {
  if (isAppError(erro)) {
    log("marcas").warn({ code: erro.code, acao }, "regra de negocio bloqueou a operacao");
    return;
  }
  log("marcas").error({ erro }, "falha inesperada em marca");
}
