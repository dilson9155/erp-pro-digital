import { z } from "zod";

/**
 * Validacao de variaveis de ambiente.
 *
 * Por que Zod e nao `process.env.X ?? "padrao"`:
 * um valor ausente vira `undefined` silenciosamente e o erro aparece no meio
 * de uma request de producao. Aqui a falha acontece no boot.
 *
 * Regras:
 * - Falhar cedo e com mensagem util.
 * - Nenhum segredo tem valor padrao. Ausente = erro, exceto em desenvolvimento.
 * - `NEXT_PUBLIC_*` e lido de `envPublic`, sem validacao de segredo.
 */

/** Converte "1"/"true"/"sim" em booleano; qualquer outro valor e erro. */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value, ctx) => {
    if (typeof value === "boolean") return value;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "sim"].includes(normalized)) return true;
    if (["0", "false", "no", "nao"].includes(normalized)) return false;
    ctx.addIssue({
      code: "custom",
      message: `Valor booleano invalido: "${value}". Use true/false.`,
    });
    return z.NEVER;
  });

const port = z.coerce.number().int().min(1).max(65535);
const positiveInt = z.coerce.number().int().positive();

/**
 * `AUTH_SECRET` precisa de >= 32 bytes de entropia real. O comprimento da string
 * base64url nao garante entropia, entao tambem rejeitamos valores de exemplo
 * conhecida — eles passeariam no tamanho e dariam falsa sensacao de seguranca.
 */
const authSecret = z
  .string()
  .min(32, "AUTH_SECRET deve ter no minimo 32 caracteres")
  .refine((value) => value.trim() === value, {
    message: "AUTH_SECRET nao pode ter espacos no inicio ou fim",
  })
  .refine(
    (value) => !/^(troque|change|secret|exemplo|example|teste|test)/i.test(value),
    { message: "AUTH_SECRET parece um valor de exemplo. Gere um segredo real." },
  );

/**
 * URL do Postgres. Rejeitamos drivers que nao sejam `postgresql` porque
 * `DATABASE_URL` apontando para outro driver indicaria configuracao trocada.
 */
const databaseUrl = z
  .string()
  .min(1, "DATABASE_URL e obrigatorio")
  .refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
    message: "DATABASE_URL deve usar o driver postgresql://",
  });

const optionalUrl = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  })
  .refine((value) => value === undefined || z.url().safeParse(value).success, {
    message: "Deve ser uma URL valida ou estar vazia",
  });

