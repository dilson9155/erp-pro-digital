/**
 * Prepara o processo do Vitest para falar com o banco de TESTE.
 *
 * ESTE E O ARQUIVO QUE IMPORTA. Ele roda como `setupFiles` do projeto de
 * integracao e faz duas coisas, nesta ordem:
 *
 * 1. Reescreve `DATABASE_URL` para o schema `erp_test`.
 * 2. Nao deixa `.env` vazar: o resto do ambiente vem do `tests/setup.ts`.
 *
 * POR QUE a ordem importa
 *
 * `src/server/db/client.ts` chama `env()` no CARREGAMENTO do modulo, e `env()`
 * memoiza. Se este arquivo rodar depois do primeiro import do client, o pool
 * ja estaria conectado ao schema `public` — os testes de integracao passariam
 * a rodar no banco de desenvolvimento, que e exatamente o oposto do que a
 * infraestrutura existe para impedir.
 *
 * A URL vem do arquivo temporario escrito por `npm run test:db:setup`, e nao de
 * recalcular aqui: se o script e o setup divergissem, os testes rodariam
 * silenciosamente contra o schema errado.
 */

import { existsSync, readFileSync } from "node:fs";

const CACHE_FILE = "node_modules/.cache/erp-test-db-url";

if (!existsSync(CACHE_FILE)) {
  throw new Error(
    `Banco de teste nao preparado: ${CACHE_FILE} nao existe.\n` +
      `Rode "npm run test:db:setup" antes de "npm run test:integration".`,
  );
}

const testUrl = readFileSync(CACHE_FILE, "utf8").trim();

// `Object.assign` em vez de `process.env.X = ...`: o Next tipa `process.env`
// como somente-leitura, e atribuir direto nao compila. Efeito identico em runtime.
Object.assign(process.env, { DATABASE_URL: testUrl });
