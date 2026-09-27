/**
 * Verifica que o isolamento de tenant esta sincronizado com o schema e o banco.
 *
 * POR QUE ISTO EXISTE
 *
 * A extensao em `src/server/db/tenant-guard.ts` decide, em runtime, quais
 * models recebem o filtro automatico de `tenantId`. Se um model novo for
 * criado com a coluna e NAO for registrado na lista, ele passa sem filtro —
 * um vazamento silencioso entre empresas. Nada no compilador reclama: o schema
 * e a lista sao dois lugares, e so o teste sabe uni-los.
 *
 * Este script fecha a falha em tres niveis:
 *
 *  1. SCHEMA: todo model com campo `tenantId` esta na lista?  E todo model na
 *     lista realmente tem `tenantId`?  (ignora os models de plataforma, que
 *     sao declarados explicitamente como isencao)
 *  2. BANCO: as tabelas com coluna `tenant_id` batem com a lista, respeitando
 *     os `@@map`?  Detecta migration nao aplicada.
 *  3. TABELAS DE APOIO: `sessions`, `memberships` e afins tem indice em
 *     `tenant_id`?  Sem indice, o filtro automatico vira table scan e o banco
 *     cai quando o numero de empresas crescer.
 *
 * Uso: `npm run db:verify-tenant`
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
import pg from "pg";

loadDotenv({ path: ".env" });

const SCHEMA_PATH = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));
const GUARD_PATH = fileURLToPath(new URL("../src/server/db/tenant-guard.ts", import.meta.url));

/** Coluna fisica que materializa o escopo de tenant. */
const TENANT_COLUMN = "tenant_id";

/**
 * Models com `tenantId` INTENCIONALMENTE anulavel, com a razao declarada.
 *
 * Um `tenantId` anulavel num model de negocio e um furo: a linha fica sem dono
 * e nenhum filtro por empresa a encontra. Estes dois sao excecoes consciente e
 * cada uma tem regra propria no guard (`OPTIONAL_TENANT_MODELS`).
 *
 * - `Role`: `tenantId = null` marca o perfil de SISTEMA (matriz padrao de
 *   permissoes que e clonada para cada empresa). Sem essa linha anulavel nao
 *   existiria uma matriz unica da qual clonar.
 * - `Session`: `tenantId = null` representa a sessao ainda NAO vinculada a uma
 *   empresa, durante a tela de escolha (login sem tenant automatico). Filtrar
 *   sessao por empresa destruiria essa tela.
 *
 * Ao adicionar um model aqui, o motivo precisa caber nestas duas linhas.
 */
const NULLABLE_TENANT_MODELS = new Map<string, string>([
  ["Role", "perfil de sistema clonado por empresa"],
  ["Session", "sessao pre-escolha de empresa"],
]);

interface SchemaModel {
  name: string;
  table: string;
  hasTenantId: boolean;
  tenantIdOptional: boolean;
  hasTenantIndex: boolean;
}

