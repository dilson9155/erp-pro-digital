import { z } from "zod";

/**
 * Schema do formulario de categoria.
 *
 * `name` e `VarChar(140)` e `code` e `VarChar(40)`, e os dois limites sao
 * espelhados aqui pelo mesmo motivo da unidade: sem o `max`, o limite viria do
 * banco como falha de infraestrutura, sem campo, sem mensagem e sem a chance de
 * a pessoa entender o que digitou de errado.
 *
 * `code` e OPCIONAL no schema e opcional na interface. Duas Razoes, e a segunda
 * e a que importa:
 *
 * 1. A maioria das empresas nao usa codigo de categoria, e um campo obrigatorio
 *    vazio e uma friccao em TODA categorizacao.
 * 2. Se ele fosse obrigatorio, ninguem usaria de verdade: o primeiro chute seria
 *    "CAT-01", "CAT-02", e o campo existiria so para encher.
 *
 * Quando a empresa preenche, o codigo vira a chave de integracao com o legado e
 * com a contabilidade. Enquanto isso e opcional, e a listagem mostra quando falta.
 */
export const schemaCategoria = z.object({
  nome: z
    .string({ error: "Informe o nome da categoria" })
    .trim()
    .min(2, "Use pelo menos 2 caracteres")
    .max(140, "Use no maximo 140 caracteres"),
  codigo: z
    .string()
    .trim()
    .max(40, "Use no maximo 40 caracteres")
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  descricao: z
    .string()
    .trim()
    .max(500, "Use no maximo 500 caracteres")
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  // `z.coerce.number` aceita "5" (o que o `<input type="number">` envia) e
  // "5.0". Nao aceita "", que o Zod transformaria em 0 — e `sortOrder` e a
  // unica pagina inteira obrigatoria, entao 0 e um valor legitimo e o vazio
  // precisa continuar ausente para o schema decidir.
  ordem: z.coerce
    .number({ error: "Informe um numero" })
    .int("Use um numero inteiro")
    .min(0, "Minimo 0")
    .max(9999, "Maximo 9999")
    .optional()
    .default(0),
  // A categoria PAI e opcional e vem por `id`, nunca por nome: nome muda, id nao.
  // A lista de opcoes exclui a propria categoria e toda a sua descendencia, e
  // essa verificacao e refeita no servidor — o `<select>` e conveniencia, nao
  // controle.
  categoriaPaiId: z
    .string()
    .trim()
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  ativo: z
    .union([z.boolean(), z.literal("on"), z.literal("")])
    .optional()
    .transform((valor) => valor === true || valor === "on"),
});

export type DadosCategoria = z.infer<typeof schemaCategoria>;
