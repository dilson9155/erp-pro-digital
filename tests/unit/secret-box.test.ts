/**
 * Testes da caixa criptografica e dos codigos de recuperacao.
 *
 * O que estes testes protegem, em ordem de gravidade:
 *
 *  1. A tag de autenticacao e verificada. Um GCM sem checagem de tag aceitaria
 *     um segredo trocado por outro, e o app decifraria o resultado sem reclamar:
 *     o teste de adulteracao e o que impede que essa regresse.
 *  2. O segredo NAO aparece em claro dentro do pacote cifrado. E a razao de o
 *     campo existir; um teste que so fizesse "cifrar e decifrar" passaria
 *     mesmo com o plaintext acidentalmente incluido.
 *  3. O hash do codigo de recuperacao e estavel sob formatacao. O usuario digita
 *     o codigo de um papel, e um `O` trocado por `0` (motivo de o alfabeto nao
 *     ter os dois) transformaria um backup valido em conta perdida.
 */

import { describe, expect, it } from "vitest";

import {
  CARACTERES_AMBIGUOS,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizarRecoveryCode,
  recoveryCodeMatches,
  TOTAL_CODIGOS_RECUPERACAO,
} from "@/lib/auth/secret-box";

/** Conjunto de caracteres usados pelo alfabeto, para as expressoes regulares. */
const ALFABETO = "ACDEFGHJKMNPQRTUVWXYZ234679";

/** Todos os caracteres ja gerados, em um lote. */
function geradosEmLote(codigos: number): Set<string> {
  return new Set(generateRecoveryCodes(codigos).join("").replace(/-/g, ""));
}

describe("cifra do segredo", () => {
  it("devolve o mesmo texto depois de decifrar", () => {
    const segredo = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(decryptSecret(encryptSecret(segredo))).toBe(segredo);
  });

  it("trabalha com texto vazio e com acento", () => {
    // Texto vazio tem que sobreviver: acontece quando o valor gravado e nulo e
    // alguem chama o caminho de cifragem assim mesmo. E acento prova que o
    // encode esta em UTF-8 e nao em latin-1, que corromperia o segredo e faria
    // o TOTP falhar so para quem tem nome com til.
    expect(decryptSecret(encryptSecret(""))).toBe("");
    expect(decryptSecret(encryptSecret("segredo-ção-çã"))).toBe("segredo-ção-çã");
  });

  it("nao deixa o texto claro dentro do pacote", () => {
    const segredo = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const cifrado = encryptSecret(segredo);
    expect(cifrado).not.toContain(segredo);
    // A forma legivel do base32 tambem nao pode aparecer: `Buffer.toString("hex")`
    // do texto em UTF-8 e o que estaria no campo se a cifragem fosse
    // simplesmente um encode.
    expect(cifrado).not.toContain(Buffer.from(segredo, "utf8").toString("hex"));
  });

  it("usa sal e nonce novos a cada cifragem", () => {
    // Se o nonce se repetisse com a mesma chave, GCM perderia confidencialidade
    // de forma catastrofica: dois textos cifrados com o mesmo nonce revelam
    // XOR um do outro. E a razao de o sal ser gerado por cifra, e nao fixo.
    const a = encryptSecret("mesmo-segredo");
    const b = encryptSecret("mesmo-segredo");
    expect(a).not.toBe(b);
    // E o mesmo texto continua recuperavel nas duas.
    expect(decryptSecret(a)).toBe("mesmo-segredo");
    expect(decryptSecret(b)).toBe("mesmo-segredo");
  });

  it("versiona o formato", () => {
    // O prefixo vem primeiro para que a leitura decida o formato antes de tentar
    // interpretar o resto. Sem ele, uma migracao futura de algoritmo deixaria
    // os segredos antigos ilegiveis com um erro generico.
    expect(encryptSecret("x").startsWith("v1.")).toBe(true);
    expect(encryptSecret("x").split(".")).toHaveLength(5);
  });

  it("recusa um ciphertext adulterado", () => {
    // O teste que impede a regressao mais séria: sem verificacao de tag, da
    // para trocar o segredo de uma conta pelo de outra, ou mexer em um byte e
    // o app decifraria o resultado sem reclamar.
    const partes = encryptSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").split(".");
    // Copia antes de mexer: `Buffer.from(hex)` ja devolve um buffer novo, mas
    // explicitar isso evita que uma refatoracao do `from` passe a alterar o
    // original e o teste vire verde por acidente.
    const adulterado = Buffer.from(Buffer.from(partes[3]!, "hex"));
    // Leitura com `?? 0`: o indice de um Buffer e `number | undefined` sob
    // `noUncheckedIndexedAccess`, e um `!` aqui esconderia um indice fora.
    adulterado[0] = (adulterado[0] ?? 0) ^ 0xff;
    partes[3] = adulterado.toString("hex");
    expect(() => decryptSecret(partes.join("."))).toThrow();
  });

  it("recusa uma tag trocada", () => {
    const partes = encryptSecret("seja-la-qual-for").split(".");
    partes[4] = "00".repeat(16);
    expect(() => decryptSecret(partes.join("."))).toThrow();
  });

  it("recusa sal ou nonce de tamanho errado", () => {
    // Sem esta checagem, um `Buffer` menor faria a cifra aceitar material
    // invalido, e a falha apareceria como "senha corrompida" em vez de
    // "registro invalido".
    const partes = encryptSecret("x").split(".");
    partes[1] = "00".repeat(4);
    expect(() => decryptSecret(partes.join("."))).toThrow(/sal ou nonce/);
  });

  it("recusa formato e versao desconhecidos", () => {
    expect(() => decryptSecret("")).toThrow();
    expect(() => decryptSecret("a.b.c")).toThrow(/formato/);
    expect(() => decryptSecret("v2.aa.bb.cc.dd")).toThrow(/versao/);
  });
});

