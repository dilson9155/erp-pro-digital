import { BrazilState, PersonType } from "@/generated/prisma/enums";
import type { CampoSpec } from "@/components/formulario";

import type { FornecedorDetalhe } from "./queries";

/**
 * Spec dos campos de fornecedor.
 *
 * A MESMA ORDEM DO CLIENTE, com uma secao a mais: dados bancarios e PIX, que
 * so existem aqui. Inverter a ordem por especificidade (banco primeiro) faria a
 * tela de cliente e a de fornecedor divergirem no comeco, e quem alterna entre
 * as duas perde o lugar do mouse.
 *
 * POR QUE A CHAVE PIX NAO E VALIDADA
 *
 * A chave aceita cinco formatos (CPF, CNPJ, telefone, email e chave
 * aleatoria). Um validador no schema teria de adivinhar qual a pessoa escolheu,
 * e errar nas duas direcoes: recusar a chave valida e deixar passar a invalida.
 * A coluna e `VarChar(140)`, o dado de destino do pagamento, e quem envia e o
 * modulo financeiro, que conhece o tipo escolhido na hora de pagar. Por isso o
 * campo de `tipoChavePix` existe ao lado: a combinacao e que o modulo usa.
 */

/** As 27 UFs, para o `<select>` de estado. */
export const OPCOES_UF: readonly { readonly value: BrazilState; readonly rotulo: string }[] =
  (Object.values(BrazilState) as readonly BrazilState[]).map((uf) => ({ value: uf, rotulo: uf }));

/** Tipos de chave PIX, para o `<select>`. A lista e do BACEN, nao uma escolha nossa. */
export const OPCOES_TIPO_CHAVE_PIX: readonly { readonly value: string; readonly rotulo: string }[] = [
  { value: "CPF", rotulo: "CPF" },
  { value: "CNPJ", rotulo: "CNPJ" },
  { value: "TELEFONE", rotulo: "Telefone" },
  { value: "EMAIL", rotulo: "Email" },
  { value: "ALEATORIA", rotulo: "Chave aleatoria" },
];

/** Rotulo de `PersonType` para exibicao na listagem. */
export const ROTULO_TIPO_PESSOA: Record<string, string> = {
  [PersonType.FISICA]: "Pessoa fisica",
  [PersonType.JURIDICA]: "Pessoa juridica",
};

