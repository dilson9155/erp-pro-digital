import { describe, expect, it } from "vitest";

import { PersonType } from "@/generated/prisma/enums";
import { colunasDocumento, schemaCliente } from "@/server/app/pessoas/schema";

/**
 * `Customer.cpf` e `Customer.cnpj` sao `String?`, e o indice unico e por coluna.
 *
 * O `null` nao viola `@@unique([tenantId, cpf])` — dois clientes sem CPF sao
 * aceitos pelo banco. A constraint que realmente importa aqui nao e do banco: e
 * que duas linhas com o mesmo documento sao a MESMA pessoa, e o schema e o que
 * garante que o documento existe e e valido. Estes testes travam isso.
 *
 * Os numeros sao calculados (ver `documento.test.ts`): 111.444.777-06 e
 * 11.222.333/0001-30 passam no modulo 11 do validador do projeto.
 */

/** Formulario minimo que o schema aceita, para varies-so o campo em teste. */
const BASE = {
  personType: PersonType.FISICA,
  nome: "Maria Souza",
  documento: "11144477706",
  limiteCredito: "0",
  marketingConsent: "",
  ativo: "on",
} as const;

/**
 * Primeira mensagem de erro ancorada em `campo`.
 *
 * Aceita um override do formulario, porque a primeira versao desta funcao
 * validava sempre `BASE` e devolvia `undefined` para qualquer campo com valor
 * correto — dois testes passaram a reclamar "expected undefined to be ..." sem
 * que houvesse erro algum. O sintoma e o mesmo de um schema que nao valida.
 */
function erroEm(campo: string, mudanca: Record<string, unknown> = {}): string | undefined {
  const r = schemaCliente.safeParse({ ...BASE, ...mudanca });
  if (r.success) return undefined;
  return r.error.issues.find((i) => i.path[0] === campo)?.message;
}

describe("clientes/schema: documento por tipo de pessoa", () => {
  it("aceita pessoa fisica com CPF valido", () => {
    const r = schemaCliente.safeParse(BASE);
    expect(r.success).toBe(true);
  });

  it("aceita CPF com mascara digitada", () => {
    // A mascara e o que a pessoa ve no papel e no cadastro do outro sistema. O
    // `transform` tira os nao digitos antes de validar.
    const r = schemaCliente.safeParse({ ...BASE, documento: "111.444.777-06" });
    expect(r.success).toBe(true);
  });

  it("aceita pessoa juridica com CNPJ valido", () => {
    const r = schemaCliente.safeParse({
      ...BASE,
      personType: PersonType.JURIDICA,
      nome: "Distribuidora ACME Ltda",
      documento: "11.222.333/0001-30",
    });
    expect(r.success).toBe(true);
  });

  it("rejeita CPF invalido no campo de pessoa fisica", () => {
    expect(erroEm("documento", { documento: "11144477705" })).toBe("CPF invalido. Confira os digitos.");
  });

  it("rejeita CPF em cliente juridico, com a mensagem de CNPJ", () => {
    // A mensagem precisa ser a do campo que faz sentido. Com `union` de dois
    // schemas, apareceriam as duas mensagens e a pessoa nao saberia qual
    // corrigir.
    const r = schemaCliente.safeParse({
      ...BASE,
      personType: PersonType.JURIDICA,
      nome: "Distribuidora ACME Ltda",
      documento: "11144477706",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.message)).toContain("CNPJ deve ter 14 digitos");
  });

  it("rejeita CNPJ em cliente fisico, com a mensagem de CPF", () => {
    const r = schemaCliente.safeParse({ ...BASE, documento: "11222333000130" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.message)).toContain("CPF deve ter 11 digitos");
  });

  it("exige documento: vazio vira o erro do tipo certo", () => {
    expect(erroEm("documento", { documento: "" })).toBe("Informe o CPF");

    const r = schemaCliente.safeParse({
      ...BASE,
      personType: PersonType.JURIDICA,
      nome: "Distribuidora ACME Ltda",
      documento: "",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.message)).toContain("Informe o CNPJ");
  });

  it("ancora o erro do documento no campo documento", () => {
    // `superRefine` no objeto precisa apontar o `path`, senao o erro vira geral e
    // o formulario nao destaca o input.
    const r = schemaCliente.safeParse({ ...BASE, documento: "" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.path[0]).toBe("documento");
  });
});

describe("clientes/schema: colunasDocumento", () => {
  it("manda CPF para a coluna cpf e limpa cnpj", () => {
    expect(colunasDocumento(PersonType.FISICA, "11144477706")).toEqual({
      cpf: "11144477706",
      cnpj: null,
    });
  });

  it("manda CNPJ para a coluna cnpj e limpa cpf", () => {
    // Limpar a outra coluna e obrigatorio: `paraAtualizacao` sobrescreve as
    // duas. Sem o `null`, editar de juridico para fisico deixaria o CNPJ antigo
    // gravado ao lado do CPF novo, e o `@@unique([tenantId, cnpj])` continuaria
    // ocupado por um documento que a pessoa ja trocou.
    expect(colunasDocumento(PersonType.JURIDICA, "11222333000130")).toEqual({
      cpf: null,
      cnpj: "11222333000130",
    });
  });
});

describe("clientes/schema: nome", () => {
  it("rejeita nome de um caractere", () => {
    const r = schemaCliente.safeParse({ ...BASE, nome: "M" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.message)).toContain("Use pelo menos 2 caracteres");
  });

  it("rejeita nome acima de 180 caracteres, o limite do schema", () => {
    // O `VarChar(180)` trunca em silencio no Postgres: gravar "Joao da Silva
    // Junior Junior Junior..." perderia a ponta do nome sem aviso.
    const r = schemaCliente.safeParse({ ...BASE, nome: "a".repeat(181) });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.message)).toContain("Use no maximo 180 caracteres");
  });

  it("aceita razao social com 180 caracteres", () => {
    const r = schemaCliente.safeParse({ ...BASE, nome: "a".repeat(180) });
    expect(r.success).toBe(true);
  });
});

