/**
 * Taxonomia de erros da aplicacao.
 *
 * Um unico lugar decide o que o cliente ve. Cada erro carrega:
 * - `code`: identificador estavel para o frontend e para metricas;
 * - `httpStatus`: o que o handler HTTP deve responder;
 * - `messagePtBr`: texto JA PRONTO para exibicao (nunca ha interpolacao de
 *   dado do usuario na mensagem, para nao vazar informacao).
 *
 * Regra: o cliente NUNCA recebe stack trace, SQL, nome de tabela ou valor de
 * coluna. Detalhe vai para o log com `correlationId`.
 */

/** Codigos estaveis. Nunca renomeie um codigo existente. */
export const ErrorCode = {
  // Validacao
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_DOCUMENT: "INVALID_DOCUMENT",

  // Autenticacao / autorizacao
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  MFA_REQUIRED: "MFA_REQUIRED",
  INVALID_MFA_CODE: "INVALID_MFA_CODE",
  FORBIDDEN: "FORBIDDEN",
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",
  TENANT_MISMATCH: "TENANT_MISMATCH",
  BRANCH_SCOPE_VIOLATION: "BRANCH_SCOPE_VIOLATION",

  // Regra de negocio
  BUSINESS_RULE_VIOLATION: "BUSINESS_RULE_VIOLATION",
  DUPLICATED_DOCUMENT: "DUPLICATED_DOCUMENT",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION",
  PLAN_LIMIT_EXCEEDED: "PLAN_LIMIT_EXCEEDED",
  MODULE_NOT_ENABLED: "MODULE_NOT_ENABLED",
  SUBSCRIPTION_BLOCKED: "SUBSCRIPTION_BLOCKED",

  // Fiscal
  FISCAL_INTEGRATION_NOT_CONFIGURED: "FISCAL_INTEGRATION_NOT_CONFIGURED",
  FISCAL_CERTIFICATE_INVALID: "FISCAL_CERTIFICATE_INVALID",
  FISCAL_SERIES_NOT_AUTHORIZED: "FISCAL_SERIES_NOT_AUTHORIZED",
  FISCAL_DOCUMENT_NOT_AUTHORIZED: "FISCAL_DOCUMENT_NOT_AUTHORIZED",
  FISCAL_NUMBERING_EXHAUSTED: "FISCAL_NUMBERING_EXHAUSTED",

  // Infraestrutura
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTEGRATION_NOT_CONFIGURED: "INTEGRATION_NOT_CONFIGURED",
  INTEGRATION_FAILED: "INTEGRATION_FAILED",
  DEPENDENCY_UNAVAILABLE: "DEPENDENCY_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_BY_CODE: Record<ErrorCodeValue, number> = {
  VALIDATION_FAILED: 422,
  INVALID_DOCUMENT: 422,

  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  SESSION_EXPIRED: 401,
  SESSION_REVOKED: 401,
  MFA_REQUIRED: 401,
  INVALID_MFA_CODE: 401,
  FORBIDDEN: 403,
  INSUFFICIENT_PERMISSIONS: 403,
  TENANT_MISMATCH: 403,
  BRANCH_SCOPE_VIOLATION: 403,

  BUSINESS_RULE_VIOLATION: 422,
  DUPLICATED_DOCUMENT: 409,
  INSUFFICIENT_STOCK: 409,
  INVALID_STATE_TRANSITION: 409,
  PLAN_LIMIT_EXCEEDED: 402,
  MODULE_NOT_ENABLED: 403,
  SUBSCRIPTION_BLOCKED: 402,

  FISCAL_INTEGRATION_NOT_CONFIGURED: 503,
  FISCAL_CERTIFICATE_INVALID: 422,
  FISCAL_SERIES_NOT_AUTHORIZED: 422,
  FISCAL_DOCUMENT_NOT_AUTHORIZED: 409,
  FISCAL_NUMBERING_EXHAUSTED: 409,

  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTEGRATION_NOT_CONFIGURED: 503,
  INTEGRATION_FAILED: 502,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/**
 * Mensagens padrao por codigo. Evite `new AppError(code, "texto livre")`
 * em logica de negocio: a saida para o usuario deve ser previsivel e
 * revisavel. Excecao: quando o texto for gerado a partir de um enum do
 * dominio (ex.: "O status X nao permite a transicao para Y"), o `AppError`
 * aceita a mensagem customizada.
 */
const DEFAULT_MESSAGE: Record<ErrorCodeValue, string> = {
  VALIDATION_FAILED: "Dados invalidos. Verifique os campos destacados.",
  INVALID_DOCUMENT: "Documento invalido.",

  UNAUTHENTICATED: "Voce precisa entrar na sua conta.",
  INVALID_CREDENTIALS: "E-mail ou senha incorretos.",
  SESSION_EXPIRED: "Sua sessao expirou. Entre novamente.",
  SESSION_REVOKED: "Sua sessao foi encerrada. Entre novamente.",
  MFA_REQUIRED: "Informe o codigo de verificacao para continuar.",
  INVALID_MFA_CODE: "Codigo de verificacao invalido.",
  FORBIDDEN: "Voce nao tem acesso a este recurso.",
  INSUFFICIENT_PERMISSIONS: "Voce nao tem permissao para esta operacao.",
  TENANT_MISMATCH: "Acesso negado: o recurso pertence a outra empresa.",
  BRANCH_SCOPE_VIOLATION: "Voce nao tem acesso a esta filial.",

  BUSINESS_RULE_VIOLATION: "Operacao nao permitida pelas regras do negocio.",
  DUPLICATED_DOCUMENT: "Este documento ja foi registrado.",
  INSUFFICIENT_STOCK: "Estoque insuficiente para a operacao.",
  INVALID_STATE_TRANSITION: "Transicao de estado nao permitida.",
  PLAN_LIMIT_EXCEEDED: "Limite do seu plano foi atingido. Faca upgrade para continuar.",
  MODULE_NOT_ENABLED: "Este modulo nao esta disponivel no seu plano.",
  SUBSCRIPTION_BLOCKED: "Sua assinatura precisa ser regularizada para continuar.",

  FISCAL_INTEGRATION_NOT_CONFIGURED: "Integracao fiscal nao configurada.",
  FISCAL_CERTIFICATE_INVALID: "Certificado digital invalido ou vencido.",
  FISCAL_SERIES_NOT_AUTHORIZED: "A serie de nota fiscal nao esta autorizada.",
  FISCAL_DOCUMENT_NOT_AUTHORIZED: "O documento fiscal nao esta autorizado.",
  FISCAL_NUMBERING_EXHAUSTED: "A numeracao da serie de notas fiscais acabou.",

  NOT_FOUND: "Recurso nao encontrado.",
  CONFLICT: "Conflito com o estado atual do recurso.",
  RATE_LIMITED: "Muitas requisicoes. Aguarde alguns instantes e tente novamente.",
  INTEGRATION_NOT_CONFIGURED: "Integracao nao configurada.",
  INTEGRATION_FAILED: "A integracao externa falhou. Tente novamente ou contate o suporte.",
  DEPENDENCY_UNAVAILABLE: "Servico temporariamente indisponivel.",
  INTERNAL_ERROR: "Erro interno. Nossa equipe foi notificada.",
};

export interface AppErrorOptions {
  /** Detalhe tecnico. Vai para o LOG, nunca para a resposta. */
  readonly details?: unknown;
  /** Causa original. Preservada para `cause` no stack. */
  readonly cause?: unknown;
  /** Sobrescreve o status padrao do codigo. */
  readonly httpStatus?: number;
  /**
   * Contexto para o operador, no formato `{ tenantId, userId, documentId }`.
   * Nao usar para dado pessoal visivel ao usuario final.
   */
  readonly context?: Record<string, unknown>;
  /** Erro de validacao campo-a-campo, quando `code = VALIDATION_FAILED`. */
  readonly fieldErrors?: Readonly<Record<string, string[]>>;
}

/**
 * Erro de aplicacao. Lancar isto em qualquer camada de regra de negocio.
 *
 * O handler HTTP (`src/server/http/error-response.ts`) e o unico lugar que
 * converte `AppError` em resposta. Qualquer outro erro vira 500 generico.
 */
export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly httpStatus: number;
  readonly details: unknown;
  readonly context: Record<string, unknown>;
  readonly fieldErrors: Readonly<Record<string, string[]>> | undefined;

  constructor(code: ErrorCodeValue, message?: string, options: AppErrorOptions = {}) {
    super(message ?? DEFAULT_MESSAGE[code], { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? STATUS_BY_CODE[code];
    this.details = options.details;
    this.context = options.context ?? {};
    this.fieldErrors = options.fieldErrors;
    Error.captureStackTrace?.(this, AppError);
  }

  /** Resposta serializavel. NUNCA inclui `details` nem stack. */
  toJSON(): {
    error: {
      code: ErrorCodeValue;
      message: string;
      fieldErrors?: Readonly<Record<string, string[]>>;
      correlationId?: string;
    };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
      },
    };
  }
}

