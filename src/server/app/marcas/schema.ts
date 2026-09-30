import { z } from "zod";

/**
 * Schema do formulario de marca.
 *
 * O mais simples dos tres cadastros de catalogo, e o unico com um campo que
 * merece discussao: `logoUrl`.
 *
 * POR QUE `logoUrl` E UM CAMPO DE TEXTO, E NAO UPLOAD
 *
 * Um `<input type="file">` com gravacao no proprio cadastro seria a solucao
 * obvia, e esta e a errada aqui por tres razoes, em ordem de importancia:
 *
 * 1. `Brand.logoUrl` e uma coluna de texto, e o schema de `Product` nao tem
 *    tabela de arquivos. Entao um upload exigiria um servico de arquivos novo
 *    (S3, ou disco local que quebra em serverless) para encher uma coluna com
 *    uma URL.
 * 2. Marca nao tem logao em 95% dos casos. A maioria das empresas que cadastram
 *    "Coca-Cola" no proprio sistema quer o texto e pronto. Um campo de upload
 *    obrigatorio em toda linha de marca seria um obstaculo para o caso comum.
 * 3. A URL so e consumida se o produto usar. A imagem vem do CDN ou do bucket
 *    da propria empresa, e quem cadastra a marca ja sabe a URL.
 *
 * O campo e opcional e validado como URL. Se a empresa quiser upload de verdade,
 * o lugar certo e a acao de produto — que ja tem `Product.imageUrl` para a mesma
 * razao — e nao um cadastro que existe para tabular 40 marcas.
 */
export const schemaMarca = z.object({
  nome: z
    .string({ error: "Informe o nome da marca" })
    .trim()
    .min(2, "Use pelo menos 2 caracteres")
    .max(120, "Use no maximo 120 caracteres"),
  codigo: z
    .string()
    .trim()
    .max(40, "Use no maximo 40 caracteres")
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  logoUrl: z
    .string()
    .trim()
    .max(500, "Use no maximo 500 caracteres")
    // So http(s). Um `javascript:` em atributo `src` de `<img>` nao executa
    // script no navegador moderno, mas o valor circula em exportacao e em
    // e-mail; aceitar esquema livre abriria a porta para `data:text/html` e
    // afins, que a revisao de seguranca de um ERP nao deve aceitar.
    .refine((valor) => valor === "" || /^https?:\/\/\S+$/i.test(valor), {
      error: "Informe uma URL completa, começando com https://",
    })
    .transform((valor) => (valor === "" ? null : valor))
    .optional(),
  ativo: z
    .union([z.boolean(), z.literal("on"), z.literal("")])
    .optional()
    .transform((valor) => valor === true || valor === "on"),
});

export type DadosMarca = z.infer<typeof schemaMarca>;
