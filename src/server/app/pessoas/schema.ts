import { z } from "zod";

import { BrazilState, PersonType } from "@/generated/prisma/enums";
import {
  cepValido,
  cnpjValido,
  cpfValido,
  emailValido,
  somenteDigitos,
  telefoneValido,
} from "@/lib/documento";
import { zCheck, zDinheiro, zOpcional } from "@/lib/zod-dinheiro";
import { zDataOpcional } from "@/lib/zod-data";
import { TEXTO_LONGO, textoColuna, textoOpcional } from "@/lib/zod-texto";

/**
 * Schema de cliente e de fornecedor.
 *
 * POR QUE DOIS SCHEMMAS E NAO UM
 *
 * `Customer` e `Supplier` tem os mesmos campos de identificacao, contato e
 * endereco, e nao tem os mesmos campos de negocio. O cliente tem limite de
 * credito, consentimento de marketing e `totalPurchased` = quanto ele COMPROU.
 * O fornecedor tem dados bancarios, chave PIX, prazo medio de entrega e o mesmo
 * `totalPurchased` com o sentido INVERTIDO: quanto ele VENDEU para a empresa.
 *
 * `totalPurchased` com o mesmo nome e significado oposto nos dois models e a
 * razao de nao compartilhar o campo: quem le `totalPurchased` sem saber de qual
 * tabela veio inverte o sentido da conta. Um schema so forcaria um nome ambiguo
 * ou um `if` no meio dos campos.
 *
 * POR QUE O NOME DO CAMPO E EM PORTUGUES E A COLUNA EM INGLES
 *
 * `nome` e `name`, `limiteCredito` e `creditLimit`. A convencao vem do modulo de
 * produto, e ela existe por um motivo concreto: o nome do campo no schema e o
 * `name` do `<input>`, e o que a pessoa ve no HTML e o que ela preenche. Um
 * `<input name="name">` num formulario em portugues e um `name="name"` no
 * `FormData`; a traducao acontece uma vez, em `paraAtualizacao`, e e o unico
 * lugar onde os dois idiomas se encontram.
 *
 * POR QUE O DOCUMENTO E OBRIGATORIO
 *
 * `cpf` e `cnpj` sao `String?` no schema, e o Postgres NAO impede dois clientes
 * com `cpf` nulo — `null != null` num indice unico. A constraint real de um
 * cliente sem documento e a de dois clientes sem documento: sao indistinguiveis.
 * Por isso o schema exige o documento de acordo com `personType`.
 */

/**
 * `undefined` e `null` NAO SAO A MESMA COISA NO PRISMA
 *
 * Este e o ponto do arquivo, e vale a pena ler antes de mexer em qualquer campo
 * opcional abaixo.
 *
 * No `update`, `undefined` significa "NAO ALTERE ESTE CAMPO" — o Prisma omite a
 * coluna do `SET`. `null` significa "grave NULL". A primeira versao destes
 * schemas usava `.optional()` no fim e produzia `undefined` para campo ausente,
 * e o resultado era o pior tipo de bug de cadastro: apagar a agencia do
 * fornecedor, limpar a inscricao estadual do cliente, tirar o complemento do
 * endereco — a tela aceita, mostra o campo vazio, e o valor antigo continua
 * gravado. Pior, o erro so apareceria no documento fiscal, com o dado velho no
 * XML.
 *
 * Por isso TODO campo opcional aqui termina em `null`, nunca em `undefined`, e
 * `paraAtualizacao` recebe sempre `null` ou um valor. A regra e unica: a entrada
 * do formulario vira exatamente o que o banco deve ter depois do `update`.
 *
 * `textoOpcional` e a forma de garantir isso sem repetir `.optional().transform`
 * em cada campo — a repeticao e o que faz a regra ser esquecida no campo seguinte.
 */


const TELEFONE = textoOpcional(20, "Use no maximo 20 caracteres")
  .refine((valor) => valor === null || telefoneValido(valor), {
    error: "Informe um telefone com DDD valido",
  })
  // Telefone e gravado SO com digitos, porque e a coluna que a busca por numero
  // consulta e o que a mascara de tela desfarca. O `VarChar(20)` aceita a
  // mascara, entao gravar "11988887777" e "(11) 98888-7777" lado a lado seria
  // possivel — e buscaria um dos dois.
  .transform((valor) => (valor === null ? null : somenteDigitos(valor)));

