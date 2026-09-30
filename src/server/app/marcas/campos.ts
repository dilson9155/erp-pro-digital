import type { CampoSpec } from "@/components/formulario";

/**
 * Spec dos campos de marca.
 *
 * `logoUrl` aparece por ultimo e depois do `ativo`, quebrando a ordem logica dos
 * outros cadastros. A ordem aqui e por probabilidade de preenchimento: nome e
 * codigo quase sempre, URL as vezes, e o checkbox no fim para nao ficar no meio
 * de dois campos de texto que a pessoa preenchera em sequencia.
 */
export const CAMPOS_MARCA: readonly CampoSpec[] = [
  {
    tipo: "texto",
    nome: "nome",
    rotulo: "Nome",
    obrigatorio: true,
    maxLength: 120,
    placeholder: "Bosch",
    ajuda: "Como a marca aparece no cadastro de produto.",
  },
  {
    tipo: "texto",
    nome: "codigo",
    rotulo: "Codigo",
    maxLength: 40,
    placeholder: "BOS-01",
    ajuda: "Opcional. Util para integracao com o sistema legado.",
  },
  {
    tipo: "checkbox",
    nome: "ativo",
    rotulo: "Marca ativa",
    defaultValue: "on",
    ajuda: "Inativa nao aparece em novos cadastros de produto.",
  },
  {
    tipo: "texto",
    nome: "logoUrl",
    rotulo: "URL do logo",
    maxLength: 500,
    largura: "cheia",
    placeholder: "https://cdn.suaempresa.com.br/logos/bosch.png",
    ajuda: "Opcional. Endereco da imagem; o sistema nao envia arquivo.",
  },
];

export function valoresDaMarca(marca: {
  name: string;
  code: string | null;
  logoUrl: string | null;
  active: boolean;
}): Record<string, string> {
  return {
    nome: marca.name,
    codigo: marca.code ?? "",
    logoUrl: marca.logoUrl ?? "",
    ativo: marca.active ? "on" : "",
  };
}
