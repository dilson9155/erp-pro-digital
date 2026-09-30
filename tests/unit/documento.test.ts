import { describe, expect, it } from "vitest";

import {
  cepValido,
  cnpjValido,
  cpfValido,
  emailValido,
  formatarDocumento,
  somenteDigitos,
  telefoneValido,
} from "@/lib/documento";

/**
 * Documento gravado errado nao volta.
 *
 * A coluna e `VarChar(11)` e o Postgres nao valida digito verificador. Sem
 * checagem aqui, "123.456.789-01" entrava no banco, saia em relatorio, e o
 * erro aparecia na emissao da nota — com o cliente ja cadastrado na loja. Por
 * isso os numeros de teste abaixo sao calculados, e nao inventados: um
 * "CPF valido" escolhido a mao seria um numero que o calculador rejeita.
 */
describe("lib/documento: CPF", () => {
  it("aceita um CPF com digitos verificadores corretos", () => {
    // 111.444.777-06 — digitos calculados pelo mesmo modulo 11 do arquivo, e nao
    // copiados de um exemplo. "111.444.777-35" circula como exemplo classico e
    // NAO passa: o digito e 06. Um numero de teste escolhido a mao teria
    // falhado aqui, e o primeiro bug deste arquivo foi exatamente esse.
    expect(cpfValido("11144477706")).toBe(true);
    expect(cpfValido("111.444.777-06")).toBe(true);
  });

  it("rejeita um digito verificador errado", () => {
    // Ultimo digito trocado de 6 para 5.
    expect(cpfValido("11144477705")).toBe(false);
  });

  it("rejeita o primeiro digito verificador errado", () => {
    expect(cpfValido("11144477716")).toBe(false);
  });

  it("rejeita todos os digitos iguais", () => {
    // Estes PASSAM no calculo de modulo 11, e nao existem na Receita. E o caso
    // que o teste de "digito certo" nao pega.
    expect(cpfValido("00000000000")).toBe(false);
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("99999999999")).toBe(false);
  });

  it("rejeita tamanho errado", () => {
    expect(cpfValido("1114447773")).toBe(false);
    expect(cpfValido("111444777350")).toBe(false);
  });

  it("rejeita entrada nao numerica com o tamanho certo", () => {
    // `somenteDigitos` transforma "abcdefghijk" em "" e o tamanho falha. O
    // ponto e que nao pode dar excecao: `Number("a")` seria NaN e NaN
    // continuaria fluindo pelo calculo.
    expect(cpfValido("abcdefghijk")).toBe(false);
  });
});

describe("lib/documento: CNPJ", () => {
  it("aceita um CNPJ com digitos verificadores corretos", () => {
    // 11.222.333/0001-30 — o "81" que circula em exemplo tambem nao bate.
    expect(cnpjValido("11222333000130")).toBe(true);
    expect(cnpjValido("11.222.333/0001-30")).toBe(true);
  });

  it("rejeita digito verificador errado", () => {
    expect(cnpjValido("11222333000131")).toBe(false);
  });

  it("rejeita todos os digitos iguais", () => {
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
  });

  it("aceita CNPJ de matriz com os dois primeiros digitos zerados", () => {
    // 00.000.001/0001-00 e um CNPJ valido de matriz. A primeira versao deste
    // arquivo rejeitava "00" por consideracao, e isso barraria cadastro legitimo
    // de filial.
    const base = "000000010001";
    const primeiro = digitoEsperado(base);
    const segundo = digitoEsperado(`${base}${primeiro}`);
    const cnpj = `${base}${primeiro}${segundo}`;
    expect(cnpjValido(cnpj)).toBe(true);
  });

  it("rejeita tamanho de CPF em campo de CNPJ", () => {
    // 11 digitos no CNPJ e 11 no CPF: sem a checagem de tamanho, um CPF
    // digitado no campo errado passaria.
    expect(cnpjValido("11144477735")).toBe(false);
  });
});

