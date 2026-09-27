/**
 * CLI que prepara o schema de teste.
 *
 * Este arquivo e so a PONTA DE ENTRADA. A logica esta em
 * `tests/helpers/test-database.ts`, compartilhada com o `setupFiles` do Vitest,
 * para que os dois nunca apontem para schemas diferentes.
 *
 * Uso: `npm run test:db:setup`
 *
 * Ele cria o schema, aplica as migrations e CONFERE que a forma ficou igual a
 * do schema de desenvolvimento. A conferencia final nao e paranoia: um
 * `migrate deploy` que passa mas aplica 0 migrations deixa o banco de teste
 * vazio, e o sintoma aparece como "relation does not exist" blamedo no codigo
 * de negocio.
 */

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  TEST_SCHEMA,
  countTables,
  ensureSchema,
  readDevDatabaseUrl,
  testDatabaseUrl,
} from "../tests/helpers/test-database";

/**
 * Aplica as migrations no schema de teste.
 *
 * Spawna o CLI pelo caminho de entrada em JS, com `process.execPath`, em vez de
 * `npx` com `shell: true`. O `shell: true` concatena argumentos sem escapar
 * (o proprio Node sinaliza isso com DEP0190) e faria a versao do Prisma
 * depender do `PATH`: num CI com varias versoes de Node, isso e a diferenca
 * entre testar as migrations deste repo e as de outro.
 */
function applyMigrations(url: string): void {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(
      `migrate deploy falhou no schema de teste:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
}

/**
 * Exporta a URL do banco de teste para o processo do Vitest.
 *
 * O Vitest roda em outro processo, entao a URL nao pode ficar so na memoria
 * deste script. Um arquivo em `node_modules/.cache` e o veiculo: e reescrito a
 * cada execucao, e o unico lugar versionado que o ignora e' o proprio
 * `node_modules/`.
 *
 * O arquivo CONTEM A SENHA EM TEXTO SIMPLES, e vale ser honesto sobre isso em
 * vez de descrever o esquema como se nao houvesse segredo em disco. A defence
 * aqui nao e criptografia: e que o `.env` do proprio projeto, na mesma arvore
 * de trabalho, ja contem a mesma senha em texto simples. A segunda copia nao
 * acrescenta exposicao relevante, e o caminho alternativo — passar a URL por
 * variavel de ambiente para o processo filho — exigiria que o
 * `setupFiles` do Vitest descobrisse o processo pai, o que acopla os dois
 * mecanismos por um ganho que aqui seria nulo.
 *
 * O que de fato e proibido e IMPRIMIR a URL: `console.log` nesta CLI mostra o
 * caminho do arquivo, nunca o conteudo, porque saida de script vai para log de
 * CI.
 */
async function publishTestUrl(url: string): Promise<string> {
  const target = "node_modules/.cache/erp-test-db-url";

  // `recursive` porque `node_modules/.cache` nasce de ferramentas diferentes
  // (npm, vitest) e pode nao existir em um clone novo. Sem isto, o erro seria
  // `ENOENT` numa pasta que so existe por acaso.
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, url, "utf8");
  return target;
}

async function main(): Promise<void> {
  const devUrl = await readDevDatabaseUrl();
  const testUrl = testDatabaseUrl(devUrl);

  await ensureSchema(devUrl);
  applyMigrations(testUrl);

  const expected = await countTables(devUrl, "public");
  const actual = await countTables(testUrl, TEST_SCHEMA);
  if (actual !== expected) {
    throw new Error(
      `Schema ${TEST_SCHEMA} com ${actual} tabelas, mas o schema public tem ${expected}. ` +
        `As migrations nao foram aplicadas.`,
    );
  }

  const file = await publishTestUrl(testUrl);
  console.log(`Schema ${TEST_SCHEMA} pronto: ${actual} tabelas (igual a public).`);
  console.log(`URL do banco de teste: ${file}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