const EMAIL = textoOpcional(180, "Use no maximo 180 caracteres")
  .refine((valor) => valor === null || emailValido(valor), { error: "Informe um email valido" })
  .transform((valor) => (valor?.toLowerCase() ?? null));

const CEP = textoOpcional(9, "Use no maximo 9 caracteres")
  .refine((valor) => valor === null || cepValido(valor), { error: "Informe um CEP com 8 digitos" })
  .transform((valor) => (valor === null ? null : somenteDigitos(valor)));

/**
 * `YYYY-MM-DD` do `<input type="date">` -> `Date` em UTC.
 *
 * A regra do meio-dia UTC vive em `@/lib/zod-data`, agora compartilhada com a
 * data da venda: duas copias divergiriam assim que uma delas ganhasse um
 * ajuste, e a divergencia apareceria como "o nascimento virou um dia" num
 * cadastro e "a venda e do dia anterior" em outro.
 */
const DATA = zDataOpcional;

/**
 * Documento validado por tipo de pessoa.
 *
 * O schema tem UM campo `documento` so, e a validacao acontece em
 * `superRefine` no nivel do objeto, porque a resposta depende de `personType` —
 * um campo vizinho. O Zod nao valida um campo olhando para o outro dentro de
 * `z.object`, entao a checagem vive num `superRefine` do objeto inteiro.
 *
 * Por que nao `union([cpfSchema, cnpjSchema])` nesse campo: digitar um CPF
 * valido no lugar errado produziria os dois erros de uma vez ("CPF invalido" E
 * "CNPJ deve ter 14 digitos"), e a pessoa nao saberia qual dos dois campos
 * corrigir. Aqui so o documento que faz sentido para `personType` aparece.
 *
 * `superRefine` so roda quando os campos do objeto JA passaram. `personType` tem
 * `default(FISICA)`, entao nunca falha e nunca chega `undefined` aqui.
 */
function validarDocumento(
  dados: { personType: PersonType; documento: string },
  ctx: z.RefinementCtx,
): void {
  const { personType, documento } = dados;
  const valor = somenteDigitos(documento);

  const problema = (message: string) => {
    ctx.addIssue({ code: "custom", path: ["documento"], message });
  };

  if (valor === "") {
    problema(personType === PersonType.FISICA ? "Informe o CPF" : "Informe o CNPJ");
    return;
  }

  if (personType === PersonType.FISICA) {
    if (valor.length !== 11) {
      problema("CPF deve ter 11 digitos");
    } else if (!cpfValido(valor)) {
      problema("CPF invalido. Confira os digitos.");
    }
    return;
  }

  if (valor.length !== 14) {
    problema("CNPJ deve ter 14 digitos");
  } else if (!cnpjValido(valor)) {
    problema("CNPJ invalido. Confira os digitos.");
  }
}

/**
 * Campos de endereco, compartilhados por cliente e fornecedor.
 *
 * `uf` e `zOpcional(z.enum(BrazilState))`: as 27 UFs vem do enum gerado, e
 * escrever a lista a mao foi exatamente o tipo de erro que o enum elimina.
 *
 * FALTAM DE PROPOSITO: `countryCode`, `ibgeCode`, `addressKind` e
 * `fiscalAddressKind`. As quatro existem no modelo e sao do modulo fiscal —
 * `countryCode` tem default "BRASIL", e as outras tres sao escritas pelo
 * emissor de documento. Mostrar no formulario um campo sem regra seria pior que
 * `null`.
 */
/**
 * Endereco.
 *
 * Os limites sao a largura do `VarChar` de cada coluna, nao um teto de 200.
 * `TEXTO_LIVRE` num campo de 7 (`ibgeCode`) aceitaria o dado e o Postgres
 * recusaria o insert com "value too long", que chega na tela como erro de
 * servidor sem dizer qual campo. Ver `textoColuna`.
 */
const camposEndereco = {
  cep: CEP,
  logradouro: textoColuna(150), // street
  numero: textoColuna(20), // streetNumber
  complemento: textoColuna(80), // streetComplement
  bairro: textoColuna(80), // district
  cidade: textoColuna(100), // city
  uf: zOpcional(z.enum(BrazilState)),
};

