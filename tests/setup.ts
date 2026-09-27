/**
 * Ambiente minimo para a suite de testes.
 *
 * `src/lib/env.ts` valida o ambiente no primeiro acesso e falha alto, por
 * projeto. Num teste unitario que so exercita logica pura isso vira um obstaculo
 * sem informacao util: o teste nao deveria precisar de um Postgres nem de um
 * `AUTH_SECRET` de verdade para verificar que o filtro de tenant foi injetado.
 *
 * Os valores abaixo sao placeholders, nunca segredos. O `.env` NAO e
 * carregado de proposito: um teste que depende da configuracao da maquina de
 * quem roda deixa de ser reproduzivel, passa local e falha no CI.
 *
 * Testes que precisam do banco de verdade ficam em `tests/integration/`, com o
 * client apontando para o schema `erp_test` (ver `tests/helpers/test-database.ts`).
 */
//
// `Object.assign` em vez de `process.env.X = ...`: o Next tipa `NODE_ENV`
// como somente-leitura, e atribuir direto nao compila. O efeito em runtime e
// o mesmo.
Object.assign(process.env, {
  NODE_ENV: "test",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://teste:teste@localhost:5432/teste_inexistente",
  AUTH_SECRET:
    process.env.AUTH_SECRET ?? "segredo-de-teste-com-tamanho-suficiente-para-o-zod-1234",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "fatal",
  LOG_PRETTY: process.env.LOG_PRETTY ?? "false",
});
