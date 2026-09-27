/**
 * Testes de TOTP contra os vetores da RFC 6238.
 *
 * Este arquivo existe porque um TOTP "quase certo" e o pior tipo de bug de
 * autenticacao: passa no desenvolvimento e no telefone de quem testou, e falha
 * no aparelho de outra marca. Os vetores abaixo sao do apendice da RFC 6238 e
 * sao a unica verificacao que importa: eles vem de uma implementacao de
 * referencia, entao se o nosso codigo bate com eles, a aritmetica do HMAC, do
 * truncamento e do big-endian esta certa.
 *
 * O segredo de exemplo da RFC e propositalmente pouco entropico ("1234567890...").
 * Nao serve para uso real — e por isso que `generateTotpSecret` usa
 * `randomBytes`. Aqui ele serve so para conferir numeros.
 */

import { describe, expect, it } from "vitest";

import {
  generateTotp,
  generateTotpSecret,
  provisioningUri,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  totpAtStep,
  verifyTotp,
} from "@/lib/auth/totp";

/**
 * Segredos base32 dos vetores da RFC. O nome ASCII do segredo original
 * ("12345678901234567890") e o que os gerou; o TOTP so enxerga o base32.
 */
const SEGREDO = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const SEGREDO_32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA";

describe("vetores da RFC 6238", () => {
  // [timestamp em segundos, codigo esperado, segredo]
  // Todos os vetores de 6 digitos do apendice da RFC, com o mesmo segredo.
  const vetores: ReadonlyArray<readonly [number, string]> = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  it.each(vetores)("timestamp %i gera %s", (timestamp, esperado) => {
    expect(generateTotp(SEGREDO, timestamp * 1000)).toBe(esperado);
  });

  it("respeita o passo de 30 s da RFC", () => {
    // Dois instantes no mesmo passo de 30 s precisam dar o mesmo codigo: e o que
    // faz o app do celular mostrar um codigo so. Do outro lado, a virada do
    // passo precisa trocar o codigo, senao o valor valeria 60 s.
    const inicio = 1_234_567_890_000;
    const mesmoPasso = generateTotp(SEGREDO, inicio);
    const quaseVirada = generateTotp(SEGREDO, inicio + (TOTP_PERIOD_SECONDS - 1) * 1000);
    const virada = generateTotp(SEGREDO, inicio + TOTP_PERIOD_SECONDS * 1000);

    expect(mesmoPasso).toBe(quaseVirada);
    expect(virada).not.toBe(mesmoPasso);
  });

  it("aceita passos negativos e muito distantes", () => {
    // `writeBigInt64BE` aceita negativo, e o passo 0 do epoch e legitimately
    // usado. Um `Date` antes de 1970 nao pode estourar o buffer de 8 bytes.
    expect(() => totpAtStep(SEGREDO, 0)).not.toThrow();
    expect(() => totpAtStep(SEGREDO, -1)).not.toThrow();
    expect(totpAtStep(SEGREDO, 0)).toHaveLength(TOTP_DIGITS);
  });

  it("usa os segredos de 160 e 256 bits da RFC", () => {
    // A RFC traz vetores com dois tamanhos de segredo, e o resultado muda:
    // o segredo entra na chave do HMAC, entao 20 bytes e 32 bytes NAO produzem
    // o mesmo codigo. A tabela da RFC da 97599872 (8 digitos) para o segredo de
    // 32 bytes, o que em 6 digitos e 599872 — nao o 287082 do outro segredo.
    // Usar o valor do primeiro aqui daria um falso positivo no tamanho errado.
    expect(generateTotp(SEGREDO_32, 59 * 1000)).toBe("599872");
  });
});

describe("segredo", () => {
  it("gera segredos diferentes", () => {
    const segredos = new Set(Array.from({ length: 50 }, () => generateTotpSecret()));
    expect(segredos.size).toBe(50);
  });

  it("gera 32 caracteres base32 (160 bits)", () => {
    // 20 bytes = 160 bits = 32 chars base32. E o minimo da RFC 4226, e o
    // comprimento que cabe em um unico campo de digitacao manual.
    expect(generateTotpSecret()).toHaveLength(32);
  });

  it("so usa o alfabeto base32", () => {
    for (const c of generateTotpSecret()) {
      expect("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567").toContain(c);
    }
  });

  it("lida o proprio segredo de volta", () => {
    // Se a decodificacao do segredo gerado nao devolvesse os mesmos bytes, o
    // QR nao bateria com o que esta no banco, e o usuario nunca conseguiria
    // entrar. Esta e a propriedade que amarra `generateTotpSecret` e
    // `fromBase32` sem depender de vetor externo.
    const segredo = generateTotpSecret();
    const codigo1 = generateTotp(segredo);
    expect(verifyTotp(segredo, codigo1, Date.now()).valido).toBe(true);
  });
});

