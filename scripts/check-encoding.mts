/**
 * Detecta corrupcao de encoding em arquivos de texto do repositorio.
 *
 * O problema: arquivos atravessam varias ferramentas (editor, terminal, patch,
 * git) e um caractere multibyte mal interpretado vira bytes invalidos. O
 * resultado e um `U+FFFD` (sustituto) ou um caractere de outro alfabeto no meio
 * de um comentario em portugues. Passa em `tsc`, passa em `eslint`, e fica na
 * base de codigo para sempre.
 *
 * Exemplos reais encontrados neste repositorio:
 * - `unicamente` gravado como `u\ufffd\u043a\u043Enico` (cedilha cyrillica)
 * - `so reversivel` gravado como `s\ufffd\u043E revers\ufffd\u043E\ufffdvel`
 * - `LANCA` gravado com A cyrillico
 *
 * Este script nao tenta CORRIGIR: o byte original se perdeu na corrupcao, e
 * adivinhar o texto original automaticamente arriscaoes silenciosas. Ele
 * apenas aponta arquivo e linha, e a correcao e feita com o contexto.
 *
 * Nao e sobre estetica. Um `U+FFFD` num identificador renomeia o simbolo e
 * quebra o build de forma confusa; num comentario, destroi a unica explicacao
 * de por que uma decisao de seguranca foi tomada.
 */

import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

/** Diretorios varridos. */
const ROOTS = ["src", "prisma", "docs", "scripts", "tests"] as const;

/** Extensoes de texto. Binarios e lockfiles ficam de fora. */
const EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".json", ".md", ".sql", ".css"]);

/**
 * Faixas de pontos de codigo que nunca aparecem legitimamente em codigo e
 * comentario deste projeto.
 *
 * Acentuacao portuguesa (U+00C0-U+00FF), seta e tipografia (U+2190-U+2BFF) e
 * emoji (U+1F300+) sao permitidos de proposito. O que segue nao e.
 */
const SUSPECT_RANGES: ReadonlyArray<{ readonly name: string; readonly from: number; readonly to: number }> = [
  { name: "caractere de substituicao (mojibake)", from: 0xfffd, to: 0xfffd },
  { name: "alfabeto cirilico", from: 0x0400, to: 0x04ff },
  { name: "alfabeto grego", from: 0x0370, to: 0x03ff },
  { name: "hiragana/katakana", from: 0x3040, to: 0x30ff },
  { name: "han (CJK)", from: 0x4e00, to: 0x9fff },
  { name: "hangul", from: 0xac00, to: 0xd7af },
  { name: "hebraico", from: 0x0590, to: 0x05ff },
  { name: "arabigo", from: 0x0600, to: 0x06ff },
  { name: "devanagari", from: 0x0900, to: 0x097f },
  { name: "alfabeto privado/special", from: 0xe000, to: 0xf8ff },
];

/**
 * ASSINATURA DE MOJIBAKE "LIMPO".
 *
 * A forma mais comum de corromper UTF-8 NAO produz `U+FFFD`. Ela le os bytes
 * UTF-8 como Windows-1252 e regrava o resultado, o que "funciona": nenhum byte
 * se perde, o arquivo continua sendo UTF-8 valido, e `tsc` nao reclama.
 *
 * Explicado em bytes, para nao depender de mostrar o texto corrompido:
 *
 *   1. `í` (U+00ED) tem os bytes UTF-8 `C3 AD`.
 *   2. Lidos como cp1252: `C3` vira U+00C3 e `AD` vira U+00AD.
 *   3. Regravados em UTF-8, esses dois code points viram `C3 83 C2 AD`.
 *   4. Repetir o passo 2 sobre `C3 83 C2 AD` produz `C3 83 C6 92 C3 82 C2 AD`,
 *      que contem U+0192 (o "f-hook").
 *
 * O detalhe que faz a deteccao confiavel: U+00C3 e U+00C2 NUNCA aparecem
 * sozinhos em portugues. A letra A acentuada e U+00C1, nao U+00C3. Entao um
 * desses dois seguidos de qualquer caractere nao-ASCII e prova de mojibake.
 *
 * Sem essa regra, a primeira versao deste script acusava 109 arquivos "limpos"
 * enquanto o schema tinha "revers" seguido de uma sequencia mojibake no meio de
 * um comentario sobre bcrypt. Erro de deteccao e pior que ausencia de deteccao:
 * da seguranca de que o texto esta bom.
 */
const MOJIBAKE_LEADERS = new Set([0x00c2, 0x00c3, 0x00e2, 0x00ef, 0x00f0]);