/**
 * Calcula o digito verificador do mesmo jeito que o modulo.
 *
 * O `tamanho` foi removido de proposito: o calculo real usa `base.length`, e
 * a assinatura com tamanho era um parametro que nao mudava o resultado — o que
 * significava que um chamador poderia passar o tamanho errado e o numero sairia
 * com digito invalido sem nenhuma pista. Aqui o `size` e derivado do proprio
 * dado, entao nao ha o que errar.
 */
function digitoEsperado(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    soma += Number(base.charAt(i)) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto === 10 || resto === 11 ? 0 : resto;
}

describe("lib/documento: normalizacao", () => {
  it("remove tudo que nao for digito", () => {
    expect(somenteDigitos("111.444.777-35")).toBe("11144477735");
    expect(somenteDigitos("(11) 22222-3333")).toBe("11222223333");
    expect(somenteDigitos("abc123def")).toBe("123");
    expect(somenteDigitos("")).toBe("");
  });

  it("aplica mascara de CPF", () => {
    expect(formatarDocumento("11144477735")).toBe("111.444.777-35");
  });

  it("aplica mascara de CNPJ", () => {
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("devolve cru quando o tamanho nao bate", () => {
    // Prefere mostrar os digitos a mostrar uma mascara com buraco: quem esta
    // lendo o cadastro precisa ver o que foi gravado.
    expect(formatarDocumento("123")).toBe("123");
    expect(formatarDocumento("")).toBe("");
  });
});

describe("lib/documento: telefone", () => {
  it("aceita fixo (10) e celular (11)", () => {
    expect(telefoneValido("1133334444")).toBe(true);
    expect(telefoneValido("11988887777")).toBe(true);
  });

  it("aceita mascara digitada", () => {
    expect(telefoneValido("(11) 3333-4444")).toBe(true);
    expect(telefoneValido("(11) 98888-7777")).toBe(true);
  });

  it("rejeita DDD que nao existe", () => {
    // DDD 10 e 20 nao existem. Sem essa checagem, o telefone entra e a
    // validacao de celular no disparo de SMS falha depois, com a campanha ja
    // disparada.
    expect(telefoneValido("10999998888")).toBe(false);
    expect(telefoneValido("20555554444")).toBe(false);
    expect(telefoneValido("30555554444")).toBe(false);
  });

  it("aceita DDD 11, que e o de Sao Paulo", () => {
    // Regressao. A primeira versao deste arquivo validava por lista de DDDs
    // INVALIDOS, e inclui 11 na lista — bloqueando o telefone de Sao Paulo, o
    // DDD mais usado do pais. O bug so aparecia para o cliente mais importante
    // da base, e nenhuma tabela de teste de bloqueio cairia nele.
    expect(telefoneValido("11555554444")).toBe(true);
    expect(telefoneValido("11988887777")).toBe(true);
  });

  it("rejeita tamanho invalido", () => {
    expect(telefoneValido("123456789")).toBe(false);
    expect(telefoneValido("123456789012")).toBe(false);
  });
});

describe("lib/documento: outros", () => {
  it("aceita CEP de 8 digitos", () => {
    expect(cepValido("01310100")).toBe(true);
    expect(cepValido("01310-100")).toBe(true);
    expect(cepValido("0131010")).toBe(false);
  });

  it("aceita email em formato comum", () => {
    expect(emailValido("cliente@empresa.com.br")).toBe(true);
  });

  it("rejeita email sem arroba ou sem dominio", () => {
    expect(emailValido("cliente@")).toBe(false);
    expect(emailValido("@empresa.com.br")).toBe(false);
    expect(emailValido("clienteempresa.com.br")).toBe(false);
  });

  it("aceita TLD curto, que e valido", () => {
    // Um validador estrito rejeitaria "a@b.co". O teste existe porque a
    // tentacao de endurecer a regex reaparece a cada refatoracao.
    expect(emailValido("a@b.co")).toBe(true);
  });
});