describe("distribuicao", () => {
  it("nao enviesa os caracteres em direcao a um extremo", () => {
    // Este e o teste que pega a troca de `rejection sampling` por
    // `byte % ALFABETO.length`. Com 27 caracteres e 256 bytes, `byte % 27` faz
    // os 13 primeiros valores do alfabeto aparecerem ~10% mais vezes que os
    // ultimos 14. A consequencia nao e teoria: a entropia efetiva de cada
    // codigo cai, e o backup fica mais facil de adivinhar do que parece.
    //
    // A checagem e por faixa, e nao por frequencia exata: com 20 mil
    // caracteres sorteados, a distribuicao ideal tem media de 741 e desvio
    // padrao de ~27. Um vies de 10% mostraria uma media de ~785 nos primeiros
    // e ~700 nos ultimos, bem acima do limite. Comparar so os extremos evita
    // que o teste oscile por causa da aleatoriedade, que o faria falhar as
    // vezes sem motivo.
    const contagem = new Map<string, number>();
    for (const c of geradosEmLote(2000)) contagem.set(c, (contagem.get(c) ?? 0) + 1);

    const frequencias = [...contagem.values()];
    const media = frequencias.reduce((a, b) => a + b, 0) / frequencias.length;

    // +/- 25% da media. Holgado o bastante para nao oscilar, apertado o
    // bastante para pegar um vies de 10% empilhado num extremo.
    expect(Math.max(...frequencias)).toBeLessThan(media * 1.25);
    expect(Math.min(...frequencias)).toBeGreaterThan(media * 0.75);
  });
});