/** Quando `RATE_LIMIT_DRIVER = "upstash"`, as duas credenciais sao obrigatorias. */
const upstashRefine = (value: {
  RATE_LIMIT_DRIVER: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}) =>
  value.RATE_LIMIT_DRIVER !== "upstash" ||
  (Boolean(value.UPSTASH_REDIS_REST_URL) && Boolean(value.UPSTASH_REDIS_REST_TOKEN));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    NEXT_PUBLIC_APP_URL: z.url("NEXT_PUBLIC_APP_URL deve ser uma URL valida"),

    DATABASE_URL: databaseUrl,
    SHADOW_DATABASE_URL: optionalUrl,
    DATABASE_POOL_MAX: positiveInt.default(10),
    DATABASE_POOL_TIMEOUT_MS: positiveInt.default(10_000),
    DATABASE_CONNECT_TIMEOUT_MS: positiveInt.default(10_000),

    AUTH_SECRET: authSecret,
    SESSION_TTL_SECONDS: positiveInt.default(43_200),
    SESSION_TTL_REMEMBER_SECONDS: positiveInt.default(2_592_000),
    SESSION_COOKIE_NAME: z.string().min(1).default("epd_session"),
    BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
    ALLOWED_ORIGINS: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((origin) => origin.trim())
              .filter(Boolean)
          : [],
      ),

    RATE_LIMIT_DRIVER: z.enum(["memory", "upstash"]).default("memory"),
    RATE_LIMIT_LOGIN_MAX: positiveInt.default(5),
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: positiveInt.default(900),
    RATE_LIMIT_API_MAX: positiveInt.default(120),
    RATE_LIMIT_API_WINDOW_SECONDS: positiveInt.default(60),
    UPSTASH_REDIS_REST_URL: optionalUrl,
    // ATENCAO: o token do Upstash e uma string opaca (ex.: "AXxx...=="), nao uma
    // URL. Validar como URL rejeitaria toda configuracao valida. Aqui exigimos
    // apenas nao-vazio, e o par URL+token e verificado no `superRefine`.
    UPSTASH_REDIS_REST_TOKEN: z.string().trim().min(1, "token vazio").optional(),

    // --- Bloqueio por tentativas de login -------------------------------
    // Distinto do rate limit de propósito. O rate limit conta tentativas por
    // IP e por conta numa janela curta, e responde "de novo daqui a pouco". O
    // bloqueio conta falhas CONSECUTIVAS da conta e persiste no banco, para
    // proteger a conta mesmo quando o atacante salta de IP. Os dois sao
    // necessarios: o rate limit sozinho nao sobrevive a distribuicao, e o
    // bloqueio sozinho e contornavel reiniciando o contador.
    LOGIN_MAX_ATTEMPTS: positiveInt.default(5),
    // Escalar progressivamente, em vez de um bloqueio unico e longo. Um
    // bloqueio fixo de 15 min, repetido, tranca a vitima de forma permanente
    // com 5 tentativas a cada 15 min — o atacante nem precisa saber a senha.
    // Subir a penalidade a cada ciclo faz o ataque exigir tempo ilimitado,
    // enquanto o erro legitimo custa segundos.
    LOGIN_LOCKOUT_BASE_SECONDS: positiveInt.default(60),
    // Teto do escalonamento. Acima disso a penalidade nao cresce mais: um
    // crescimento sem limite transformaria um simples esquecimento de senha em
    // uma conta inutilizavel ate a intervencao manual de um administrador.
    LOGIN_LOCKOUT_MAX_SECONDS: positiveInt.default(3600),

    FISCAL_PROVIDER: z.string().default("focus"),
    FISCAL_ENVIRONMENT: z.enum(["homologacao", "producao"]).default("homologacao"),
    FISCAL_API_URL: optionalUrl,
    FISCAL_API_TOKEN: z.string().optional(),
    FISCAL_REF_ULTIMA_VIAGEM: z.string().optional(),
    FISCAL_HMAC_KEY: z.string().optional(),
    STORAGE_URL: optionalUrl,
    STORAGE_BUCKET: z.string().optional(),

    EMAIL_DRIVER: z.enum(["log", "smtp"]).default("log"),
    EMAIL_HOST: z.string().optional(),
    EMAIL_PORT: port.default(587),
    EMAIL_SECURE: booleanish.default(false),
    EMAIL_USER: z.string().optional(),
    EMAIL_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.string().default("ERP PRO Digital <nao-responda@example.com>"),

    BRAPI_BASE_URL: z.url().default("https://brasilapi.com.br/api"),
    FISCAL_TABLES_URL: optionalUrl,

    BILLING_PROVIDER: z.string().optional(),
    BILLING_API_URL: optionalUrl,
    BILLING_API_TOKEN: z.string().optional(),
    BILLING_WEBHOOK_SECRET: z.string().optional(),

    WHATSAPP_PROVIDER: z.string().optional(),
    WHATSAPP_API_URL: optionalUrl,
    WHATSAPP_API_TOKEN: z.string().optional(),

    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    LOG_PRETTY: booleanish.default(false),
    LOG_SERVICE_NAME: z.string().default("erp-pro-digital"),
  })
  .superRefine((value, ctx) => {
    if (!upstashRefine(value)) {
      ctx.addIssue({
        code: "custom",
        path: ["UPSTASH_REDIS_REST_URL"],
        message:
          "RATE_LIMIT_DRIVER=upstash exige UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN",
      });
    }
    if (value.EMAIL_DRIVER === "smtp" && !value.EMAIL_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_HOST"],
        message: "EMAIL_DRIVER=smtp exige EMAIL_HOST",
      });
    }
    if (value.NODE_ENV === "production" && value.LOG_PRETTY) {
      ctx.addIssue({
        code: "custom",
        path: ["LOG_PRETTY"],
        message: "LOG_PRETTY deve ser false em producao (agregadores exigem JSON)",
      });
    }
    if (value.NODE_ENV === "production" && value.RATE_LIMIT_DRIVER === "memory") {
      ctx.addIssue({
        code: "custom",
        path: ["RATE_LIMIT_DRIVER"],
        message:
          "RATE_LIMIT_DRIVER=memory nao e seguro em producao: o limite reseta a cada instancia. Use upstash.",
      });
    }
    if (value.NODE_ENV === "production" && value.NEXT_PUBLIC_APP_URL.includes("localhost")) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_APP_URL"],
        message: "NEXT_PUBLIC_APP_URL nao pode apontar para localhost em producao",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (parsed.success) return parsed.data;

  // Formato legivel: o Zod devolve JSON, que e inutil para quem esta debugando.
  const issues = parsed.error.issues.map((issue) => {
    const path = issue.path.join(".") || "(raiz)";
    return `  - ${path}: ${issue.message}`;
  });
  const message = [
    "Configuracao de ambiente invalida:",
    ...issues,
    "",
    "Copie .env.example para .env e preencha os valores obrigatorios.",
  ].join("\n");

  throw new Error(message);
}

let cached: Env | undefined;

/**
 * Acesso ao ambiente validado. O resultado e memoizado: validar a cada chamada
 * seria desperdicio, e o resultado nao muda durante o processo.
 */
export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Igual a `env()`, mas para uso dentro de modulos (seed, scripts, jobs). */
export const envModule = {
  get current(): Env {
    return env();
  },
};

/** `true` quando estamos em producao. Usado para endurecer validacoes. */
export const isProduction = (): boolean => env().NODE_ENV === "production";
export const isDevelopment = (): boolean => env().NODE_ENV === "development";
export const isTest = (): boolean => env().NODE_ENV === "test";

/**
 * Origens aceitas em requisicoes de escrita. Usado na checagem CSRF e no CORS.
 * Vazio = cair para o host da propria requisicao.
 */
export function allowedOrigins(): string[] {
  const configured = env().ALLOWED_ORIGINS;
  if (configured.length > 0) return configured;
  return [env().NEXT_PUBLIC_APP_URL];
}