describe("clientes/schema: limite de credito", () => {
  it("converte para Decimal", () => {
    const r = schemaCliente.safeParse({ ...BASE, limiteCredito: "1.500,00" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.limiteCredito.toString()).toBe("1500");
  });

  it("rejeita ponto como separador decimal", () => {
    // "1500.00" e o formato americano. Aceitar aqui gravaria 1500 (mil e quinhentos
    // reais) onde a pessoa queria mil e quinhentos — e o credito errado libera
    // venda demais.
    const r = schemaCliente.safeParse({ ...BASE, limiteCredito: "1500.00" });
    expect(r.success).toBe(false);
  });

  it("rejeita zero como ausente", () => {
    // `zDinheiro` e obrigatorio. "Zero = sem limite" e o DEFAULT do formulario,
    // que precisa chegar como texto "0,00" ou "0" — nunca como campo vazio.
    const r = schemaCliente.safeParse({ ...BASE, limiteCredito: "" });
    expect(r.success).toBe(false);
  });
});

describe("clientes/schema: contato", () => {
  it("normaliza telefone para digitos", () => {
    const r = schemaCliente.safeParse({ ...BASE, telefone: "(11) 98888-7777" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.telefone).toBe("11988887777");
  });

  it("rejeita telefone com DDD inexistente", () => {
    const r = schemaCliente.safeParse({ ...BASE, telefone: "(20) 5555-4444" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.message)).toContain("Informe um telefone com DDD valido");
  });

  it("baixa a caixa do email", () => {
    // A busca por email e `insensitive` no Postgres, entao a caixa nao mudaria
    // o resultado. Baixar mesmo assim evita dois cadastros visivelmente
    // diferentes com o mesmo endereco em um select de outro modulo.
    const r = schemaCliente.safeParse({ ...BASE, email: "MARIA@EMPRESA.COM.BR" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.email).toBe("maria@empresa.com.br");
  });

  it("vira email vazio em null, e nao em string vazia", () => {
    // String vazia em `VarChar` e um valor presente: apareceria como contato
    // "sem email" no filtro do modulo de marketing, filtrando errado.
    const r = schemaCliente.safeParse({ ...BASE, email: "  " });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.email).toBeNull();
  });

  it("normaliza CEP para 8 digitos", () => {
    const r = schemaCliente.safeParse({ ...BASE, cep: "01310-100" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.cep).toBe("01310100");
  });
});

describe("clientes/schema: data de nascimento", () => {
  it("converte para UTC no meio-dia do dia informado", () => {
    // Meio-dia e deliberado: `new Date("1990-05-10")` sem hora e lido como UTC
    // e ja produziu data do dia anterior em maquina com fuso negativo. Meio-dia
    // absorve fuso de ate -12 sem virar dia anterior.
    const r = schemaCliente.safeParse({ ...BASE, dataNascimento: "1990-05-10" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.dataNascimento?.toISOString().slice(0, 10)).toBe("1990-05-10");
  });

  it("vira null quando vazio", () => {
    const r = schemaCliente.safeParse({ ...BASE, dataNascimento: "" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.dataNascimento).toBeNull();
  });

  it("rejeita data em formato brasileiro", () => {
    // O `<input type="date">` entrega AAAA-MM-DD. Aceitar "10/05/1990" aqui
    // daria um `Date` invalido sem erro, e o `Invalid Date` chegaria ao Prisma.
    const r = schemaCliente.safeParse({ ...BASE, dataNascimento: "10/05/1990" });
    expect(r.success).toBe(false);
  });
});

describe("clientes/schema: checkbox", () => {
  it("trata cliente ativo por padrao, como o `active @default(true)`", () => {
    // Ausente = marcado. Cliente novo que nasce inativo some da lista de venda
    // e ninguem descobre a causa: o cadastro nao tem o campo para mostrar.
    const r = schemaCliente.safeParse({ ...BASE, ativo: undefined });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.ativo).toBe(true);
  });

  it("trata marketing consentido por padrao negativo", () => {
    // Consentimento e uma manifestacao da pessoa. Um checkbox marcado por
    // padrao fabricaria consentimento sem ninguem ter autorizado, e o registro
    // errado so apareceria numa autuarial de marketing.
    const r = schemaCliente.safeParse({ ...BASE, marketingConsent: undefined });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.marketingConsent).toBe(false);
  });

  it("reconhece o par marcado/desmarcado do formulario", () => {
    // O `FormData` traz `["", "on"]` quando marcado e `[""]` quando nao. O
    // `zCheck` trata os dois; o teste trava o contrato com o componente.
    const marcado = schemaCliente.safeParse({ ...BASE, marketingConsent: "on" });
    expect(marcado.success).toBe(true);
    if (marcado.success) expect(marcado.data.marketingConsent).toBe(true);

    const desmarcado = schemaCliente.safeParse({ ...BASE, marketingConsent: "" });
    expect(desmarcado.success).toBe(true);
    if (desmarcado.success) expect(desmarcado.data.marketingConsent).toBe(false);
  });
});