/** Identidade: mesma para cliente e fornecedor, com o tipo diferente por padrao. */
const camposIdentidade = (tipoPadrao: PersonType) =>
  z.object({
    personType: z.enum(PersonType).default(tipoPadrao),
    nome: z
      .string({ error: "Informe o nome" })
      .trim()
      .min(2, "Use pelo menos 2 caracteres")
      .max(180, "Use no maximo 180 caracteres"),
    nomeFantasia: textoColuna(180), // tradeName
    documento: z.string(),
    inscricaoEstadual: textoColuna(20), // stateRegistration
    inscricaoMunicipal: textoColuna(20), // municipalRegistration
    documentoBruto: textoColuna(20), // documentRaw
  });

export const schemaCliente = camposIdentidade(PersonType.FISICA)
  .extend({
    dataNascimento: DATA,

    email: EMAIL,
    telefone: TELEFONE,
    whatsapp: TELEFONE,

    ...camposEndereco,

    // `creditLimit` e `Decimal @default(0)`, nao-nulavel. Zero = "sem limite
    // definido", que e o padrao de uma loja que vende no cartao. A diferenca
    // entre "sem limite" e "limite zero" (que bloquearia tudo) e o motivo de o
    // zero ser o default do banco e do formulario.
    limiteCredito: zDinheiro,

    observacoes: TEXTO_LONGO,

    // Consentimento de marketing e uma DECISAO DA PESSOA, com base legal, e o
    // schema guarda apenas a data. O campo e checkbox porque a LGPD exige o
    // registro da manifestacao, e quem marca a caixa e quem consente. O padrao e
    // `false`: checkbox marcado por padrao fabricaria consentimento sem ninguem
    // ter autorizado.
    marketingConsent: zCheck(false),

    // `active` e `true` quando ausente: cliente novo que nasce inativo some da
    // tela de venda, e a causa fica invisivel.
    ativo: zCheck(true),
  })
  .superRefine(validarDocumento);

export type DadosCliente = z.infer<typeof schemaCliente>;

/**
 * Fornecedor: mesma identidade, dados bancarios em vez de credito.
 *
 * `nomeContato` so existe aqui — o interlocutor que a empresa liga para pedir
 * mercadoria. A chave PIX nao e validada aqui: pode ser CPF, CNPJ, telefone,
 * email ou chave aleatoria, e o schema teria de adivinhar qual a pessoa escolheu
 * na hora do pagamento. Quem envia e o modulo financeiro.
 */
export const schemaFornecedor = camposIdentidade(PersonType.JURIDICA)
  .extend({
    nomeContato: textoColuna(120), // contactName

    email: EMAIL,
    telefone: TELEFONE,
    whatsapp: TELEFONE,

    ...camposEndereco,

    // Dados bancarios e PIX. Os limites sao o `VarChar` de cada coluna, e
    // varios sao BEM menores do que 200: `digitoAgencia` e `digitoConta` tem
    // 4 casas. Com `TEXTO_LIVRE`, um digito digitado errado ("12345") passava
    // pelo formulario e o banco recusava o registro inteiro do fornecedor —
    // a pessoa perdia nome, endereco e telefone por causa de um digito.
    banco: textoColuna(80), // bankName
    codigoBanco: textoColuna(10), // bankCode
    agencia: textoColuna(20), // agency
    digitoAgencia: textoColuna(4), // agencyDigit
    conta: textoColuna(30), // accountNumber
    digitoConta: textoColuna(4), // accountDigit
    tipoChavePix: textoColuna(20), // pixKeyType
    chavePix: textoColuna(140), // pixKey

    observacoes: TEXTO_LONGO,

    ativo: zCheck(true),
  })
  .superRefine(validarDocumento);

export type DadosFornecedor = z.infer<typeof schemaFornecedor>;

/**
 * Documento -> coluna, conforme o tipo de pessoa.
 *
 * Uma funcao para os dois modulos, porque a regra e a mesma: pessoa fisica vai
 * para `cpf`, juridica para `cnpj`. O outro caminho — `documentRaw` (XML
 * divergente) — e igual nos dois casos.
 *
 * A coluna que NAO recebe o documento e explicitamente `null`, e nao "deixada
 * como esta". `paraAtualizacao` sobrescreve as duas colunas, entao trocar um
 * cliente de juridico para fisico sem limpar o `cnpj` deixaria o documento
 * antigo ao lado do novo, com o `@@unique([tenantId, cnpj])` ocupado por um
 * documento que a pessoa ja trocou.
 */
export function colunasDocumento(
  tipo: PersonType,
  documento: string,
): { cpf: string | null; cnpj: string | null } {
  return tipo === PersonType.FISICA
    ? { cpf: documento, cnpj: null }
    : { cpf: null, cnpj: documento };
}
