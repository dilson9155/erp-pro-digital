import { BrazilState, PersonType } from "@/generated/prisma/enums";
import type { CampoSpec } from "@/components/formulario";
import { decimalParaCampo } from "@/lib/zod-dinheiro";

import type { ClienteDetalhe } from "./queries";

/**
 * Spec dos campos de cliente.
 *
 * A ORDEM E POR PERCURSO DE USO, NAO POR COLUNA DO SCHEMA
 *
 * Nome e documento primeiro, porque sao os dois unicos obrigatorios e os dois que
 * a pessoa procura quando chega do telefone. Endereco vem no meio, e as
 * inscricoes fiscais por ultimo, porque so o contador preenche e so quando emite
 * nota.
 *
 * POR QUE `documento` E UM CAMPO SO E NAO `cpf` E `cnpj`
 *
 * Sao duas colunas no banco, escolhidas por `personType`, e dois campos na tela
 * dariam a impressao de que os dois sao obrigatorios. Um campo que valida
 * conforme o tipo selecionado evita a etapa de descobrir o erro por tentativa.
 *
 * POR QUE O LIMITE DE CREDITO E MOSTRADO COMO "SEM LIMITE" E NAO COMO 0,00
 *
 * O `creditLimit` e `Decimal @default(0)`, e zero significa "sem limite definido"
 * nesta tela. A distincao importa para quem cadastra: R$ 0,00 lido como "cliente
 * nao pode nada" e o oposto do que o zero significa aqui, e o efeito de bloquear
 * a venda aparece no caixa, nao no cadastro. O `ajuda` do campo diz isso.
 */

/** As 27 UFs, para o `<select>` de estado. */
export const OPCOES_UF: readonly { readonly value: BrazilState; readonly rotulo: string }[] =
  BrazilState
    ? (Object.values(BrazilState) as readonly BrazilState[]).map((uf) => ({ value: uf, rotulo: uf }))
    : [];

/** Rotulo de `PersonType` para exibicao na listagem. */
export const ROTULO_TIPO_PESSOA: Record<string, string> = {
  [PersonType.FISICA]: "Pessoa fisica",
  [PersonType.JURIDICA]: "Pessoa juridica",
};

export function camposCliente(): readonly CampoSpec[] {
  return [
    // ---- Identificacao ----------------------------------------------------
    {
      nome: "personType",
      rotulo: "Tipo",
      tipo: "select",
      obrigatorio: true,
      defaultValue: PersonType.FISICA,
      secao: "Identificacao",
      ajudaSecao: "O tipo define qual documento e valido: CPF para fisica, CNPJ para juridica.",
      opcoes: [
        { value: PersonType.FISICA, rotulo: "Pessoa fisica" },
        { value: PersonType.JURIDICA, rotulo: "Pessoa juridica" },
      ],
    },
    {
      nome: "nome",
      rotulo: "Nome / Razao social",
      tipo: "texto",
      obrigatorio: true,
      maxLength: 180,
      autoComplete: "name",
      secao: "Identificacao",
      ajuda: "Para pessoa juridica, o nome completo como esta no CNPJ.",
    },
    {
      nome: "nomeFantasia",
      rotulo: "Nome fantasia",
      tipo: "texto",
      maxLength: 180,
      secao: "Identificacao",
      ajuda: "Opcional. Como o cliente e chamado no balcao.",
    },
    {
      nome: "documento",
      rotulo: "CPF ou CNPJ",
      tipo: "texto",
      obrigatorio: true,
      maxLength: 18,
      autoComplete: "off",
      secao: "Identificacao",
      ajuda: "Com ou sem pontos. O digito verificador e conferido ao salvar.",
    },
    {
      nome: "dataNascimento",
      rotulo: "Data de nascimento",
      tipo: "data",
      secao: "Identificacao",
      ajuda: "Opcional. Usado para a curva ABC e para a faixa etaria do cliente.",
    },
    {
      nome: "email",
      rotulo: "Email",
      tipo: "texto",
      maxLength: 180,
      autoComplete: "email",
      secao: "Contato",
      ajudaSecao: "O telefone e o WhatsApp sao gravados so com digitos; a mascara e da tela.",
    },
    { nome: "telefone", rotulo: "Telefone", tipo: "texto", maxLength: 20, secao: "Contato" },
    { nome: "whatsapp", rotulo: "WhatsApp", tipo: "texto", maxLength: 20, secao: "Contato" },

    // ---- Endereco ---------------------------------------------------------
    {
      nome: "cep",
      rotulo: "CEP",
      tipo: "texto",
      maxLength: 9,
      autoComplete: "postal-code",
      secao: "Endereco",
      ajudaSecao: "Opcional: o cliente sem endereco e valido para venda no balcao.",
    },
    { nome: "logradouro", rotulo: "Logradouro", tipo: "texto", maxLength: 150, secao: "Endereco" },
    { nome: "numero", rotulo: "Numero", tipo: "texto", maxLength: 20, secao: "Endereco" },
    { nome: "complemento", rotulo: "Complemento", tipo: "texto", maxLength: 80, secao: "Endereco" },
    { nome: "bairro", rotulo: "Bairro", tipo: "texto", maxLength: 80, secao: "Endereco" },
    { nome: "cidade", rotulo: "Cidade", tipo: "texto", maxLength: 100, secao: "Endereco" },
    {
      nome: "uf",
      rotulo: "UF",
      tipo: "select",
      placeholder: "Nao informada",
      secao: "Endereco",
      opcoes: OPCOES_UF.map((uf) => ({ value: uf.value, rotulo: uf.rotulo })),
    },

    // ---- Fiscal -----------------------------------------------------------
    {
      nome: "inscricaoEstadual",
      rotulo: "Inscricao estadual",
      tipo: "texto",
      maxLength: 20,
      secao: "Fiscal",
      ajudaSecao: "So quem emite NFe precisa. Deixe vazio ate o contador definir.",
      ajuda: "Varia por UF. O mesmo CNPJ pode ter duas inscricoes.",
    },
    {
      nome: "inscricaoMunicipal",
      rotulo: "Inscricao municipal",
      tipo: "texto",
      maxLength: 20,
      secao: "Fiscal",
    },
    {
      nome: "documentoBruto",
      rotulo: "Documento do XML divergente",
      tipo: "texto",
      maxLength: 20,
      secao: "Fiscal",
      ajuda: "Opcional. Guardado quando o XML traz documento diferente do CPF/CNPJ, para resolver depois.",
    },

    // ---- Comercial --------------------------------------------------------
    {
      nome: "limiteCredito",
      rotulo: "Limite de credito",
      tipo: "moeda",
      defaultValue: "0,00",
      secao: "Comercial",
      ajudaSecao: "Consulta de quem vende, nao um bloqueio automatico: o sistema avisa quando o saldo passa do limite.",
      ajuda: "Zero = sem limite definido.",
    },
    {
      nome: "marketingConsent",
      rotulo: "Autoriza comunicacao de marketing",
      tipo: "checkbox",
      secao: "Comercial",
      ajudaSecao: "Com LGPD, o envio depende de consentimento registrado.",
      ajuda: "A data do consentimento e gravada no primeiro aceite e mantida depois.",
    },
    {
      nome: "observacoes",
      rotulo: "Observacoes",
      tipo: "area",
      rows: 3,
      maxLength: 2000,
      secao: "Comercial",
      ajuda: "Uso interno. Nao aparece em nota nem em relatorio para o cliente.",
    },
    {
      nome: "ativo",
      rotulo: "Cliente ativo",
      tipo: "checkbox",
      defaultValue: "on",
      secao: "Comercial",
      ajuda: "Inativo some da lista de venda, mas o historico continua.",
    },
  ];
}

