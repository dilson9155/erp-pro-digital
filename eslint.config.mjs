import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/**
 * Configuracao do ESLint (flat config).
 *
 * POR QUE NAO HA `FlatCompat` AQUI
 *
 * A receita antiga para Next + ESLint 9 era envolver o `eslint-config-next`
 * em `FlatCompat`, que traduz o formato eslintrc (.eslintrc) para flat. Isso
 * funciona com versoes antigas do pacote, mas o `eslint-config-next` 16 ja
 * EXPORTA flat config nativa (`eslint-config-next/core-web-vitals` e
 * `.../typescript` retornam arrays). Passar arrays por dentro do `FlatCompat`
 * quebra com `Converting circular structure to JSON`, porque o tradutor tenta
 * normalizar objetos de plugin que tem referencia circular entre si.
 *
 * Portanto: importa direto, sem intermediario.
 */
/**
 * Restricoes de import de `src/`, compartilhadas por varios blocos.
 *
 * Sao constantes, e nao literais repetidos, porque o bloco que restringe
 * `prismaCommon` precisa REPOR a mesma base com uma restricao a mais. Copiar a
 * lista as duas vezes faria a proxima regra ser adicionada em um dos lados e
 * forgotten no outro — e o esquecimento silencioso e o problema que estas regras
 * existem para resolver.
 */
const restricoesSrc = {
  patterns: [
    {
      group: ["@/server/*", "@/server/**"],
      message:
        "Modulo de servidor nao pode ser importado fora de src/server/. Use uma Server Action ou uma Route Handler.",
    },
    {
      group: ["@/generated/prisma/*", "@/generated/prisma/**"],
      message:
        "O Prisma Client so pode ser usado no servidor. Importar aqui expoe o client no bundle do navegador.",
    },
  ],
};

/**
 * `prismaCommon` — o client SEM escopo de tenant.
 *
 * Este e o client que, se vazar para o codigo de negocio, permite a consulta
 * que o ADR 0002 existe para impedir: `prismaCommon.sale.findMany()` traz as
 * vendas de todas as empresas, sem erro e sem rastro.
 *
 * A restricao e por SIMBOLO, nao por modulo: `@/server/db/client` tambem exporta
 * `withTenant` e `checkDatabase`, que sao legitimos fora de `auth`. Bloquear o
 * modulo inteiro empurraria o codigo a duplicar a query, que e pior do que o
 * que a regra evita.
 *
 * Sao permitidos apenas:
 * - `src/server/db/scoped.ts`, que constroi o client protegido a partir dele;
 * - `src/server/auth/**`, que autentica antes de existir tenant. Uma sessao sem
 *   empresa e o estado normal entre o login e a escolha, e nao um bug.
 */
