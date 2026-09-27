import pino, { type Logger } from "pino";

import { env, isProduction } from "@/lib/env";

/**
 * Logger estruturado (Pino).
 *
 * Por que Pino e nao `console.log`:
 * - em producao, o formato precisa ser JSON de uma linha para agregadores
 *   (Vercel/Datadog/Loki) indexarem por campo;
 * - `console.log` nao tem nivel, nem timestamp confiavel, nem redaction;
 * - `pino` e o logger mais rapido do ecosystem Node e nao bloqueia o event loop.
 *
 * REGRA: nunca logar segredo. Use `redact` abaixo e, ao logar um payload de
 * terceiros, passe por `sanitizeForLog` (ver `src/lib/logging/redact.ts`).
 */

/**
 * Chaves cujo valor NUNCA pode aparecer no log. O padrao cobre erros comuns
 * (login, pagamento, fiscal). Ao lidar com um novo provedor, ADICIONE as
 * credenciais dele aqui em vez de confiar em disciplina individual.
 */
const redactPaths = [
  "password",
  "passwordHash",
  "password_hash",
  "newPassword",
  "currentPassword",
  "confirmPassword",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "idToken",
  "id_token",
  "authorization",
  "Authorization",
  "cookie",
  "set-cookie",
  "secret",
  "clientSecret",
  "client_secret",
  "apiKey",
  "api_key",
  "apiToken",
  "api_token",
  "webhookSecret",
  "webhook_secret",
  "sessionToken",
  "session_token",
  "authSecret",
  "AUTH_SECRET",
  "*.password",
  "*.token",
  "*.secret",
  "*.apiKey",
  "*.passwordHash",
  "*.creditCard",
  "*.cardNumber",
  "*.cvv",
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "config.clientSecret",
  "config.accessToken",
] as const;

let cached: Logger | undefined;

function createLogger(): Logger {
  const config = env();

  return pino({
    // `trace` e `debug` geram volume alto sem valor operacional em producao.
    // O teto e aplicado aqui, na unica criacao do logger.
    level: isProduction() && config.LOG_LEVEL === "trace" ? "debug" : config.LOG_LEVEL,
    // JSON de uma linha e obrigatorio em producao. `pretty` so em dev.
    ...(config.LOG_PRETTY && !isProduction()
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname,service",
              messageFormat: "{if module}[{module}] {end}{msg}",
            },
          },
        }
      : {}),
    base: {
      service: config.LOG_SERVICE_NAME,
      env: config.NODE_ENV,
    },
    redact: {
      paths: [...redactPaths],
      censor: "[REDACTED]",
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

/** Logger raiz do processo. Importar de qualquer modulo do servidor. */
export function logger(): Logger {
  cached ??= createLogger();
  return cached;
}

/** Atalho: `log("sales")` devolve um logger com `{ module: "sales" }`. */
export function log(module: string): Logger {
  return logger().child({ module });
}

export type { Logger };
