/**
 * Repara mojibake de codificacao multipla em comentarios, de forma mecanica.
 *
 * O QUE ACONTECEU
 *
 * Neste ambiente Windows o texto passou por um caminho que o reinterpretou como
 * Windows-1252 antes de gravar. A letra "i" acentuada (bytes UTF-8 `C3 AD`) foi
 * gravada como U+00C3 seguido de hifen discreto (U+00AD), e ao passar de novo
 * pelo mesmo caminho virou uma sequencia de quatro caracteres. O arquivo continua
 * sendo UTF-8 valido, `tsc` passa, `eslint` passa — e todo comentario do projeto
 * esta ilegivel.
 *
 * POR QUE PRECISA DA TABELA CP1252, E NAO DE "LATIN1"
 *
 * A primeira tentativa deste script usava `Buffer.from(s, "latin1")` e falhou
 * em 340 linhas com "contem caractere acima de U+00FF". O motivo e a resposta:
 * o lado direito da corrupcao e Windows-1252, nao ISO-8859-1. Em cp1252 o byte
 * `83` representa o "f-hook" (U+0192) e o byte `92` representa a aspa simples
 * tipografica (U+2019) — por isso o mojibake classico de apostrofo vem com
 * tres caracteres. ISO-8859-1 nao tem esses caracteres: em latin-1 eles seriam
 * C1 de controle, e o reparo sairia errado.
 *
 * A tabela abaixo cobre exatamente a faixa `0x80`-`0x9F`, que e a unica em que
 * cp1252 difere de latin-1. De `0xA0` a `0xFF` as duas tabelas coincidem.
 *
 * GARANTIAS
 *
 * 1. So linhas que JA contem assinatura de mojibake sao processadas. Uma linha
 *    sem marcador nunca e tocada, por mais legitima que esteja.
 * 2. A linha so e reescrita se, ao final, NAO sobrar marcador e nao aparecer
 *    U+FFFD. Reparo parcial e descartado: e pior que nao reparar.
 * 3. Uma linha com acento correto e `Buffer.from(s, "latin1")` produziria byte
 *    invalido, o vira U+FFFD na decodificacao, e a guarda 2 a rejeita. E o que
 *    torna o script seguro para rodar duas vezes: na segunda passagem os
 *    acentos ja corrigidos disparariam a rejeicao, e nada acontece.
 *
 * Idempotente por construcao.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const TARGETS = ["prisma", "src", "docs", "scripts", "tests"] as const;
const EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".md", ".sql", ".prisma"]);

/**
 * Windows-1252, faixa `0x80`-`0x9F`, mapeada de code point PARA byte.
 *
 * E o inverso da tabela do WHATWG.
 *
 * Os cinco bytes `81`, `8D`, `8F`, `90` e `9D` NAO tem caractere definido em
 * cp1252. O decodificador do WHATWG, ao receber um deles, entrega o controle C1
 * correspondente (U+0081, U+008D, ... U+009D) em vez de falhar — e e assim
 * que `”` (U+201D, bytes `E2 80 9D`) vira `â` + `€` + U+009D num texto
 * corrompido. Como o byte de origem se perdeu, o inverso e a identidade:
 * U+009D volta a ser 0x9D.
 *
 * Sem estas cinco entradas, 30 linhas do schema ficavam sem reparo com
 * "caractere nao representavel em cp1252" — e o primeiro `—` de um comentario
 * derrubava a linha inteira.
 */
const CP1252_REVERSE = new Map<number, number>([
  [0x20ac, 0x80], // euro
  [0x201a, 0x82], // aspa simples baixa-9
  [0x0192, 0x83], // f-hook  <- "f" em mojibake
  [0x201e, 0x84], // aspa dupla baixa-9
  [0x2026, 0x85], // reticencias
  [0x2020, 0x86], // dagger
  [0x2021, 0x87], // double dagger
  [0x02c6, 0x88], // circunflexo modificador
  [0x2030, 0x89], // per mil
  [0x0160, 0x8a], // S caron
  [0x2039, 0x8b], // aspa simples angular
  [0x0152, 0x8c], // OE
  [0x017d, 0x8e], // Z caron
  [0x2018, 0x91], // aspa simples esquerda
  [0x2019, 0x92], // aspa simples direita  <- "'" em mojibake
  [0x201c, 0x93], // aspa dupla esquerda
  [0x201d, 0x94], // aspa dupla direita
  [0x2022, 0x95], // bullet
  [0x2013, 0x96], // traco curto  <- "-" em mojibake
  [0x2014, 0x97], // traco longo
  [0x02dc, 0x98], // til pequeno
  [0x2122, 0x99], // trademark
  [0x0161, 0x9a], // s caron
  [0x203a, 0x9b], // aspa simples angular direita
  [0x0153, 0x9c], // oe
  [0x017e, 0x9e], // z caron
  [0x0178, 0x9f], // Y com diaerese
  // Bytes indefinidos em cp1252: o decodificador entrega o controle C1, e o
  // inverso e a identidade.
  [0x0081, 0x81],
  [0x008d, 0x8d],
  [0x008f, 0x8f],
  [0x0090, 0x90],
  [0x009d, 0x9d],
]);

