import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 — configuração do CLI.
 *
 * Breaking changes do Prisma 7 que afetam este projeto:
 *   - `generator client` passou a exigir `output` (client não vai mais para node_modules).
 *   - `url` saiu do `datasource` e vive aqui.
 *   - O client exige um driver adapter em tempo de execução (ver `src/server/db/client.ts`).
 */
export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
  views: {
    // `prisma migrate dev` usa esta view para detectar drift em tempo de design.
    // Habilitada apenas quando o usuário solicita. Descomente se necessário.
    // enabled: false,
  },
});
