import { z } from "zod";

/**
 * Schema do formulario de unidade de medida.
 *
 * A coluna `name` guarda o SIMBOLO (kg, un, cx), nao o nome por extenso — e por
 * isso o limite de 8 caracteres do schema e espelhado aqui. Se deixasse passar
 * "Quilograma", o banco aceitaria (VarChar 8 nao, recusaria com erro de banco), e
 * o erro chegaria como `P2000`/violacao de tamanho, que e uma mensagem de
 * infraestrutura no lugar de um erro de campo. O `max(8)` transforma isso em
 * "Use no maximo 8 caracteres", que e acionavel.
 *
 * `casasDecimais` tem teto de 6 e nao 2. Uma unidade com 4 casas e legitima: e o
 * caso de item vendido em kg com grama, que e a `QUANTITY_SCALE` de `money.ts`.
 * Travar em 2 faria o cadastro recusar o item de padaria, e o cadastro do item de
 * padaria e a razao de a unidade existir. O que nao faz sentido e acima de 6, e
 * isso nao e Formatacao, e erro de digitacao — `Decimal` aceita ate 20 casas e
 * a divergencia entre 7 e 20 casas seria silenciosa.
 */
export const schemaUnidade = z.object({
  nome: z
    .string({ error: "Informe o simbolo da unidade" })
    .trim()
    .min(1, "Informe o simbolo da unidade")
    .max(8, "Use no maximo 8 caracteres (ex.: kg, un, cx)"),
  descricao: z
    .string()
    .trim()
    .max(80, "Use no maximo 80 caracteres")
    // Vazio e "nao informado", nao "campo obrigatorio esquecido". `.or(z.literal(""))`
    // mantem o campo opcional e evita `undefined` no banco, que gravaria NULL em
    // uma coluna que aceita texto vazio.
    .optional()
    .or(z.literal(""))
    .transform((valor) => (valor === "" ? null : valor)),
  casasDecimais: z.coerce
    .number({ error: "Informe um numero" })
    .int("Use um numero inteiro")
    .min(0, "Minimo 0 casas")
    .max(6, "Maximo 6 casas"),
  // O par marcado/desmarcado com o mesmo `name` chega aqui como "on" (marcado)
  // ou "" (desmarcado). O `boolean` entra tambem de proposito: o mesmo schema
  // pode ser usado por um importador ou por um teste, onde nao existe
  // `FormData`. Sem ele, o schema so valida entrada de formulario e ganha uma
  // segunda versao para o resto do sistema.
  //
  // `.optional()` e obrigatorio antes do `.transform()`: em Zod 4, `z.undefined()`
  // DENTRO de `z.union` nao aceita `undefined` — a union continua exigindo um
  // valor. O resultado sem ele e um erro de validacao em TODO formulario novo,
  // porque campo de checkbox ausente nunca chega.
  ativo: z
    .union([z.boolean(), z.literal("on"), z.literal("")])
    .optional()
    .transform((valor) => valor === true || valor === "on"),
});

export type DadosUnidade = z.infer<typeof schemaUnidade>;
