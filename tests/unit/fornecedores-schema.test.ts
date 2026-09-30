import { describe, expect, it } from "vitest";

import { PersonType } from "@/generated/prisma/enums";
import { schemaCliente, schemaFornecedor } from "@/server/app/pessoas/schema";

/**
 * Cliente e fornecedor dividem o schema de identidade por construcao
 * (`camposIdentidade` em `pessoas/schema.ts`), e este arquivo existe para
 * travar essa divisao.
 *
 * A pergunta nao e "o CPF e valido" — isso e `documento.test.ts`. A pergunta e:
 * o que acontece quando o MESMO formulario alimenta as duas tabelas. O erro
 * tipico aqui e silencioso: um schema de fornecedor que aceita documento
 * invalido passa em review, nao quebra nada visivel, e so aparece quando a
 * compra gravada leva o fornecedor para dentro de um XML de NFe, que e
 * rejeitado na hora de emitir.
 *
 * A segunda diferenca que importa: o padrao de `personType`. Cliente nasce
 * pessoa fisica, fornecedor nasce juridica, porque quem compra mercadoria e
 * quase sempre empresa. Um `default` errado faria o CNPJ de um fornecedor ser
 * recusado por "CPF deve ter 11 digitos" no primeiro cadastro.
 */

const BASE_CLIENTE = {
  personType: PersonType.FISICA,
  nome: "Maria Souza",
  documento: "11144477706",
  limiteCredito: "0",
  marketingConsent: "",
  ativo: "on",
} as const;

const BASE_FORNECEDOR = {
  personType: PersonType.JURIDICA,
  nome: "Distribuidora ACME Ltda",
  documento: "11222333000130",
  ativo: "on",
} as const;