const restrictCommon = {
  paths: [
    {
      importNames: ["prismaCommon"],
      name: "@/server/db/client",
      message:
        "prismaCommon nao tem escopo de tenant. Use scopedDb() de @/server/db/scoped, " +
        "ou withTenant(tenantId, fn, { reason }). O acesso sem escopo so e legitimo em src/server/auth/.",
    },
  ],
};

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts",
      // Client gerado pelo Prisma. Formato, estilo e nomes sao do Prisma.
      "src/generated/**",
      "public/sw.js",
      "public/workbox-*.js",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // LINT TIPADO
    //
    // `no-floating-promises` e `require-await` so funcionam com informacao de
    // tipos. Sem este bloco, o ESLint carrega a regra e aborta com
    // "requires type information". `projectService` faz o cache por tsconfig
    // sozinho, sem listar tsconfig arquivo por arquivo.
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
    },
  },
  {
    // Regras que exigem TypeScript E informacao de tipos. Vivem num bloco
    // separado porque nao podem ser aplicadas a arquivos `.mjs`: uma regra
    // tipada em arquivo sem tsconfig faz o ESLint abortar a execucao inteira,
    // e nao apenas avisar.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // O projeto e TypeScript estrito: `any` explicito e sempre um bug.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // `no-floating-promises` e a regra que impede `db.sale.findMany()` sem
      // `await` nem `void`: um `await` esquecido nao da erro de compilacao e
      // faz a tela carregar dado velho sem erro visivel.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/require-await": "error",
    },
  },
  {
    // `no-restricted-imports` global: nenhum arquivo sobe dois niveis saindo
    // do proprio diretorio. Caminho relativo longo e o que permite, sem o
    // compilador perceber, um import que atravessa a fronteira de modulo.
    files: ["**/*.{ts,tsx,mjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../*", "../../../*"],
              message:
                "Use o alias @/ para imports dentro de src/. Nao use caminho relativo para fora do modulo.",
            },
          ],
        },
      ],
    },
  },
  {
    // O app usa o alias, entao a restricao acima nao se aplica a src/.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // REGRA CRITICA DE ISOLAMENTO
    //
    // Client Component roda no navegador. Se ele importar `prismaCommon` (ou
    // qualquer modulo que carregue `@/generated/prisma/client`), o bundle
    // cliente passa a incluir o Prisma inteiro e a conexao com o banco
    // aparece no JavaScript entregue ao usuario. Alem do vazamento de
    // credenciais em potencial, o build quebra.
    //
    // `src/server/**` e privado do servidor por convencao E por esta regra.
    // O import dinamico de `server-only` foi descartado de proposito: o
    // pacote lanca excecao em Node puro, o que quebraria o seed, os scripts
    // e os testes, que tambem precisam acessar a mesma camada.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: restricoesSrc.patterns }],
    },
  },
  {
    // FRONTEIRA DO CLIENT SEM ESCOPO — parte 1: quem esta FORA do servidor.
    //
    // Alem das restricoes acima, barra o simbolo `prismaCommon`. Se um Client
    // Component o importasse, alem de vazar o bundle ele teria um caminho
    // trivial para dado de qualquer empresa.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**"],
    rules: {
      "no-restricted-imports": ["error", { ...restricoesSrc, ...restrictCommon }],
    },
  },
  {
    // FRONTEIRA DO CLIENT SEM ESCOPO — parte 2: quem esta DENTRO do servidor.
    //
    // Este bloco e separado do anterior de proposito. As restricoes de
    // `patterns` acima so fazem sentido para quem esta de fora de `src/server/`;
    // reaplicar-las aqui acusaria `session.ts` de importar `@/server/db/client`,
    // que e o uso mais legitimo que existe no projeto.
    //
    // A razao de a regra existir, e nao um comentario no arquivo: o comentario de
    // `client.ts` diz "o codigo de aplicacao NUNCA deve importar daqui" ha
    // meses, e comentario nao falha quando alguem importa. Regra de lint falha.
    files: ["src/server/**/*.{ts,tsx}"],
    ignores: ["src/server/auth/**", "src/server/db/scoped.ts"],
    rules: {
      "no-restricted-imports": ["error", restrictCommon],
    },
  },
  {
    // Os dois arquivos legitimamente autorizados a tocar no client sem escopo:
    // `scoped.ts` o consome para construir o client protegido, e a autenticacao
    // o consome porque login acontece antes de existir empresa.
    files: ["src/server/auth/**/*.{ts,tsx}", "src/server/db/scoped.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // Infraestrutura: Node puro, sem React, e `console` e o meio natural de
    // reportar progresso de CLI (seed, migrations, verificacoes). Cobre `.mts`,
    // que o Next usa para modulo com `import.meta`.
    files: ["prisma/**/*.ts", "scripts/**/*.{ts,mts}", "*.config.ts", "*.config.mjs"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // `next.config.ts` define `headers()` e `redirects()` como `async`, e
    // isso e exigencia da assinatura do Next, nao esquecimento. Sem `await`
    // dentro delas, `require-await` acusaria um problema que nao existe.
    files: ["next.config.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    // Testes montam objetos incompletos de proposito, para verificar o
    // comportamento sob dado faltando.
    files: ["tests/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default eslintConfig;