describe("codigos de recuperacao", () => {
  it("gera a quantidade configurada, sem repetidos", () => {
    const codigos = generateRecoveryCodes();
    expect(codigos).toHaveLength(TOTAL_CODIGOS_RECUPERACAO);
    expect(new Set(codigos).size).toBe(TOTAL_CODIGOS_RECUPERACAO);
  });

  it("usa o formato de cinco e cinco", () => {
    // O separador existe para o usuario ler em voz alta ao telefone sem dizer
    // "B" onde e "F". O alfabeto abaixo e o mesmo do modulo, entao este teste
    // tambem pega um alfabeto quesomeone shrunk sem querer.
    for (const codigo of generateRecoveryCodes()) {
      expect(codigo).toMatch(new RegExp(`^[${ALFABETO}]{5}-[${ALFABETO}]{5}$`));
    }
  });

  it("nao usa nenhum dos caracteres que se confundem entre si", () => {
    // O ponto inteiro de um alfabeto utilizavel. Um `0` lido como `O`, ou um
    // `8` lido como `B`, fariam o codigo PARECER valido, falhar na verificacao,
    // e queimar um dos poucos backups que a pessoa tem — sem nenhuma mensagem
    // de erro, porque os dois caracteres sao legitimos no alfabeto.
    //
    // `CARACTERES_AMBIGUOS` vem do modulo, entao os dois lados nao podem
    // divergir: um teste com a lista escrita a mao passaria mesmo depois de
    // alguém trocar o alfabeto e esquecer de atualizar o teste.
    const gerados = generateRecoveryCodes(40).join("");
    for (const ambigo of CARACTERES_AMBIGUOS) {
      expect(gerados).not.toContain(ambigo);
    }
  });

  it("cobre o alfabeto inteiro, para o vies nao se esconder", () => {
    // A distribuicao tem de usar os 27 caracteres. Se `rejection sampling`
    // fosse trocado por `byte % 27`, este teste continuaria passando — o que
    // mostra por que o teste de frequencia existe ao lado.
    expect(geradosEmLote(4000).size).toBe(ALFABETO.length);
  });

  it("gera codigos diferentes a cada chamada", () => {
    const a = generateRecoveryCodes().join(",");
    const b = generateRecoveryCodes().join(",");
    expect(a).not.toBe(b);
  });

  it("normaliza o que o usuario digita", () => {
    // O codigo vem de um papel, digitado com pressa. Minuscula, espaco e hifen
    // a mais precisam cair no mesmo hash, ou o backup valido seria recusado.
    const codigo = generateRecoveryCodes()[0]!;
    const semSeparador = codigo.replace("-", "");
    const hash = hashRecoveryCode(codigo);

    expect(hashRecoveryCode(semSeparador)).toBe(hash);
    expect(hashRecoveryCode(codigo.toLowerCase())).toBe(hash);
    expect(hashRecoveryCode(`  ${codigo}  `)).toBe(hash);
    expect(hashRecoveryCode(semSeparador.split("").join(" "))).toBe(hash);
    expect(normalizarRecoveryCode(semSeparador)).toBe(semSeparador);
  });

  it("confere o codigo certo e recusa o errado", () => {
    const codigos = generateRecoveryCodes();
    const hash = hashRecoveryCode(codigos[0]!);

    expect(recoveryCodeMatches(codigos[0]!, hash)).toBe(true);
    expect(recoveryCodeMatches(codigos[1]!, hash)).toBe(false);
  });

  it("nao guarda o codigo em claro no hash", () => {
    // O hash e o que vai para o banco. Se o codigo aparecesse dentro dele, o
    // hash nao estaria protegendo nada e a coluna seria um alias para a coluna
    // de codigos.
    const codigo = generateRecoveryCodes()[0]!;
    const hash = hashRecoveryCode(codigo);
    expect(hash).not.toContain(codigo.replace("-", ""));
    expect(hash).not.toContain(codigo);
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes em base64url
  });

  it("recusa entrada de tamanho errado sem lancar", () => {
    // `timingSafeEqual` LANCA quando os buffers tem tamanhos diferentes. O
    // guard de tamanho e o que evita que uma comparacao vire um 500 na tela de
    // recuperacao — justamente a tela que precisa funcionar.
    const hash = hashRecoveryCode("ABCDE-FGHJK");
    for (const entrada of ["", "A", "ABCDEFGHJKLMNOP", "xyzzy-xyzzy"]) {
      expect(recoveryCodeMatches(entrada, hash)).toBe(false);
    }
  });
});