const LEADERS = new Set([0x00c2, 0x00c3, 0x00e2, 0x00ef, 0x00f0]);
const SOFT_HYPHEN = 0x00ad;
const SECOND_STAGE = new Set([0x0192, 0x00b5, 0x00a0, 0x0131, 0x0133]);

/** `true` quando o texto contem assinatura de mojibake. */
export function hasMarker(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.codePointAt(index);
    if (code === undefined) continue;
    if (code === SOFT_HYPHEN) return true;
    if (LEADERS.has(code)) {
      const next = text.codePointAt(index + 1);
      if (next !== undefined && next > 0x7f) return true;
    }
    if (SECOND_STAGE.has(code)) return true;
  }
  return false;
}

/**
 * Converte para os bytes que a corrupcao teria produzido.
 * Retorna `undefined` se algum caractere nao for representavel em cp1252.
 */
function toBytes(text: string): Buffer | undefined {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) return undefined;
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    const mapped = CP1252_REVERSE.get(code);
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }
    // 0xA0-0xFF: cp1252 e latin-1 coincidem.
    if (code >= 0xa0 && code <= 0xff) {
      bytes.push(code);
      continue;
    }
    return undefined;
  }
  return Buffer.from(bytes);
}

type Repair =
  | { readonly ok: true; readonly fixed: string; readonly passes: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Desfaz as passagens de corrupcao ate o texto estabilizar.
 *
 * Cada passagem: string -> bytes cp1252 -> decodifica como UTF-8. Como a
 * corrupcao e a inversa exata disso, o numero de passagens e igual ao numero
 * de vezes que o texto passou pela maquina.
 */
function repairLine(line: string, maxPasses = 4): Repair {
  if (!hasMarker(line)) return { ok: false, reason: "sem marcador" };

  let current = line;

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const bytes = toBytes(current);
    if (bytes === undefined) {
      return { ok: false, reason: "caractere nao representavel em cp1252" };
    }
    current = bytes.toString("utf8");
    if (current.includes("\uFFFD")) {
      return { ok: false, reason: "round-trip produziu U+FFFD" };
    }
    if (!hasMarker(current)) return { ok: true, fixed: current, passes: pass };
  }

  return { ok: false, reason: `ainda corrompido apos ${maxPasses} passagens` };
}

async function collectFiles(dir: string, acc: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    // `generated` e saida do `prisma generate`: os comentarios vem do schema.
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
  const apply = process.argv.includes("--write");
  let filesChanged = 0;
  let linesFixed = 0;
  let passesTotal = 0;
  const skipped: string[] = [];

  for (const root of TARGETS) {
    const files: string[] = [];
    try {
      await collectFiles(resolve(root), files);
    } catch {
      continue;
    }

    for (const file of files) {
      const original = await readFile(file, "utf8");
      const eol = original.includes("\r\n") ? "\r\n" : "\n";
      const lines = original.split(/\r?\n/);

      const out: string[] = [];
      let changed = 0;
      let passesHere = 0;

      for (const line of lines) {
        const result = repairLine(line);
        if (result.ok) {
          out.push(result.fixed);
          changed += 1;
          passesHere += result.passes;
        } else {
          out.push(line);
          if (result.reason !== "sem marcador") {
            skipped.push(`${relative(process.cwd(), file)}: ${result.reason}`);
          }
        }
      }

      if (changed > 0) {
        filesChanged += 1;
        linesFixed += changed;
        passesTotal += passesHere;
        const name = relative(process.cwd(), file);
        console.log(`${apply ? "corrigido" : "reparavel"}: ${name} (${changed} linha(s))`);
        if (apply) await writeFile(file, out.join(eol), "utf8");
      }
    }
  }

  console.log("");
  if (skipped.length > 0) {
    console.log(`${skipped.length} linha(s) NAO reparada(s):`);
    const byReason = new Map<string, number>();
    for (const item of skipped) {
      const reason = item.slice(item.lastIndexOf(": ") + 2);
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    }
    for (const [reason, count] of byReason) console.log(`  ${count}x ${reason}`);
    console.log("");
  }

  const verb = apply ? "Reparado" : "Reparavel";
  console.log(`${verb}: ${linesFixed} linha(s) em ${filesChanged} arquivo(s), ${passesTotal} passagem(ns).`);
  if (!apply) console.log("Use --write para gravar.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