/** Lê `prisma/schema.prisma` e extrai o que interessa por model. */
async function readSchemaModels(): Promise<SchemaModel[]> {
  const source = await readFile(SCHEMA_PATH, "utf8");

  // Remove comentarios de linha para nao interpretar exemplo em `///`.
  const withoutComments = source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");

  const models: SchemaModel[] = [];
  // `model Nome {` ... `}` — o schema nao usa chaves aninhadas dentro de model.
  const blocks = withoutComments.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);

  for (const block of blocks) {
    const name = block[1]!;
    const body = block[2]!;

    const mapMatch = /@@map\("([^"]+)"\)/.exec(body);
    const table = mapMatch?.[1] ?? defaultTableName(name);

    const fieldMatch = /^\s*tenantId\s+(\w+)(\[\])?(\?)?/m.exec(body);
    const hasTenantId = fieldMatch !== null;
    const tenantIdOptional = hasTenantId && fieldMatch?.[3] === "?";
    const hasTenantIndex =
      /@@index\(\[tenantId/.test(body) || /@@unique\(\[tenantId/.test(body);

    models.push({ name, table, hasTenantId, tenantIdOptional, hasTenantIndex });
  }

  if (models.length === 0) throw new Error("Nenhum model encontrado no schema.");
  return models;
}

function defaultTableName(model: string): string {
  return model
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase() + "s";
}

/** Extrai a lista de models declarada no arquivo do guard. */
async function readDeclaredModels(): Promise<string[]> {
  const source = await readFile(GUARD_PATH, "utf8");
  const match = /TENANT_SCOPED_MODELS[^=]*=\s*\[([\s\S]*?)\n\]/.exec(source);
  if (!match) {
    throw new Error(
      "Nao foi possivel localizar TENANT_SCOPED_MODELS em src/server/db/tenant-guard.ts. " +
        "Se renomeou a constante, atualize este script.",
    );
  }
  const names = [...match[1]!.matchAll(/"([A-Za-z0-9_]+)"/g)].map((entry) => entry[1]!);
  if (names.length === 0) throw new Error("TENANT_SCOPED_MODELS esta vazio.");
  return names;
}

/** Tabelas com coluna `tenant_id` e quais tem indice-util (nao unique). */
interface DbInfo {
  tablesWithColumn: string[];
  unindexed: string[];
}

async function readDatabase(): Promise<DbInfo> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL ausente. Rode da raiz do projeto com o .env carregado: `npm run db:verify-tenant`.",
    );
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT c.table_name
         FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_name = $1
        ORDER BY c.table_name`,
      [TENANT_COLUMN],
    );

    // Uma coluna esta "indexada" se algum indice a usa como PRIMEIRA coluna.
    // Isso vale tambem para indices unicos: `WHERE tenant_id = $1` e uma
    // busca por igualdade, e o indice unico a atende perfeitamente. O que nao
    // ajuda e um indice unico onde tenant_id NAO e a primeira coluna
    // (ex.: `@@unique([bankAccountId, period])`), e esse caso cai no relatorio
    // por nao aparecer aqui.
    const { rows: indexedRows } = await client.query<{ table_name: string }>(
      `SELECT DISTINCT t.relname AS table_name
         FROM pg_index i
         JOIN pg_class t ON t.oid = i.indrelid
         JOIN pg_attribute a
           ON a.attrelid = i.indrelid
          AND a.attnum = i.indkey[0]
        WHERE t.relnamespace = 'public'::regnamespace
          AND a.attname = $1
          AND NOT i.indisprimary`,
      [TENANT_COLUMN],
    );
    const indexed = new Set(indexedRows.map((row) => row.table_name));
    const tablesWithColumn = rows.map((row) => row.table_name);

    return {
      tablesWithColumn,
      unindexed: tablesWithColumn.filter((table) => !indexed.has(table)),
    };
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const [models, declared, db] = await Promise.all([
    readSchemaModels(),
    readDeclaredModels(),
    readDatabase(),
  ]);

  const problems: string[] = [];

  // --- 1. SCHEMA <-> LISTA ------------------------------------------------
  const declaredSet = new Set(declared);
  const schemaSet = new Set(models.map((model) => model.name));

  for (const model of models) {
    if (model.hasTenantId && !declaredSet.has(model.name)) {
      problems.push(
        `VAZAMENTO: model "${model.name}" tem tenantId mas nao esta em TENANT_SCOPED_MODELS. ` +
          `Sem registro, queries nele rodam sem filtro.`,
      );
    }
    if (!model.hasTenantId && declaredSet.has(model.name)) {
      problems.push(
        `INCOERENTE: "${model.name}" esta em TENANT_SCOPED_MODELS mas o schema nao declara tenantId.`,
      );
    }
    if (model.tenantIdOptional && !NULLABLE_TENANT_MODELS.has(model.name)) {
      problems.push(
        `PERIGO: "${model.name}" declara tenantId anulavel sem justificativa em ` +
          `NULLABLE_TENANT_MODELS. Um model de negocio com tenantId anulavel ` +
          `permite linha sem dono, que nenhum filtro por empresa encontra.`,
      );
    }
    if (model.tenantIdOptional && NULLABLE_TENANT_MODELS.has(model.name) && !declaredSet.has(model.name)) {
      problems.push(
        `INCOERENTE: "${model.name}" tem tenantId anulavel e precisa de regra no guard, ` +
          `mas nao esta em TENANT_SCOPED_MODELS.`,
      );
    }
  }

  for (const name of declared) {
    if (!schemaSet.has(name)) {
      problems.push(`INCOERENTE: "${name}" esta na lista mas nao existe no schema.`);
    }
  }

  // --- 2. LISTA <-> BANCO -------------------------------------------------
  const tableToModel = new Map(models.map((model) => [model.table, model.name]));
  const expectedTables = new Set(
    models.filter((model) => declaredSet.has(model.name)).map((model) => model.table),
  );

  for (const table of db.tablesWithColumn) {
    const model = tableToModel.get(table);
    if (model && !expectedTables.has(table)) {
      problems.push(
        `DIVERGENCIA: tabela "${table}" (model ${model}) tem ${TENANT_COLUMN} no banco, ` +
          `mas o model nao esta na lista. A migration esta adiantada em relacao ao codigo.`,
      );
    }
  }
  for (const table of expectedTables) {
    if (!db.tablesWithColumn.includes(table)) {
      problems.push(
        `MIGRATION PENDENTE: a lista espera a coluna ${TENANT_COLUMN} em "${table}", ` +
          `mas ela nao existe no banco. Rode: npm run db:migrate:deploy`,
      );
    }
  }

  // --- 3. INDICES ---------------------------------------------------------
  for (const table of db.unindexed) {
    const model = tableToModel.get(table);
    problems.push(
      `SEM INDICE: "${table}"${model ? ` (${model})` : ""} tem ${TENANT_COLUMN} mas nenhum ` +
        `indice com essa coluna na posicao inicial. O filtro automatico fara table scan.`,
    );
  }

  if (problems.length > 0) {
    throw new Error(
      ["Verificacao de isolamento de tenant FALHOU:", ...problems.map((p) => `  - ${p}`)].join("\n"),
    );
  }

  process.stdout.write(
    [
      `OK: ${declared.length} models com tenantId conferem com o schema e o banco.`,
      `OK: todas as ${db.tablesWithColumn.length} colunas ${TENANT_COLUMN} possuem indice util.`,
    ].join("\n") + "\n",
  );
}

void (async () => {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
})();
