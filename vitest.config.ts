import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Configuracao do Vitest, em DOIS projetos.
 *
 * A separacao nao e estetica. Os dois tipos de teste tem restricoes opostas:
 *
 * UNIT: nao toca o banco, roda em segundos, precisa de feedback imediato a
 * cada `Ctrl+S`. Por isso `watch` e o default em desenvolvimento.
 *
 * INTEGRACAO: depende de Postgres, das migrations aplicadas e de um schema
 * limpo. Roda em segundos tambem, mas exige preparo antes.
 *
 * Se estivessem no mesmo projeto, bastaria o dev rodar `npm test` para o
 * primeiro teste de integracao derrubar o schema de desenvolvimento.
 *
 * O alias `@/` e replicado aqui porque o Vitest resolve imports pelo `vite`, e
 * o `tsconfig.json` sozinho nao basta. Se os dois divergirem, os testes passam
 * a testar um caminho diferente do que a aplicacao usa — o pior tipo de bug em
 * teste, porque o teste passa.
 */
const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: false,

    // No Vitest 4, `coverage` e `poolOptions` sao opcoes da raiz, nao de cada
    // projeto. A cobertura e portanto uma unica, com as duas areas juntas —
    // o que e o correto aqui: `src/server/auth` e `src/server/db` so tem
    // cobertura util quando o teste de integracao roda, e `src/lib` e
    // justamente onde o teste unitario sozinho mede.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**", "src/server/auth/**", "src/server/db/**"],
    },

    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          // `tests/setup.ts` so placeholders de ambiente; nenhum `.env` e lido,
          // entao um teste unitario nao depende da maquina de quem roda.
          setupFiles: ["./tests/setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          // A ordem e obligatoria: `setup.ts` define os placeholders, e
          // `integration/setup.ts` sobrescreve `DATABASE_URL` para o schema de
          // teste. Invertidos, os testes falham com "relation does not exist".
          setupFiles: ["./tests/setup.ts", "./tests/integration/setup.ts"],

          // Serializacao dos ARQUIVOS, e nao dos testes dentro do arquivo.
          //
          // E o que impede a falha mais confusa desta suite: todos os arquivos
          // de integracao dividem UM schema e um `afterEach` que limpa tudo. Em
          // paralelo, o arquivo A executa o DELETE no meio do arquivo B, e o B
          // falha com "record not found" em uma linha que nao tem nada a ver
          // com a limpeza. A falha depende da ordem de execucao, e nao do
          // codigo — o tipo de bug que faz a suite ser desligada.
          //
          // `poolOptions.forks.singleFork` tambem serializaria, mas e
          // redundante: `fileParallelism: false` ja garante que um arquivo so
          // roda apos o outro terminar.
          fileParallelism: false,
          pool: "forks",

          // Migrations em um banco local real custam tempo; o default de 5 s
          // estoura na primeira conexao.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
