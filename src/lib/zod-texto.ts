import { z } from "zod";

/**
 * Campo de texto opcional.
 *
 * ## A REGRA: OPCIONAL TERMINA EM `null`, NUNCA EM `undefined`
 *
 * Este e o motivo de o helper existir. No `prisma`, um campo ausente do `data`
 * de um `update` significa "nao mexa neste campo", e um campo `null` significa
 * "limpe este campo". A entrada do formulario vira `undefined` de duas formas
 * — campo ausente e `""` — e em `update` as duas viravam "nao mexa". O
 * resultado e que limpar um campo era impossivel: a pessoa apagava o
 * complemento do endereco, o formulario nao acusava erro, e o endereco antigo
 * continuava no banco.
 *
 * `textoOpcional` transforma as duas formas em `null`, e a regra fica em UM
 * lugar. A repeticao de `.optional().transform(...)` em cada campo e
 * exatamente o que faz a regra ser esquecida no campo seguinte: ela passa no
 * review, funciona em todo o resto do cadastro, e quebra em um unico campo
 * quando alguem limpa o valor.
 *
 * ## POR QUE `""` VIRA `null` E NAO FICA `""`
 *
 * String vazia em `VarChar` e valor PRESENTE no banco. O campo apareceria
 * preenchido em relatorio, em filtro e em exportacao, e a distincao entre "a
 * pessoa apagou" e "a pessoa digitou nada" se perde. `null` e o estado
 * "nao informado" que o resto do sistema assume.
 */
export function textoOpcional(maximo: number, mensagem: string) {
  return z
    .string()
    .trim()
    .max(maximo, mensagem)
    // Vazio digitado vira null: string vazia em `VarChar` e valor PRESENTE, e
    // apareceria como dado preenchido em relatorio e em filtro.
    .transform((valor) => (valor === "" ? null : valor))
    .optional()
    .transform((valor) => (valor === undefined ? null : valor));
}

/** Texto livre opcional: vazio ou ausente vira `null`. */
export const TEXTO_LIVRE = textoOpcional(200, "Use no maximo 200 caracteres");

/** Campo livre longo (observacoes), com o mesmo contrato de `null`. */
export const TEXTO_LONGO = textoOpcional(2000, "Use no maximo 2000 caracteres");

/**
 * Texto limitado pela LARGURA DA COLUNA, e nao por um teto arbitrario.
 *
 * ## POR QUE O LIMITE VEM DO `schema.prisma`
 *
 * O Postgres RECUSA o insert com `value too long for type character varying(4)`,
 * e essa mensagem chega na tela como erro de servidor sem dizer qual campo.
 * Com `TEXTO_LIVRE` (200) num campo de 4, a pessoa digitava "1234" e tomava
 * erro depois de preencher o formulario inteiro — sem perder o que ja tinha
 * digitado, e sem nenhuma pista do campo culpado.
 *
 * `VarChar(n)` conta CARACTERES, nao bytes, entao o `n` do schema e o mesmo
 * limite de `textoOpcional`. A validacao fica no Zod (e nao "confiada no
 * banco") para o erro aparecer NO CAMPO, antes de perder o formulario; o banco
 * continua sendo a ultima linha, porque dado vindo de importacao ou de SQL nao
 * passa pelo Zod.
 *
 * O uso e `textoColuna(4)` no schema, com o nome da coluna no comentario. Um
 * helper por campo (`DIGITO_CONTA`, `CHAVE_PIX`, ...) seria 15 exports que
 * descolam do schema: mudar o `VarChar` e lembrar de trocar o helper certo e
 * bem mais facil de errar do que mudar o numero que esta na mesma linha do uso.
 */
export const textoColuna = (colunas: number) =>
  textoOpcional(colunas, `Use no maximo ${colunas} caracteres`);