export function camposFornecedor(): readonly CampoSpec[] {
  return [
    // ---- Identificacao ----------------------------------------------------
    {
      nome: "personType",
      rotulo: "Tipo",
      tipo: "select",
      obrigatorio: true,
      // O padrao e JURIDICA aqui, e FISICA no cliente: quem compra mercadoria
      // quase sempre e empresa. O campo continua disponivel para o fornecedor
      // que e MEI ou produtor rural, com CPF.
      defaultValue: PersonType.JURIDICA,
      secao: "Identificacao",
      ajudaSecao: "O tipo define qual documento e valido: CPF para fisica, CNPJ para juridica.",
      opcoes: [
        { value: PersonType.FISICA, rotulo: "Pessoa fisica" },
        { value: PersonType.JURIDICA, rotulo: "Pessoa juridica" },
      ],
    },
    {
      nome: "nome",
      rotulo: "Razao social / Nome",
      tipo: "texto",
      obrigatorio: true,
      maxLength: 180,
      secao: "Identificacao",
      ajuda: "Para juridica, o nome completo como esta no CNPJ.",
    },
    {
      nome: "nomeFantasia",
      rotulo: "Nome fantasia",
      tipo: "texto",
      maxLength: 180,
      secao: "Identificacao",
      ajuda: "Opcional. Como o fornecedor e chamado no dia a dia.",
    },
    {
      nome: "documento",
      rotulo: "CNPJ ou CPF",
      tipo: "texto",
      obrigatorio: true,
      maxLength: 18,
      autoComplete: "off",
      secao: "Identificacao",
      ajuda: "Com ou sem pontos. O digito verificador e conferido ao salvar.",
    },
    {
      nome: "nomeContato",
      rotulo: "Pessoa de contato",
      tipo: "texto",
      maxLength: 120,
      secao: "Identificacao",
      ajuda: "Quem a empresa liga para pedir mercadoria.",
    },

    // ---- Contato ----------------------------------------------------------
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
      ajudaSecao: "Endereco de entrega da mercadoria, quando for diferente do fiscal.",
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
      ajudaSecao: "So quem recebe NFe precisa. Deixe vazio ate o contador definir.",
    },
    { nome: "inscricaoMunicipal", rotulo: "Inscricao municipal", tipo: "texto", maxLength: 20, secao: "Fiscal" },
    {
      nome: "documentoBruto",
      rotulo: "Documento do XML divergente",
      tipo: "texto",
      maxLength: 20,
      secao: "Fiscal",
      ajuda: "Opcional. Guardado quando o XML traz documento diferente do CNPJ/CPF, para resolver depois.",
    },

    // ---- Pagamento --------------------------------------------------------
    {
      nome: "tipoChavePix",
      rotulo: "Tipo de chave PIX",
      tipo: "select",
      placeholder: "Nao informado",
      secao: "Pagamento",
      ajudaSecao: "PIX e o caminho mais comum. Os dados bancarios entram so se a empresa ainda paga por boleto.",
    },
    { nome: "chavePix", rotulo: "Chave PIX", tipo: "texto", maxLength: 140, secao: "Pagamento" },
    { nome: "banco", rotulo: "Banco", tipo: "texto", maxLength: 80, secao: "Pagamento" },
    { nome: "codigoBanco", rotulo: "Codigo do banco", tipo: "texto", maxLength: 10, secao: "Pagamento" },
    { nome: "agencia", rotulo: "Agencia", tipo: "texto", maxLength: 20, secao: "Pagamento" },
    { nome: "digitoAgencia", rotulo: "Digito da agencia", tipo: "texto", maxLength: 4, secao: "Pagamento" },
    { nome: "conta", rotulo: "Conta", tipo: "texto", maxLength: 30, secao: "Pagamento" },
    { nome: "digitoConta", rotulo: "Digito da conta", tipo: "texto", maxLength: 4, secao: "Pagamento" },

    // ---- Geral ------------------------------------------------------------
    {
      nome: "observacoes",
      rotulo: "Observacoes",
      tipo: "area",
      rows: 3,
      maxLength: 2000,
      secao: "Geral",
      ajuda: "Uso interno. O prazo medio de entrega e calculado a partir das compras.",
    },
    {
      nome: "ativo",
      rotulo: "Fornecedor ativo",
      tipo: "checkbox",
      defaultValue: "on",
      secao: "Geral",
      ajuda: "Inativo some da lista de compra, mas o historico continua.",
    },
  ];
}

/**
 * Fornecedor gravado -> valores do formulario.
 *
 * Simetria com `valoresDe`, em `fornecedores/actions.ts`: os dois precisam
 * concordar sobre o formato do texto, ou a proxima submissao reprova.
 *
 * Nao ha numero neste objeto: fornecedor nao tem limite de credito nem saldo em
 * aberto editavel. `totalPurchased` e `averageLeadTimeDays` sao derivados, e
 * aparecem na tela como leitura, nunca como campo.
 */
export function valoresDoFornecedor(fornecedor: FornecedorDetalhe): Record<string, string> {
  return {
    personType: fornecedor.personType,
    nome: fornecedor.name,
    nomeFantasia: fornecedor.tradeName ?? "",
    documento: formatarDocumento(fornecedor.cpf, fornecedor.cnpj),
    nomeContato: fornecedor.contactName ?? "",
    email: fornecedor.email ?? "",
    telefone: fornecedor.phone ?? "",
    whatsapp: fornecedor.whatsapp ?? "",
    cep: formatarCep(fornecedor.zipCode),
    logradouro: fornecedor.street ?? "",
    numero: fornecedor.streetNumber ?? "",
    complemento: fornecedor.streetComplement ?? "",
    bairro: fornecedor.district ?? "",
    cidade: fornecedor.city ?? "",
    uf: fornecedor.state ?? "",
    inscricaoEstadual: fornecedor.stateRegistration ?? "",
    inscricaoMunicipal: fornecedor.municipalRegistration ?? "",
    documentoBruto: fornecedor.documentRaw ?? "",
    tipoChavePix: fornecedor.pixKeyType ?? "",
    chavePix: fornecedor.pixKey ?? "",
    banco: fornecedor.bankName ?? "",
    codigoBanco: fornecedor.bankCode ?? "",
    agencia: fornecedor.agency ?? "",
    digitoAgencia: fornecedor.agencyDigit ?? "",
    conta: fornecedor.accountNumber ?? "",
    digitoConta: fornecedor.accountDigit ?? "",
    observacoes: fornecedor.notes ?? "",
    ativo: fornecedor.active ? "on" : "",
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
