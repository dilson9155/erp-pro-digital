/**
 * Verificacao do banco de PRODUCAO, executada durante o build da Vercel.
 *
 * ## POR QUE ISTO EXISTE
 *
 * A `DATABASE_URL` de producao esta na Vercel como **Secret**, que e
 * write-only: nem o painel mostra o valor de volta. Isso significa que, do
 * lado de fora, nao ha como responder "as migrations estao aplicadas? o banco
 * tem seed?" sem um processo rodando DENTRO da Vercel, que enxerga a variavel.
 *
 * A Vercel expoe as variables de ambiente do target durante o build, entao este
 * script roda ali e imprime o resultado no log do build - que e o unico lugar
 * onde a resposta pode ser lida.
 *
 * ## POR QUE ISTO E SOMENTE LEITURA
 *
 * Este script NAO cria tabela, NAO altera dado e NAO roda migration. Ele
 * pergunta e imprime. Quem muda o schema e o `prisma migrate deploy`, que roda
 * logo antes dele no build command.
 *
 * ## POR QUE NAO HA NENHUM NOME, EMAIL OU SENHA NO OUTPUT
 *
 * O log de build fica visivel para quem tem acesso ao projeto na Vercel, e um
 * log e o lugar pior para vazar dado de cliente. O script imprime contagens e
 * booleanos, que dizem o que precisa ser dito ("falta seed", "migration
 * pendente") sem dizer de QUEM.
 */

import { Client } from "pg";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[verificar-producao] DATABASE_URL ausente no build.");
    process.exitCode = 1;
    return;
  }

  // Nome e host sao uteis para o log (sao de infraestrutura, nao de cliente) e
  // nao exigemPrivilegio de nenhum dado de usuario.
  const parsed = new URL(url);
  console.log(`[verificar-producao] host=${parsed.hostname} banco=${parsed.pathname.slice(1)}`);

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const migrations = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    console.log(`[verificar-producao] migrations aplicadas: ${migrations.rows[0]?.count}`);

    const tabelas = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = current_schema()`,
    );
    console.log(`[verificar-producao] tabelas no schema: ${tabelas.rows[0]?.count}`);

    // A migration 20260928090000 troca o indice unico de documento por filial.
    // Sem ela, a segunda filial de uma empresa colide com o numero da primeira.
    const indice = await client.query<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = current_schema() AND indexname = 'sales_tenant_id_branch_id_number_key'
       ) AS existe`,
    );
    console.log(
      `[verificar-producao] indice por filial aplicado: ${indice.rows[0]?.existe === true}`,
    );

    // Seed: sem usuario nao ha login, e o app parece quebrado sem ser.
    const users = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users`,
    );
    const tenants = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM tenants`,
    );
    console.log(`[verificar-producao] usuarios: ${users.rows[0]?.count}`);
    console.log(`[verificar-producao] empresas: ${tenants.rows[0]?.count}`);
    console.log(
      `[verificar-producao] seed aplicado: ${Number(users.rows[0]?.count ?? 0) > 0}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.log("[verificar-producao] FALHA ao consultar o banco de producao.");
  console.log(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