describe("fornecedores/schema: identidade compartilhada", () => {
  it("aceita juridica com CNPJ valido", () => {
    const r = schemaFornecedor.safeParse(BASE_FORNECEDOR);
    expect(r.success).toBe(true);
  });

  it("aceita fisica com CPF valido (MEI e produtor rural)", () => {
    const r = schemaFornecedor.safeParse({
      ...BASE_FORNECEDOR,
      personType: PersonType.FISICA,
      nome: "Joao Produtor",
      documento: "11144477706",
    });
    expect(r.success).toBe(true);
  });

  it("valida o documento com a MESMA regra do cliente", () => {
    // A funcao `validarDocumento` e a mesma para os dois. Se um dia o fornecedor
    // abrir mao uma regra propria, este teste e o que avisa a mudanca.
    const invalido = "11222333000131";
    const cliente = schemaCliente.safeParse({
      ...BASE_CLIENTE,
      personType: PersonType.JURIDICA,
      nome: "Distribuidora ACME Ltda",
      documento: invalido,
    });
    const fornecedor = schemaFornecedor.safeParse({ ...baseJuridica(), documento: invalido });

    expect(cliente.success).toBe(false);
    expect(fornecedor.success).toBe(false);
  });

  it("exige documento tambem no fornecedor", () => {
    const r = schemaFornecedor.safeParse({ ...baseJuridica(), documento: "" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.message)).toContain("Informe o CNPJ");
  });

  it("rejeita nome de um caractere, igual ao cliente", () => {
    const r = schemaFornecedor.safeParse({ ...baseJuridica(), nome: "A" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.message)).toContain("Use pelo menos 2 caracteres");
  });

  it("ancora o erro do documento no campo documento", () => {
    const r = schemaFornecedor.safeParse({ ...baseJuridica(), documento: "" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.path[0]).toBe("documento");
  });
});

describe("fornecedores/schema: padrao do tipo de pessoa", () => {
  it("fornecedor nasce juridica, e o CNPJ entra sem trocar o tipo", () => {
    // Com `default(FISICA)` herdado do cliente, o primeiro cadastro de
    // fornecedor exigiria trocar o tipo antes de digitar o CNPJ, e o erro seria
    // "CPF deve ter 11 digitos" — mensagem que nao corresponde ao que a pessoa
    // digitou e leva a duvida sobre o cadastro inteiro.
    const r = schemaFornecedor.safeParse({ nome: "Distribuidora ACME", documento: "11222333000130", ativo: "on" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.personType).toBe(PersonType.JURIDICA);
  });

  it("cliente nasce fisica, e o CPF entra sem trocar o tipo", () => {
    const r = schemaCliente.safeParse({ ...BASE_CLIENTE, personType: undefined });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.personType).toBe(PersonType.FISICA);
  });
});

describe("fornecedores/schema: campos que so existem aqui", () => {
  it("nao exige dado bancario nem PIX", () => {
    // Empresa que paga por boleto cadastra a conta; a que paga por PIX cadastra
    // a chave. NINGUEM precisa dos dois, e exigir um deles barra metade dos
    // fornecedores por um dado que o pagamento pode nao usar.
    const r = schemaFornecedor.safeParse(baseJuridica());
    expect(r.success).toBe(true);
  });

  it("aceita chave PIX e dados bancarios juntos", () => {
    const r = schemaFornecedor.safeParse({
      ...baseJuridica(),
      tipoChavePix: "ALEATORIA",
      chavePix: "7c1f2a44-9b3e-4d1a-8f6c-2e5b0d9a1f77",
      banco: "Banco do Brasil",
      codigoBanco: "001",
      agencia: "1234",
      digitoAgencia: "X",
      conta: "56789",
      digitoConta: "0",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.chavePix).toBe("7c1f2a44-9b3e-4d1a-8f6c-2e5b0d9a1f77");
  });

  it("NÃO valida o formato da chave PIX", () => {
    // A chave aceita cinco formatos e o schema nao sabe qual a pessoa escolheu.
    // Validar aqui erraria nas duas direcoes: recusaria a chave valida e
    // aceitaria a invalida. Este teste registra a decisao: o campo e livre, e
    // quem valida e o modulo financeiro, no momento do pagamento.
    const r = schemaFornecedor.safeParse({ ...baseJuridica(), chavePix: "texto que nao e chave" });
    expect(r.success).toBe(true);
  });

  it("nao tem limite de credito, que e exclusive do cliente", () => {
    // `creditLimit` nao existe no `Supplier`. Um modulo que o copiasse para o
    // outro criaria um campo que nada usa e que a tela de compra nao saberia
    // interpretar.
    const campos = Object.keys(schemaFornecedor.shape);
    expect(campos).not.toContain("limiteCredito");
    expect(campos).toContain("chavePix");
  });

  it("nao tem consentimento de marketing, que e do cliente", () => {
    // O consentimento de LGPD aqui seria falso por construcao: quem recebe
    // comunicacao comercial e a empresa, nao o fornecedor.
    expect(Object.keys(schemaFornecedor.shape)).not.toContain("marketingConsent");
  });
});

describe("fornecedores/schema: contato e endereco", () => {
  it("normaliza telefone para digitos", () => {
    const r = schemaFornecedor.safeParse({ ...baseJuridica(), telefone: "(11) 3333-4444" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.telefone).toBe("1133334444");
  });

  it("normaliza CEP para 8 digitos", () => {
    const r = schemaFornecedor.safeParse({ ...baseJuridica(), cep: "01310-100" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.cep).toBe("01310100");
  });

  it("trata fornecedor ativo por padrao, como o `active @default(true)`", () => {
    const r = schemaFornecedor.safeParse({ ...baseJuridica(), ativo: undefined });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.ativo).toBe(true);
  });

  it("vira texto vazio em null, para nao gravar string vazia em coluna nullable", () => {
    // String vazia em `VarChar` e valor PRESENTE: apareceria como "banco: " no
    // relatorio e no select de pagamento, e contaria como dado preenchido.
    const r = schemaFornecedor.safeParse({ ...baseJuridica(), banco: "  ", agencia: undefined });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.banco).toBeNull();
    expect(r.data.agencia).toBeNull();
  });
});

/** Base do fornecedor com o tipo explicito, para os testes que trocam o campo. */
function baseJuridica(): Record<string, unknown> {
  return {
    personType: PersonType.JURIDICA,
    nome: "Distribuidora ACME Ltda",
    documento: "11222333000130",
    ativo: "on",
  };
}