/** Hifen discreto. Aparece em mojibake e nunca e digitado de proposito. */
const SOFT_HYPHEN = 0x00ad;

/**
 * Segunda passagem de cp1252, em code point.
 *
 * U+0192 e o byte 0x83, que em cp1252 e um "f-hook" — e o que a corrupcao de
 * `ã` (U+00E3) produz na segunda volta. U+00B5 e o byte 0xB5, tambem resultado
 * de passar `õ` (U+00F5) por essa maquina. U+0131 e U+0133 sao os "i" e "j"
 * com traco, usados em alfabeto turco, e aparecem quando o texto passa por uma
 * codificacao de pagina de codigo turca.
 *
 * Nenhum desses e usado em portugues, e todos tem origem em mojibake.
 */
const MOJIBAKE_SECOND_STAGE = new Set([0x0192, 0x00b5, 0x00a0, 0x0131, 0x0133]);

function describeCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Classifica um caractere como suspeita, ou `undefined` se legitimo. */
function classify(codePoint: number, next: number | undefined): string | undefined {
  const range = SUSPECT_RANGES.find(
    (candidate) => codePoint >= candidate.from && codePoint <= candidate.to,
  );
  if (range) return `${range.name} (${describeCodePoint(codePoint)})`;

  if (codePoint === SOFT_HYPHEN) return "hifen discreto (mojibake)";

  if (MOJIBAKE_LEADERS.has(codePoint)) {
    // `Ã ` e `Â ` sao espaco normal; so o par com nao-ASCII e suspect.
    if (next !== undefined && next > 0x7f) {
      return `mojibake: '${String.fromCodePoint(codePoint)}' antes de '${String.fromCodePoint(next)}' (${describeCodePoint(codePoint)})`;
    }
  }

  if (MOJIBAKE_SECOND_STAGE.has(codePoint)) {
    return `mojibake em segunda passagem (${describeCodePoint(codePoint)})`;
  }

  return undefined;
}

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly kind: string;
  readonly excerpt: string;
}

/** Varre um texto e devolve cada caractere suspeito, com posicao. */
function scanText(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) continue;

    if (codePoint === 0x0a) {
      line += 1;
      lineStart = index + 1;
      continue;
    }

    const range = classify(codePoint, text.codePointAt(index + 1));
    if (!range) continue;

    // Anexa o resto da linha para o trecho ficar legivel no terminal.
    const excerpt = text.slice(lineStart, lineStart + 90).replace(/\n/g, " ").trim();

    findings.push({
      file,
      line,
      column: index - lineStart + 1,
      kind: range,
      excerpt,
    });
  }

  return findings;
}

async function collectFiles(dir: string, acc: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    // `generated` e saida do `prisma generate`; os comentarios vem do schema.
    // Verificar o gerado so produziria ruido que se corrige na origem.
    if (["node_modules", ".next", ".git", "generated"].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(full, acc);
    } else if (entry.name === "schema.prisma" || EXTENSIONS.has(extname(entry.name))) {
      acc.push(full);
    }
  }
}

async function main(): Promise<void> {
  const findings: Finding[] = [];
  let scanned = 0;

  for (const root of ROOTS) {
    const absolute = resolve(root);
    const files: string[] = [];
    try {
      await collectFiles(absolute, files);
    } catch {
      continue; // Raiz ausente (ex.: `docs` ainda nao criado).
    }
    for (const file of files) {
      const text = await readFile(file, "utf8");
      scanned += 1;
      findings.push(...scanText(relative(process.cwd(), file), text));
    }
  }

  if (findings.length === 0) {
    console.log(`OK: ${scanned} arquivos sem corrupcao de encoding.`);
    return;
  }

  const byFile = new Map<string, Finding[]>();
  for (const finding of findings) {
    const list = byFile.get(finding.file) ?? [];
    list.push(finding);
    byFile.set(finding.file, list);
  }

  console.error(`FALHOU: ${findings.length} caractere(s) corrompido(s) em ${byFile.size} arquivo(s).`);
  console.error("");
  for (const [file, list] of byFile) {
    console.error(`  ${file}`);
    for (const finding of list.slice(0, 6)) {
      console.error(`    linha ${finding.line}:${finding.column}  ${finding.kind}`);
      console.error(`      ${finding.excerpt}`);
    }
    if (list.length > 6) console.error(`    ... e mais ${list.length - 6} nesta linha.`);
    console.error("");
  }
  console.error("O byte original se perdeu: corrija o texto com o contexto, nao por script.");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
