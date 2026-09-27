/**
 * Infraestrutura do banco de teste.
 *
 * FONTE UNICA DE VERDADE
 *
 * `scripts/setup-test-db.mts` (CLI) e o `setupFiles` do projeto de integracao
 * do Vitest importam DESTE arquivo. Se cada um calculasse a URL do banco de
 * teste por conta propria, uma mudanca no schema de testejetaria em um lado e
 * o outro continuaria apontando para o schema antigo — e o sintoma seria um
 * `relation "sessions" does not exist` em vez de um erro de configuracao.
 *
 * POR QUE SCHEMA E NAO BANCO
 *
 * O papel `erp_app` e dono de `erp_prod_digital`, mas nao tem `CREATEDB`, e este
 * projeto nao guarda senha de superuser. A saida e um schema separado no mesmo
 * banco:
 *
 *   postgresql://erp_app:...@localhost:5432/erp_prod_digital?schema=erp_test
 *
 * O `search_path` dos testes passa a ser `erp_test`, entao as 80 tabelas do
 * schema `public` ficam INVISIVEIS. Um `TRUNCATE ... CASCADE` exagerado, ou
 * uma migration que falha no meio, nao alcanca o banco de desenvolvimento.
 *
 * O preco: os dois schemas compartilham o WAL e o cache de plano do Postgres.
 * Para um banco local de desenvolvimento isso e irrelevante; para o CI, o
 * isolamento por banco continua sendo preferivel, e a troca e feita trocando
 * `testDatabaseUrl` por uma URL com outro pathname.
 */

import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import pg from "pg";

/** Schema usado pelos testes. Precisa existir explicitamente no Postgres. */
export const TEST_SCHEMA = "erp_test";

/** Monta uma `DATABASE_URL` apontando para um schema especifico. */
export function testDatabaseUrl(baseUrl: string, schema: string = TEST_SCHEMA): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

/**
 * Le a `DATABASE_URL` de desenvolvimento do `.env`.
 *
 * A senha nunca e logada: os chamadores imprimem apenas schema e contagem de
 * tabelas. Se o `.env` nao existir, a mensagem diz isso explicitamente em vez
 * de propagar `undefined is not a string`, que nao ajuda ninguem.
 */
export async function readDevDatabaseUrl(): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(".env", "utf8");
  } catch {
    throw new Error(
      "Nao foi possivel ler o .env. Copie .env.example para .env e preencha DATABASE_URL.",
    );
  }

  const url = parse(raw).DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente no .env");
  return url;
}

/** Garante que o schema de teste existe. */
export async function ensureSchema(adminUrl: string, schema: string = TEST_SCHEMA): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    // DDL nao aceita parametro vinculado, e `schema` vem da constante
    // `TEST_SCHEMA` deste arquivo — nunca de entrada do usuario.
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await client.end();
  }
}

/**
 * Ordem de limpeza: filhos ANTES dos pais.
 *
 * `DELETE` nao tem `CASCADE` (isso e do `TRUNCATE`). Se a limpeza rodar na
 * ordem alfabetica, `DELETE FROM plans` estoura com violacao de FK porque ainda
 * existe `tenants` apontando para ele (`onDelete: Restrict`).
 *
 * A ordem e calculada do CATALOGO do Postgres, nao de uma lista escrita a mao.
 * Uma lista manual tem o custo invisivel de ser silenciosamente incorreta:
 * alguem adiciona um model novo com FK para `plans`, esquece de acrescentar a
 * tabela na lista, e a suite comeca a falhar por causa de uma tabela que o
 * teste nem usa. Lendo `pg_constraint`, a ordem se ajusta sozinha quando o
 * schema muda, e um teste novo nao pode quebrar a limpeza dos antigos.
 *
 * Kahn em ordem reversa: comeca nas tabelas que nao sao pai de ninguem dentro
 * do schema (as folhas) e vai removendo.
 */
async function ordemFilhosPrimeiro(client: pg.Client, schema: string): Promise<string[]> {
  const { rows } = await client.query<{ child: string; parent: string }>(
    `SELECT child.relname AS child, parent.relname AS parent
       FROM pg_constraint con
       JOIN pg_class child  ON child.oid  = con.conrelid
       JOIN pg_class parent ON parent.oid = con.confrelid
       JOIN pg_namespace ns_child  ON ns_child.oid  = child.relnamespace
       JOIN pg_namespace ns_parent ON ns_parent.oid = parent.relnamespace
      WHERE con.contype = 'f'
        AND ns_child.nspname  = $1
        AND ns_parent.nspname = $1`,
    [schema],
  );

  // pai -> filhos: para remover um pai, todos os filhos precisam ter saido.
  //
  // AUTO-REFERENCIAS SAO DESCARTADAS, e o detalhe importa. O schema tem
  // `categories.parentCategoryId`, `chartOfAccounts.parentAccountId` e
  // `invoices` apontando para si mesmas. Se elas entrassem no grafo, o Kahn
  // travaria — mas nao existe ciclo: `DELETE FROM categories` apaga TODAS as
  // linhas numa unica instrucao, e a constraint so e avaliada no fim do
  // comando, quando ja nao ha linha apontando para linha nenhuma.
  //
  // Ou seja: auto-referencia so seria problema se a limpeza fosse linha a
  // linha. Como e uma instrucao unica por tabela, o Postgres resolve sozinho.
  const dependeDe = new Map<string, string[]>();
  for (const { child, parent } of rows) {
    if (child === parent) continue;
    const atuais = dependeDe.get(parent) ?? [];
    atuais.push(child);
    dependeDe.set(parent, atuais);
  }

  const restantes = new Set(await listarTabelas(client, schema));
  const ordem: string[] = [];

  while (restantes.size > 0) {
    // "Pronto" = nao e pai de nenhuma tabela que ainda esteja de pe.
    const prontos = [...restantes].filter((tabela) =>
      (dependeDe.get(tabela) ?? []).every((filho) => !restantes.has(filho)),
    );

    if (prontos.length === 0) {
      // Ciclo de FK: nao existe ordem linear possivel, e `DELETE` nao tem o
      // `CASCADE` do `TRUNCATE`. Falhar aqui, com o nome das tabelas envolvidas,
      // e melhor que devolver uma ordem arbitraria: o teste seguinte falharia
      // com violacao de FK e a culpa cairia no schema, nao na causa real.
      throw new Error(
        `Ciclo de FK entre tabelas de '${schema}'; nenhuma ordem de DELETE resolve. ` +
          `Tabelas restantes: ${[...restantes].sort().join(", ")}`,
      );
    }

    for (const tabela of prontos) {
      ordem.push(tabela);
      restantes.delete(tabela);
    }
  }

  return ordem;
}