/**
 * Cliente gravado -> valores do formulario.
 *
 * Simetria com `valoresDe`, em `clientes/actions.ts`: os dois precisam concordar
 * sobre o formato do texto, ou a proxima submissao reprova no `PADRAO_NUMERO`.
 *
 * `documento` volta MASCARADO, com os digitos por baixo. A mascara e o que a
 * pessoa le; os digitos sao o que o `transform` do schema remove de novo antes
 * de gravar. O caminho inverso — gravar a mascara — daria `cpf = "111.444.777-06"`
 * com 14 caracteres num `VarChar(11)`, truncado pelo Postgres sem aviso.
 */
export function valoresDoCliente(cliente: ClienteDetalhe): Record<string, string> {
  return {
    personType: cliente.personType,
    nome: cliente.name,
    nomeFantasia: cliente.tradeName ?? "",
    documento: formatarDocumento(cliente.cpf, cliente.cnpj),
    dataNascimento: cliente.birthDate ? cliente.birthDate.toISOString().slice(0, 10) : "",
    email: cliente.email ?? "",
    telefone: cliente.phone ?? "",
    whatsapp: cliente.whatsapp ?? "",
    cep: formatarCep(cliente.zipCode),
    logradouro: cliente.street ?? "",
    numero: cliente.streetNumber ?? "",
    complemento: cliente.streetComplement ?? "",
    bairro: cliente.district ?? "",
    cidade: cliente.city ?? "",
    uf: cliente.state ?? "",
    inscricaoEstadual: cliente.stateRegistration ?? "",
    inscricaoMunicipal: cliente.municipalRegistration ?? "",
    documentoBruto: cliente.documentRaw ?? "",
    limiteCredito: decimalParaCampo(cliente.creditLimit),
    observacoes: cliente.notes ?? "",
    // O consentimento e a UNICA-checkbox que deriva de dado persistido, e nao de
    // um campo do registro: o banco guarda a DATA. O checkbox e marcado pela
    // existencia da data, e nao por um booleao que nao existe no schema.
    marketingConsent: cliente.marketingConsentAt ? "on" : "",
    ativo: cliente.active ? "on" : "",
  };
}

function formatarDocumento(cpf: string | null, cnpj: string | null): string {
  const documento = cpf ?? cnpj ?? "";
  if (documento.length === 11) {
    return documento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (documento.length === 14) {
    return documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return documento;
}

function formatarCep(cep: string | null): string {
  if (!cep || cep.length !== 8) return cep ?? "";
  return cep.replace(/(\d{5})(\d{3})/, "$1-$2");
}
