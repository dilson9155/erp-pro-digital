/**
 * Bridge de autenticação — apenas Actions e Tipos.
 *
 * Actions podem ser importadas por Client Components (forms) e Server Components.
 * Queries NÃO estão aqui — Server Components importam de "./queries" direto.
 */

export * from "./actions";
export * from "./actions/login";
export * from "./actions/trocar-senha";
export type { VinculoEmpresa } from "@/server/auth/membership";
export type { ContextoAcesso, ContextoSessao, DecisaoAcesso, MotivoNegativa } from "@/server/auth/policy";