/** Tabelas do schema, ja filtradas para identificadores seguros. */
async function listarTabelas(client: pg.Client, schema: string): Promise<string[]> {
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename
       FROM pg_tables
      WHERE schemaname = $1
        AND tablename <> '_prisma_migrations'`,
    [schema],
  );
  // Identificadores vem de `pg_tables`, nao de entrada do usuario. Ainda
  // assim, filtrar o que nao parece nome de tabela evita que um nome
  // inesperado vire DDL injetado.
  return rows.map((row) => row.tablename).filter((name) => /^[a-z_][a-z0-9_]*$/.test(name));
}

/**
 * Esvazia as tabelas de teste, preservando o schema.
 *
 * POR QUE `DELETE` E NAO `TRUNCATE`
 *
 * `TRUNCATE` e a escolha obvia — e o que o comentario original defendia — mas
 * foi medido neste projeto e nos deu 2 s por chamada:
 *
 *   TRUNCATE das 82 tabelas, 1a vez ......... 1960 ms
 *   TRUNCATE das 82 tabelas, 2a vez ......... 2114 ms
 *   DELETE das 82 tabelas, 1 round-trip .....    8 ms
 *   SELECT 1 (baseline de rede) ............    1 ms
 *
 * O tempo e CONSTANTE, e por isso nao e volume de dados: sao 2 s mesmo com as
 * tabelas vazias. `TRUNCATE` e DDL — o Postgres cria um relfilenode novo por
 * tabela em vez de apagar as linhas, e criar ~82 arquivos dominates a conta em
 * disco do Windows. Com 25 testes e um `afterEach`, sao 50 s de suite gastas
 * recriando arquivos que ninguem le.
 *
 * `DELETE` paga por linha, entao com tabelas vazias custa o tempo de rede — e
 * as 82 instrucoes vao em UM round-trip, encadeadas por `;` numa unica query.
 *
 * POR QUE NAO `DROP` + reaplicar migrations
 *
 * Reprovaria o teste de migracao: qualquer teste passaria a falhar se a
 * migration estivesse quebrada, e a suite passaria a medir duas coisas ao
 * mesmo tempo.
 *
 * SOBRE `RESTART IDENTITY`
 *
 * `TRUNCATE ... RESTART IDENTITY` zerava as sequencias. `DELETE` nao pode.
 * A unica tabela com `autoincrement` no schema e `number_sequences.sequence`;
 * nenhuma outra usa identidade. E o motivo original para zerar a sequencia
 * — "dois testes devem ver o mesmo `id`" — era um sinal de teste mal
 * escrito: o id correcto e o que a factory devolveu, nunca um literal. Nenhum
 * teste deste projeto compara id com constante.
 */
export async function truncateAll(url: string, schema: string = TEST_SCHEMA): Promise<void> {
  const client = new pg.Client({ connectionString: testDatabaseUrl(url, schema) });
  await client.connect();
  try {
    const tabelas = await listarTabelas(client, schema);
    if (tabelas.length === 0) return;

    const ordem = await ordemFilhosPrimeiro(client, schema);

    // Uma unica query multi-statement, nao um `await` por tabela. O
    // protocolo de query simples do Postgres executa a sequencia inteira em
    // uma ida e volta: 82 round-trips locais custariam ~8 ms, e em rede (CI
    // com o banco em outro host) custariam segundos.
    //
    // A ordem dos `DELETE` e irrelevante para atomicidade — nao ha parametro
    // vinculado, entao o Postgres ja envolve o lote num unico implicito
    // transaction. O `BEGIN` explicito existe so para o log de erro apontar a
    // tabela que falhou.
    const sql = ordem.map((tabela) => `DELETE FROM "${tabela}"`).join(";\n");

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
    } catch (erro) {
      await client.query("ROLLBACK");
      throw erro;
    }
  } finally {
    await client.end();
  }
}

/** Numero de tabelas de um schema. Usado para conferir se as migrations rodaram. */
export async function countTables(url: string, schema: string): Promise<number> {
  const client = new pg.Client({ connectionString: testDatabaseUrl(url, schema) });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1",
      [schema],
    );
    return rows[0]?.n ?? 0;
  } finally {
    await client.end();
  }
}