/** `true` quando o erro e da aplicacao (tem codigo e status conhecido). */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Extrai o `AppError` de um erro desconhecido.
 *
 * Cobre os casos que realmente aparecem em producao:
 * - Zod (validacao de entrada e de env);
 * - Prisma (`P2002` unique, `P2025` not found, `P2034` write conflict);
 * - Postgres (violacao de constraint, conexao caiu).
 *
 * Sem esse mapeamento, qualquer violacao de unique chegaria ao usuario como
 * 500 com mensagem generica — hides um bug de concorrencia real.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  // Zod
  if (getProperty(error, "name") === "ZodError") {
    const issues = getProperty(error, "issues");
    if (Array.isArray(issues)) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of issues) {
        if (!isRecord(issue)) continue;
        const path = Array.isArray(issue.path) ? issue.path.join(".") : "_";
        const message = typeof issue.message === "string" ? issue.message : "Valor invalido";
        (fieldErrors[path] ??= []).push(message);
      }
      return new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fieldErrors, details: issues });
    }
  }

  // Prisma
  const prismaCode = getProperty(error, "code");
  if (typeof prismaCode === "string" && prismaCode.startsWith("P")) {
    switch (prismaCode) {
      case "P2002": {
        const target = getProperty(error, "meta") as { target?: unknown } | undefined;
        const fields = Array.isArray(target?.target) ? target.target.join(", ") : undefined;
        return new AppError(ErrorCode.DUPLICATED_DOCUMENT, undefined, {
          details: { prismaCode, fields },
        });
      }
      case "P2003":
        return new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, undefined, {
          details: { prismaCode, reason: "violacao de chave estrangeira" },
        });
      case "P2025":
        return new AppError(ErrorCode.NOT_FOUND, undefined, { details: { prismaCode } });
      case "P2034":
        // Conflito de transacao: o cliente pode repetir com seguranca.
        return new AppError(ErrorCode.CONFLICT, undefined, { details: { prismaCode } });
      default:
        return new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
          details: { prismaCode },
          cause: error,
        });
    }
  }

  // Postgres via driver `pg` (codigo numerico em `code`).
  const dbCode = getProperty(error, "code");
  if (typeof dbCode === "string") {
    if (dbCode === "23505") {
      return new AppError(ErrorCode.DUPLICATED_DOCUMENT, undefined, {
        details: { pgCode: dbCode },
      });
    }
    if (dbCode === "23503") {
      return new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, undefined, {
        details: { pgCode: dbCode },
      });
    }
    if (dbCode === "23514" || dbCode === "22P02") {
      return new AppError(ErrorCode.VALIDATION_FAILED, undefined, {
        details: { pgCode: dbCode },
      });
    }
    if (dbCode.startsWith("08") || dbCode === "57P01" || dbCode === "53300") {
      return new AppError(ErrorCode.DEPENDENCY_UNAVAILABLE, undefined, {
        details: { pgCode: dbCode },
        cause: error,
      });
    }
  }

  return new AppError(ErrorCode.INTERNAL_ERROR, undefined, { cause: error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

// Atalhos de uso frequente. Evitam repetir `ErrorCode.X` na regra de negocio.
export const errors = {
  validation: (message?: string, fieldErrors?: Record<string, string[]>) =>
    new AppError(ErrorCode.VALIDATION_FAILED, message, { fieldErrors }),
  unauthenticated: () => new AppError(ErrorCode.UNAUTHENTICATED),
  forbidden: (message?: string) => new AppError(ErrorCode.FORBIDDEN, message),
  notFound: (message?: string) => new AppError(ErrorCode.NOT_FOUND, message),
  businessRule: (message: string, details?: unknown) =>
    new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, message, { details }),
  insufficientStock: (message?: string) => new AppError(ErrorCode.INSUFFICIENT_STOCK, message),
  integrationNotConfigured: (what: string) =>
    new AppError(
      ErrorCode.INTEGRATION_NOT_CONFIGURED,
      `Integracao nao configurada: ${what}. Configure em Ajustes > Integracoes.`,
    ),
  internal: (cause?: unknown) => new AppError(ErrorCode.INTERNAL_ERROR, undefined, { cause }),
} as const;