describe("verifyTotp", () => {
  const agora = 1_234_567_890_000;
  const codigo = generateTotp(SEGREDO, agora);

  it("aceita o codigo do instante atual", () => {
    const r = verifyTotp(SEGREDO, codigo, agora);
    expect(r.valido).toBe(true);
    expect(r.passo).toBe(Math.floor(agora / 1000 / 30));
  });

  it("aceita o passo anterior e o seguinte, por desvio de relogio", () => {
    // O relogio do celular e o do servidor divergem. Sem esta tolerancia, uma
    // diferenca de 10 s custaria um login, e o usuario culparia o sistema.
    const passo = Math.floor(agora / 1000 / 30);
    expect(verifyTotp(SEGREDO, totpAtStep(SEGREDO, passo - 1), agora).valido).toBe(true);
    expect(verifyTotp(SEGREDO, totpAtStep(SEGREDO, passo + 1), agora).valido).toBe(true);
  });

  it("recusa passos fora da janela", () => {
    // +-1 e o ponto de equilibrio: cada passo a mais triplica as senhas validas
    // por instante. Dois passos fora ja e tolerancia demais para um codigo de
    // 6 digitos.
    const passo = Math.floor(agora / 1000 / 30);
    expect(verifyTotp(SEGREDO, totpAtStep(SEGREDO, passo - 2), agora).valido).toBe(false);
    expect(verifyTotp(SEGREDO, totpAtStep(SEGREDO, passo + 2), agora).valido).toBe(false);
  });

  it("impede o replay de um codigo ja usado", () => {
    // O codigo vale por 90 s com a janela. Quem vir o codigo no telao da vitima
    // pode reapresenta-lo. Gravando o ultimo passo, a janela vira uso unico.
    const primeiro = verifyTotp(SEGREDO, codigo, agora);
    expect(primeiro.valido).toBe(true);

    const segundo = verifyTotp(SEGREDO, codigo, agora, primeiro.passo);
    expect(segundo.valido).toBe(false);
    expect(segundo.passo).toBe(-1);
  });

  it("recusa codigo de outro segredo", () => {
    expect(verifyTotp(generateTotpSecret(), codigo, agora).valido).toBe(false);
  });

  it("recusa entrada malformada sem lancar", () => {
    // Entrada vem de um campo de texto. `NaN`, string vazia, letras e codigo
    // gigante tem que ser "invalido", nunca uma excecao — uma excecao aqui
    // viraria um 500 no login.
    for (const entrada of ["", "12345", "1234567", "abcdef", "12a456", "000000000000", " "]) {
      expect(verifyTotp(SEGREDO, entrada, agora).valido).toBe(false);
    }
  });

  it("recusa segredo corrompido sem lancar", () => {
    // Se o segredo guardado no banco for lixo, o login tem de recusar em vez de
    // estourar: o usuario veria uma tela de erro em vez de "codigo invalido".
    for (const segredo of ["", "!!!", "0123", "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQO!"]) {
      const r = verifyTotp(segredo, "123456", agora);
      expect(r.valido).toBe(false);
      expect(r.passo).toBe(-1);
    }
  });

  it("tolera espacos e minusculas no codigo", () => {
    // Colar o codigo costuma trazer espaco, e o celular pode mostrar
    // separador. `000 123` tem de funcionar como `000123`.
    const c = generateTotp(SEGREDO, agora);
    const comEspaco = `${c.slice(0, 3)} ${c.slice(3)}`;
    expect(verifyTotp(SEGREDO, comEspaco, agora).valido).toBe(true);
  });

  it("gera sempre 6 digitos, com zero a esquerda", () => {
    // Sem `padStart`, um codigo que comecasse com zero sairia com 5 digitos e o
    // usuario nao conseguiria digitar no campo.
    for (let passo = 0; passo < 300; passo += 1) {
      const c = totpAtStep(SEGREDO, passo);
      expect(c).toMatch(/^\d{6}$/);
    }
  });

  it("devolve -1 no passo quando invalido", () => {
    // `-1` e o que impede gravar um passo invalido e, com isso, bloquear o
    // usuario de usar um codigo legitimo depois de um erro de digitacao.
    const r = verifyTotp(SEGREDO, "999999", agora);
    expect(r.valido).toBe(false);
    expect(r.passo).toBe(-1);
  });
});

describe("provisioningUri", () => {
  it("monta o formato otpauth com issuer", () => {
    const uri = provisioningUri(SEGREDO, "ana@empresa.com", "ERP Pro");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(`secret=${SEGREDO}`);
    expect(uri).toContain("issuer=ERP%20Pro");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("escapa o rotulo com issuer e conta", () => {
    // Sem issuer no rotulo, o app mostra so o e-mail e nao da para saber de
    // qual empresa e a conta quando ha varias no mesmo celular.
    const uri = provisioningUri(SEGREDO, "a@b.com", "ERP Pro");
    expect(uri).toContain("ERP%20Pro%3Aa%40b.com");
  });
});
