-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('SIMPLES_NACIONAL', 'SIMPLES_EXCESSO_SUBLIMITE', 'REGIME_NORMAL', 'MEI');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "AddressKind" AS ENUM ('RESIDENCIAL', 'COMERCIAL', 'RETIRADA', 'ENTREGA', 'OUTRO');

-- CreateEnum
CREATE TYPE "FiscalAddressKind" AS ENUM ('BRASIL', 'EXTERIOR');

-- CreateEnum
CREATE TYPE "BrazilState" AS ENUM ('AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ATIVO', 'INATIVO', 'BLOQUEADO', 'PENDENTE_ATIVACAO');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('PLATFORM', 'TENANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ATIVA', 'REVOGADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'LOGIN_FALHO', 'LOGOUT_TODOS_DISPOSITIVOS', 'SENHA_ALTERADA', 'SENHA_REDEFINIDA', 'RECUPERACAO_SOLICITADA', 'TOTP_HABILITADO', 'TOTP_REMOVIDO', 'CRIAR', 'ALTERAR', 'EXCLUIR', 'RESTAURAR', 'CANCELAR', 'ESTORNAR', 'BAIXA', 'APROVAR', 'REJEITAR', 'EMITIR_DOCUMENTO', 'CONSULTAR_DOCUMENTO', 'IMPORTAR', 'EXPORTAR', 'IMPRIMIR', 'ENTRADA_ESTOQUE', 'SAIDA_ESTOQUE', 'TRANSFERIR_ESTOQUE', 'AJUSTAR_ESTOQUE', 'INVENTARIO', 'ALTERAR_PERMISSAO', 'ALTERACAO_FINANCEIRA', 'ACESSO_NEGADO', 'CONFIGURAR', 'ANONIMIZAR', 'EXPORTAR_DADOS', 'ASSINATURA', 'LIMITES_PLANO');

-- CreateEnum
CREATE TYPE "LegalBasis" AS ENUM ('CONSENTIMENTO', 'EXECUCAO_CONTRATO', 'OBRIGACAO_LEGAL', 'OBRIGACAO_REGULATARIA', 'INTERESSE_LEGITIMO', 'EXERCICIO_DIREITOS', 'PROTECCAO_CREDITO');

-- CreateEnum
CREATE TYPE "DataSubjectRequestType" AS ENUM ('ACESSO', 'CORRECAO', 'ANONIMIZACAO', 'PORTABILIDADE', 'ELIMINACAO', 'REVOGACAO_CONSENTIMENTO');

-- CreateEnum
CREATE TYPE "DataSubjectRequestStatus" AS ENUM ('ABERTA', 'EM_ANALISE', 'CONCLUIDA', 'RECUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('PENDENTE', 'ATIVA', 'TRIAL', 'SUSPENSA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ATIVA', 'PENDENTE', 'ATRASADA', 'CANCELADA', 'BLOQUEADA', 'TRIAL');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('DIARIO', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('PENDENTE', 'PAGA', 'VENCIDA', 'CANCELADA', 'ESTORNADA');

-- CreateEnum
CREATE TYPE "PlanModuleKey" AS ENUM ('DASHBOARD', 'VENDAS', 'PDV', 'ORCAMENTOS', 'PEDIDOS', 'DEVOLUCOES', 'COMPRAS', 'ESTOQUE', 'INVENTARIO', 'TRANSFERENCIAS', 'CLIENTES', 'FORNECEDORES', 'FINANCEIRO', 'CONTAS_A_RECEBER', 'CONTAS_A_PAGAR', 'FLUXO_DE_CAIXA', 'PLANO_DE_CONTAS', 'DRE', 'COMISSOES', 'FISCAL', 'NFE', 'NFCE', 'NFSE', 'RELATORIOS', 'IMPORTACAO', 'EXPORTACAO', 'MULTI_FILIAL', 'API_PUBLICA', 'PWA', 'SUPORTE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'RESOLVIDO', 'FECHADO');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "WelcomeTourState" AS ENUM ('NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'IGNORADO');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('MERCADORIA', 'SERVICO', 'COMPOSTO');

-- CreateEnum
CREATE TYPE "ProductOrigin" AS ENUM ('NACIONAL', 'ESTRANGEIRA_IMPORTACAO_DIRETA', 'NACIONAL_CI_SUPERIOR_40', 'ESTRANGEIRA_MERCADO_INTERNO', 'NACIONAL_PROCESSOS_PRODUTIVOS_BASICOS', 'NACIONAL_CI_INFERIOR_40', 'ESTRANGEIRA_SEM_SIMILAR_NACIONAL', 'ESTRANGEIRA_SEM_SIMILAR_MERCADO_INTERNO', 'NACIONAL_CI_SUPERIOR_70');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('UN', 'KG', 'G', 'L', 'ML', 'M', 'M2', 'M3', 'CX', 'PCT', 'PAR', 'DZ', 'SC', 'HR', 'SRV', 'FD', 'LT', 'BS', 'UNID');

-- CreateEnum
CREATE TYPE "StockCostMethod" AS ENUM ('MEDIA_MOVIMENTACAO', 'PEPS', 'UEPS', 'ULTIMO_CUSTO', 'NENHUM');

-- CreateEnum
CREATE TYPE "StockNegativeBehavior" AS ENUM ('BLOQUEAR', 'PERMITIR_NEGATIVO', 'ALERTAR');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA_SAIDA', 'TRANSFERENCIA_ENTRADA', 'AJUSTE_AUMENTO', 'AJUSTE_DIMINUICAO', 'INVENTARIO_AUMENTO', 'INVENTARIO_DIMINUICAO', 'DEVOLUCAO_CLIENTE', 'DEVOLUCAO_FORNECEDOR', 'PERDA', 'AVARIA', 'CANCELAMENTO', 'PRODUCAO', 'CONSUMO');

-- CreateEnum
CREATE TYPE "StockMovementOrigin" AS ENUM ('VENDA', 'COMPRA', 'DEVOLUCAO_VENDA', 'DEVOLUCAO_COMPRA', 'AJUSTE_MANUAL', 'INVENTARIO', 'TRANSFERENCIA', 'PERDA', 'AVARIA', 'CANCELAMENTO', 'PRODUCAO', 'IMPORTACAO_XML', 'OUTRO');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('RASCUNHO', 'EM_COURSO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "InventoryType" AS ENUM ('GERAL', 'CICLICO', 'POR_CATEGORIA', 'POR_LOCAL', 'CONTAGEM_CEGA');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('RASCUNHO', 'EM_TRANSITO', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('BALCAO', 'NORMAL', 'PDV', 'CREDITO', 'REMESSA', 'OUTRA');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('RASCUNHO', 'PENDENTE', 'CONFIRMADA', 'CONCLUIDA', 'ENTREGUE', 'CANCELADA', 'DEVOLVIDA', 'PARCIALMENTE_DEVOLVIDA');

-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('PDV', 'BALCAO', 'LOJA_ONLINE', 'APP', 'TELEFONE', 'WHATSAPP', 'API', 'IMPORTACAO');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('RASCUNHO', 'ENVIADO', 'ACEITO', 'RECUSADO', 'EXPIRADO', 'CONVERTIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RASCUNHO', 'PENDENTE', 'CONFIRMADO', 'EM_SEPARACAO', 'PRONTO_PARA_ENTREGA', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('PEDIDO', 'REMESSA');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'BOLETO', 'TRANSFERENCIA', 'CHEQUE', 'CREDITO_PROPRIO', 'OUTRO');

-- CreateEnum
CREATE TYPE "PaymentTransactionType" AS ENUM ('APROVADA', 'RECUSADA', 'PENDENTE', 'CANCELADA', 'ESTORNADA');

-- CreateEnum
CREATE TYPE "ReturnType" AS ENUM ('TOTAL', 'PARCIAL');

-- CreateEnum
CREATE TYPE "PaymentTermsType" AS ENUM ('A_VISTA', 'DIAS', 'DIAS_RECEBIMENTO', 'DIA_FIXO', 'PARCELADO', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('RECEITA', 'DESPESA', 'CUSTO', 'TRIBUTO', 'ATIVO', 'PASSIVO', 'PATRIMONIO', 'CONTABILIZADOR');

-- CreateEnum
CREATE TYPE "AccountNature" AS ENUM ('DEVEDOR', 'CREDOR');

-- CreateEnum
CREATE TYPE "FinancialEntryType" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'AJUSTE', 'ESTORNO', 'CONCILIACAO');

-- CreateEnum
CREATE TYPE "FinancialEntryStatus" AS ENUM ('PENDENTE', 'PAGO', 'PARCIAL', 'CANCELADO', 'CONCILIADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "PayableReceivableKind" AS ENUM ('CONTAS_A_RECEBER', 'CONTAS_A_PAGAR', 'CARTAO_DE_CREDITO', 'FOLHA_PAGAMENTO', 'IMPOSTOS', 'PARCELAS_CARTAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDENTE', 'PAGO', 'PARCIAL', 'VENCIDO', 'CANCELADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "SettlementAction" AS ENUM ('BAIXA', 'BAIXA_PARCIAL', 'ESTORNO', 'JUROS', 'MULTA', 'DESCONTO', 'RENEGOCIACAO', 'COMPENSACAO');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CONTA_CORRENTE', 'POUPANCA', 'CARTEIRA_DIGITAL', 'CONTA_PAGAMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "CashRegisterStatus" AS ENUM ('ABERTO', 'FECHADO');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SAIDA', 'AJUSTE', 'ESTORNO');

-- CreateEnum
CREATE TYPE "CashMovementDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDENTE', 'APROVADA', 'PAGA', 'CANCELADA', 'ESTORNADA');

-- CreateEnum
CREATE TYPE "CommissionBase" AS ENUM ('VALOR_LIQUIDO_ITEM', 'VALOR_LIQUIDO_VENDA', 'MARGEM', 'QUANTIDADE', 'VALOR_BRUTO_ITEM');

-- CreateEnum
CREATE TYPE "InvoiceModel" AS ENUM ('NF_E', 'NF_CE', 'NFS_E');

-- CreateEnum
CREATE TYPE "FiscalEnvironment" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "FiscalStatus" AS ENUM ('RASCUNHO', 'PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'CANCELADA', 'DENEGADA', 'CONTINGENCIA', 'SUBSTITUIDA', 'ERRO');

-- CreateEnum
CREATE TYPE "FiscalJobType" AS ENUM ('EMITIR_NF_E', 'EMITIR_NF_CE', 'EMITIR_NFS_E', 'CONSULTAR', 'CANCELAR', 'INUTILIZAR', 'CARTA_CORRECAO', 'BAIXAR_XML', 'BAIXAR_DANFE', 'ENVIAR_EMAIL', 'REGISTRAR_DEVOLUCAO');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FiscalEventType" AS ENUM ('EMITIR', 'CONSULTAR', 'CANCELAR', 'INUTILIZAR', 'CARTA_CORRECAO', 'BAIXAR_XML', 'BAIXAR_DANFE', 'ENVIAR_EMAIL', 'REGISTRAR_DEVOLUCAO', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "FiscalLogDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('NF_E', 'NF_CE', 'NFS_E', 'CT_E', 'CUPOM_FISCAL', 'RECIBO', 'DECLARACAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "ServiceIncentiveType" AS ENUM ('INCENTIVADO', 'NAO_INCENTIVADO', 'DESONERADO', 'INDEVIDO');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('VALIDO', 'VENCIDO', 'REVOGADO', 'PROXIMO_VENCIMENTO', 'INVALIDO');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('PENDENTE', 'PROCESSADO', 'IGNORADO', 'FALHOU');

-- CreateEnum
CREATE TYPE "FiscalDirection" AS ENUM ('OUT', 'IN');

-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('PEDIDO', 'ENTRADA');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('RASCUNHO', 'ENVIADO', 'CONFIRMADO', 'PARCIALMENTE_RECEBIDO', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONTA_A_VENCER', 'CONTA_VENCIDA', 'CONTA_RECEBIDA', 'ESTOQUE_BAIXO', 'ESTOQUE_ZERADO', 'NOTA_AUTORIZADA', 'NOTA_REJEITADA', 'NOTA_CANCELADA', 'NOTA_DENEGADA', 'ERRO_FISCAL', 'VENDA_FINALIZADA', 'COMISSAO_PENDENTE', 'ASSINATURA_VENCENDO', 'ASSINATURA_BLOQUEADA', 'TICKET_ATUALIZADO', 'SISTEMA');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('BAIXA', 'NORMAL', 'ALTA', 'CRITICA');

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "module" VARCHAR(40) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "group" VARCHAR(60) NOT NULL,
    "actions" TEXT[],
    "platform_only" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "description" TEXT,
    "scope" "RoleScope" NOT NULL DEFAULT 'TENANT',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL DEFAULT 0,
    "annual_price_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MENSAL',
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "max_users" INTEGER NOT NULL DEFAULT 0,
    "max_products" INTEGER NOT NULL DEFAULT 0,
    "max_customers" INTEGER NOT NULL DEFAULT 0,
    "max_suppliers" INTEGER NOT NULL DEFAULT 0,
    "max_branches" INTEGER NOT NULL DEFAULT 0,
    "max_invoices_per_month" INTEGER NOT NULL DEFAULT 0,
    "max_sales_per_month" INTEGER NOT NULL DEFAULT 0,
    "max_storage_mb" INTEGER NOT NULL DEFAULT 0,
    "features" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "highlight" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_modules" (
    "plan_id" TEXT NOT NULL,
    "module" "PlanModuleKey" NOT NULL,

    CONSTRAINT "plan_modules_pkey" PRIMARY KEY ("plan_id","module")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'PENDENTE',
    "onboarding_step" INTEGER NOT NULL DEFAULT 0,
    "welcome_tour_state" "WelcomeTourState" NOT NULL DEFAULT 'NAO_INICIADO',
    "plan_id" TEXT NOT NULL,
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trial_ends_at" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "blocked_at" TIMESTAMP(3),
    "blocked_reason" TEXT,
    "read_only_when_blocked" BOOLEAN NOT NULL DEFAULT true,
    "logo_url" TEXT,
    "primary_color" TEXT,
    "timezone" VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    "locale" VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_ends_at" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancel_reason" TEXT,
    "price_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MENSAL',
    "external_customer_id" TEXT,
    "external_subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "event" VARCHAR(60) NOT NULL,
    "payload" JSONB,
    "source" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "number" VARCHAR(40) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "paid_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'PENDENTE',
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "external_id" TEXT,
    "receipt_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_usage" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period" CHAR(7) NOT NULL,
    "users" INTEGER NOT NULL DEFAULT 0,
    "products" INTEGER NOT NULL DEFAULT 0,
    "customers" INTEGER NOT NULL DEFAULT 0,
    "suppliers" INTEGER NOT NULL DEFAULT 0,
    "branches" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "invoices_issued" INTEGER NOT NULL DEFAULT 0,
    "sales_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "storage_bytes" BIGINT NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_providers" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "vendor" VARCHAR(80),
    "description" TEXT,
    "docs_url" TEXT,
    "supports" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ncm" (
    "code" VARCHAR(12) NOT NULL,
    "description" TEXT NOT NULL,
    "table_version" VARCHAR(20),
    "suggestedOrigin" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ncm_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "municipalities" (
    "ibge_code" VARCHAR(7) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "uf" "BrazilState" NOT NULL,
    "national_nfe_provider" VARCHAR(60),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("ibge_code")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "password_hash" TEXT,
    "name" VARCHAR(140) NOT NULL,
    "phone" VARCHAR(20),
    "avatar_url" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDENTE_ATIVACAO',
    "email_verified_at" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" TEXT,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "totp_secret_encrypted" TEXT,
    "totp_enabled_at" TIMESTAMP(3),
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "platform_admin_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "membership_id" TEXT,
    "tenant_id" TEXT,
    "branch_id" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ATIVA',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "activity_count" INTEGER NOT NULL DEFAULT 0,
    "ip" VARCHAR(64),
    "user_agent" TEXT,
    "remember_me" BOOLEAN NOT NULL DEFAULT false,
    "impersonated_by_session_id" TEXT,
    "impersonation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "ip" VARCHAR(64),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_owner" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hired_at" TIMESTAMP(3),
    "notes" TEXT,
    "internal_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "membership_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("membership_id","role_id")
);

-- CreateTable
CREATE TABLE "user_branch_access" (
    "membership_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_branch_access_pkey" PRIMARY KEY ("membership_id","branch_id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "is_headquarters" BOOLEAN NOT NULL DEFAULT true,
    "name" VARCHAR(180) NOT NULL,
    "trade_name" VARCHAR(180),
    "cnpj" VARCHAR(18) NOT NULL,
    "cpf" VARCHAR(14),
    "state_registration" VARCHAR(20),
    "municipal_registration" VARCHAR(20),
    "cnae_main" VARCHAR(10),
    "cnae_additional" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "legal_nature" VARCHAR(120),
    "taxRegime" "TaxRegime",
    "simples_option_year" INTEGER,
    "social_capital" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "zip_code" VARCHAR(8),
    "street" VARCHAR(150),
    "street_number" VARCHAR(20),
    "street_complement" VARCHAR(80),
    "district" VARCHAR(80),
    "city" VARCHAR(100),
    "state" "BrazilState",
    "country_code" VARCHAR(60) NOT NULL DEFAULT 'BRASIL',
    "ibge_code" VARCHAR(7),
    "addressKind" "AddressKind",
    "fiscalAddressKind" "FiscalAddressKind",
    "phone" VARCHAR(20),
    "email" VARCHAR(180),
    "website" VARCHAR(180),
    "logo_url" TEXT,
    "color_hex" VARCHAR(7),
    "municipality_id" VARCHAR(7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "is_headquarters" BOOLEAN NOT NULL DEFAULT false,
    "cnpj" VARCHAR(18) NOT NULL,
    "name_legal" VARCHAR(180),
    "trade_name" VARCHAR(180),
    "state_registration" VARCHAR(20),
    "municipal_registration" VARCHAR(20),
    "zip_code" VARCHAR(8),
    "street" VARCHAR(150),
    "street_number" VARCHAR(20),
    "street_complement" VARCHAR(80),
    "district" VARCHAR(80),
    "city" VARCHAR(100),
    "state" "BrazilState",
    "country_code" VARCHAR(60) NOT NULL DEFAULT 'BRASIL',
    "ibge_code" VARCHAR(7),
    "addressKind" "AddressKind",
    "fiscalAddressKind" "FiscalAddressKind",
    "phone" VARCHAR(20),
    "email" VARCHAR(180),
    "manager_name" VARCHAR(120),
    "latitude" DECIMAL(12,8),
    "longitude" DECIMAL(12,8),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "municipality_id" VARCHAR(7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "personType" "PersonType" NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "trade_name" VARCHAR(180),
    "cpf" VARCHAR(11),
    "cnpj" VARCHAR(14),
    "document_raw" VARCHAR(20),
    "state_registration" VARCHAR(20),
    "municipal_registration" VARCHAR(20),
    "birth_date" TIMESTAMP(3),
    "email" VARCHAR(180),
    "phone" VARCHAR(20),
    "whatsapp" VARCHAR(20),
    "marketing_consent_at" TIMESTAMP(3),
    "zip_code" VARCHAR(8),
    "street" VARCHAR(150),
    "street_number" VARCHAR(20),
    "street_complement" VARCHAR(80),
    "district" VARCHAR(80),
    "city" VARCHAR(100),
    "state" "BrazilState",
    "country_code" VARCHAR(60) NOT NULL DEFAULT 'BRASIL',
    "ibge_code" VARCHAR(7),
    "addressKind" "AddressKind",
    "fiscalAddressKind" "FiscalAddressKind",
    "credit_limit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "default_payment_terms_id" TEXT,
    "notes" TEXT,
    "tags" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "total_purchased" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_debt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "purchase_count" INTEGER NOT NULL DEFAULT 0,
    "last_purchase_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "personType" "PersonType" NOT NULL DEFAULT 'JURIDICA',
    "name" VARCHAR(180) NOT NULL,
    "trade_name" VARCHAR(180),
    "cpf" VARCHAR(11),
    "cnpj" VARCHAR(14),
    "document_raw" VARCHAR(20),
    "state_registration" VARCHAR(20),
    "municipal_registration" VARCHAR(20),
    "email" VARCHAR(180),
    "phone" VARCHAR(20),
    "whatsapp" VARCHAR(20),
    "contact_name" VARCHAR(120),
    "zip_code" VARCHAR(8),
    "street" VARCHAR(150),
    "street_number" VARCHAR(20),
    "street_complement" VARCHAR(80),
    "district" VARCHAR(80),
    "city" VARCHAR(100),
    "state" "BrazilState",
    "country_code" VARCHAR(60) NOT NULL DEFAULT 'BRASIL',
    "ibge_code" VARCHAR(7),
    "addressKind" "AddressKind",
    "fiscalAddressKind" "FiscalAddressKind",
    "bank_name" VARCHAR(80),
    "bank_code" VARCHAR(10),
    "agency" VARCHAR(20),
    "agency_digit" VARCHAR(4),
    "account_number" VARCHAR(30),
    "account_digit" VARCHAR(4),
    "pix_key_type" VARCHAR(20),
    "pix_key" VARCHAR(140),
    "notes" TEXT,
    "tags" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "total_purchased" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_debt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "purchase_count" INTEGER NOT NULL DEFAULT 0,
    "last_purchase_at" TIMESTAMP(3),
    "average_lead_time_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" VARCHAR(140) NOT NULL,
    "code" VARCHAR(40),
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(40),
    "logo_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(8) NOT NULL,
    "description" VARCHAR(80),
    "decimal_places" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "category_id" TEXT,
    "brand_id" TEXT,
    "unit_id" TEXT NOT NULL,
    "type" "ProductType" NOT NULL DEFAULT 'MERCADORIA',
    "sku" VARCHAR(60) NOT NULL,
    "barcode" VARCHAR(20),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "search_terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unit_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "retail_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "wholesale_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "target_margin_percent" DECIMAL(9,4),
    "cost_method" "StockCostMethod" NOT NULL DEFAULT 'MEDIA_MOVIMENTACAO',
    "average_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "last_purchase_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_stock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "current_stock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "max_stock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reserved_stock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "allow_negative_stock" BOOLEAN NOT NULL DEFAULT false,
    "negative_stock_behavior" "StockNegativeBehavior" NOT NULL DEFAULT 'BLOQUEAR',
    "weight_kg" DECIMAL(14,4),
    "length_m" DECIMAL(14,4),
    "width_m" DECIMAL(14,4),
    "height_m" DECIMAL(14,4),
    "ncm_code" VARCHAR(12),
    "cest_code" VARCHAR(10),
    "productOrigin" "ProductOrigin",
    "icms_tax_code" VARCHAR(20),
    "national_tax_percent" DECIMAL(9,4),
    "import_tax_percent" DECIMAL(9,4),
    "icms_st_mva_percent" DECIMAL(9,4),
    "icms_st_fraction" INTEGER NOT NULL DEFAULT 0,
    "track_serial_number" BOOLEAN NOT NULL DEFAULT false,
    "track_batch" BOOLEAN NOT NULL DEFAULT false,
    "track_expiry_date" BOOLEAN NOT NULL DEFAULT false,
    "is_analyzed" BOOLEAN NOT NULL DEFAULT false,
    "sales_count" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "available_from" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "category_id" TEXT,
    "unit_id" TEXT,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "unit_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "lc116_code" VARCHAR(20),
    "iss_rate_percent" DECIMAL(9,4),
    "iss_retained" BOOLEAN NOT NULL DEFAULT false,
    "incentiveType" "ServiceIncentiveType",
    "iss_exempt" BOOLEAN NOT NULL DEFAULT false,
    "national_tax_percent" DECIMAL(9,4),
    "cbs_rate_percent" DECIMAL(9,4),
    "ibs_rate_percent" DECIMAL(9,4),
    "municipal_tax_map" VARCHAR(60),
    "pis_retained_percent" DECIMAL(9,4),
    "cofins_retained_percent" DECIMAL(9,4),
    "csll_retained_percent" DECIMAL(9,4),
    "irpj_retained_percent" DECIMAL(9,4),
    "inss_retained_percent" DECIMAL(9,4),
    "municipality_id" VARCHAR(7),
    "estimated_hours" DECIMAL(10,2),
    "cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "brands" TEXT[],
    "requires_gateway" BOOLEAN NOT NULL DEFAULT false,
    "gateway_key" VARCHAR(60),
    "allows_change" BOOLEAN NOT NULL DEFAULT false,
    "require_document_above_cents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_terms" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "type" "PaymentTermsType" NOT NULL,
    "installment_count" INTEGER NOT NULL DEFAULT 1,
    "interval_days" INTEGER NOT NULL DEFAULT 0,
    "fixed_day" INTEGER,
    "custom_description" VARCHAR(180),
    "cash_discount_cents" INTEGER NOT NULL DEFAULT 0,
    "interest_percent_monthly" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "average_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "max_stock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "in_transit_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "last_movement_at" TIMESTAMP(3),
    "last_counted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "origin" "StockMovementOrigin" NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance_after" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "average_cost_after" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "document_type" VARCHAR(40),
    "document_id" TEXT,
    "document_number" VARCHAR(40),
    "supplier_id" TEXT,
    "transfer_id" TEXT,
    "inventory_item_id" TEXT,
    "notes" TEXT,
    "idempotency_key" VARCHAR(120),
    "performed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "origin_branch_id" TEXT NOT NULL,
    "destination_branch_id" TEXT NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'RASCUNHO',
    "requested_by_id" TEXT,
    "received_by_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "notes" TEXT,
    "tracking_code" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "quantity_received" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "type" "InventoryType" NOT NULL DEFAULT 'GERAL',
    "status" "InventoryStatus" NOT NULL DEFAULT 'RASCUNHO',
    "category_id" TEXT,
    "location_tag" VARCHAR(80),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "blind_count" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "performed_by_id" TEXT,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_inventory_items" (
    "id" TEXT NOT NULL,
    "inventory_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "expected_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "counted_quantity" DECIMAL(14,4),
    "difference" DECIMAL(14,4),
    "difference_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "movement_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "model" VARCHAR(40) NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 0,
    "prefix" VARCHAR(10),
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "step" INTEGER NOT NULL DEFAULT 1,
    "fiscal_series" INTEGER,
    "next_fiscal_number" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "number" VARCHAR(40) NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'RASCUNHO',
    "type" "SaleType" NOT NULL DEFAULT 'NORMAL',
    "payment_terms_id" TEXT,
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "message" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shipping_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "items_snapshot" JSONB,
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "converted_to_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "product_id" TEXT,
    "service_id" TEXT,
    "description" VARCHAR(255) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "number" VARCHAR(40) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDENTE',
    "type" "OrderType" NOT NULL DEFAULT 'PEDIDO',
    "channel" "SaleChannel" NOT NULL DEFAULT 'BALCAO',
    "payment_terms_id" TEXT,
    "requested_delivery_date" TIMESTAMP(3),
    "delivery_address" TEXT,
    "notes" TEXT,
    "external_id" TEXT,
    "external_source" VARCHAR(40),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shipping_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "items_snapshot" JSONB,
    "confirmed_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "idempotency_key" VARCHAR(120),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "service_id" TEXT,
    "description" VARCHAR(255) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fulfilled_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "quote_id" TEXT,
    "order_id" TEXT,
    "number" VARCHAR(40) NOT NULL,
    "series" VARCHAR(10),
    "status" "SaleStatus" NOT NULL DEFAULT 'RASCUNHO',
    "type" "SaleType" NOT NULL DEFAULT 'NORMAL',
    "channel" "SaleChannel" NOT NULL DEFAULT 'BALCAO',
    "payment_terms_id" TEXT,
    "payment_method_id" TEXT,
    "seller_id" TEXT,
    "product_category" VARCHAR(4),
    "purpose" VARCHAR(120),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shipping_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retention_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "items_snapshot" JSONB,
    "sold_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "notes" TEXT,
    "internal_notes" TEXT,
    "idempotency_key" VARCHAR(120),
    "created_by_id" TEXT,
    "cancelled_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT,
    "service_id" TEXT,
    "description" VARCHAR(255) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "cost_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "returned_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ncm_code" VARCHAR(12),
    "cest_code" VARCHAR(10),
    "cfop" VARCHAR(8),
    "icms_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "pis_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "cofins_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "iss_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "ibs_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "cbs_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "payment_method_id" TEXT,
    "installment_number" INTEGER NOT NULL DEFAULT 1,
    "type" "PaymentTransactionType" NOT NULL DEFAULT 'PENDENTE',
    "amount" DECIMAL(14,2) NOT NULL,
    "change_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overpayment_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gateway_transaction_id" TEXT,
    "gateway_name" VARCHAR(60),
    "card_brand" VARCHAR(30),
    "card_last_four" VARCHAR(4),
    "authorization_code" VARCHAR(40),
    "nsu" VARCHAR(30),
    "acquirer_message" TEXT,
    "invoice_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "receipt_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "number" VARCHAR(40) NOT NULL,
    "type" "ReturnType" NOT NULL DEFAULT 'PARCIAL',
    "reason_id" TEXT,
    "reason_details" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refunded_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "requires_fiscal_document" BOOLEAN NOT NULL DEFAULT true,
    "status" "FinancialEntryStatus" NOT NULL DEFAULT 'PENDENTE',
    "returned_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "sale_item_id" TEXT NOT NULL,
    "product_id" TEXT,
    "service_id" TEXT,
    "description" VARCHAR(255) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "cfop" VARCHAR(8),
    "ncm_code" VARCHAR(12),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_reasons" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "fiscal_code" VARCHAR(4),
    "refunds_value" BOOLEAN NOT NULL DEFAULT true,
    "restocks_inventory" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "return_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "product_id" TEXT,
    "category_id" TEXT,
    "seller_id" TEXT,
    "base" "CommissionBase" NOT NULL DEFAULT 'VALOR_LIQUIDO_ITEM',
    "percent" DECIMAL(9,4) NOT NULL,
    "fixed_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minimum_quantity" DECIMAL(14,4),
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "sale_id" TEXT,
    "seller_id" TEXT NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDENTE',
    "period" CHAR(7) NOT NULL,
    "base_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "commission_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deduction_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_items" (
    "id" TEXT NOT NULL,
    "commission_id" TEXT NOT NULL,
    "product_id" TEXT,
    "sale_item_id" TEXT,
    "base_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "type" "AccountType" NOT NULL,
    "nature" "AccountNature" NOT NULL,
    "parent_id" TEXT,
    "is_postable" BOOLEAN NOT NULL DEFAULT true,
    "is_profit_and_loss" BOOLEAN NOT NULL DEFAULT false,
    "is_sped_account" BOOLEAN NOT NULL DEFAULT false,
    "sped_group_code" VARCHAR(20),
    "compatible_account_code" VARCHAR(20),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "type" "FinancialEntryType" NOT NULL,
    "status" "FinancialEntryStatus" NOT NULL DEFAULT 'PENDENTE',
    "description" VARCHAR(255) NOT NULL,
    "notes" TEXT,
    "source_account_id" TEXT NOT NULL,
    "destination_account_id" TEXT NOT NULL,
    "cost_center_id" TEXT,
    "bank_account_id" TEXT,
    "payment_method_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "remaining_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3) NOT NULL,
    "settled_date" TIMESTAMP(3),
    "competence_date" TIMESTAMP(3) NOT NULL,
    "document_type" VARCHAR(40),
    "document_id" TEXT,
    "document_number" VARCHAR(40),
    "idempotency_key" VARCHAR(120),
    "created_by_id" TEXT,
    "settled_by_id" TEXT,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_rule" VARCHAR(120),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "action" "SettlementAction" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bank_account_id" TEXT,
    "payment_method_id" TEXT,
    "notes" TEXT,
    "receipt_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "chart_of_account_id" TEXT NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "type" "BankAccountType" NOT NULL DEFAULT 'CONTA_CORRENTE',
    "bankName" VARCHAR(120),
    "bank_code" VARCHAR(10),
    "agency" VARCHAR(20),
    "agency_digit" VARCHAR(4),
    "account_number" VARCHAR(30),
    "account_digit" VARCHAR(4),
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "current_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "period" CHAR(7) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "closing_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reconciled_at" TIMESTAMP(3),
    "reconciled_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliation_items" (
    "id" TEXT NOT NULL,
    "reconciliation_id" TEXT NOT NULL,
    "entry_id" TEXT,
    "external_transaction_id" TEXT,
    "description" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_receivable" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "sale_id" TEXT,
    "payment_terms_id" TEXT,
    "number" VARCHAR(40) NOT NULL,
    "kind" "PayableReceivableKind" NOT NULL DEFAULT 'CONTAS_A_RECEBER',
    "status" "FinancialEntryStatus" NOT NULL DEFAULT 'PENDENTE',
    "origin_amount" DECIMAL(14,2) NOT NULL,
    "interest_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3) NOT NULL,
    "competence_date" TIMESTAMP(3) NOT NULL,
    "settled_date" TIMESTAMP(3),
    "notes" TEXT,
    "document_type" VARCHAR(40),
    "document_id" TEXT,
    "document_number" VARCHAR(40),
    "document_date" TIMESTAMP(3),
    "category" "FinancialEntryType",
    "notes_settlement" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accounts_receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_payable" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "purchase_id" TEXT,
    "payment_terms_id" TEXT,
    "number" VARCHAR(40) NOT NULL,
    "kind" "PayableReceivableKind" NOT NULL DEFAULT 'CONTAS_A_PAGAR',
    "status" "FinancialEntryStatus" NOT NULL DEFAULT 'PENDENTE',
    "origin_amount" DECIMAL(14,2) NOT NULL,
    "interest_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3) NOT NULL,
    "competence_date" TIMESTAMP(3) NOT NULL,
    "settled_date" TIMESTAMP(3),
    "notes" TEXT,
    "document_type" VARCHAR(40),
    "document_id" TEXT,
    "document_number" VARCHAR(40),
    "document_date" TIMESTAMP(3),
    "category" "FinancialEntryType",
    "notes_settlement" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accounts_payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "accounts_receivable_id" TEXT,
    "accounts_payable_id" TEXT,
    "payment_method_id" TEXT,
    "number" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDENTE',
    "amount" DECIMAL(14,2) NOT NULL,
    "interest_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "credit_card_due_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "number" VARCHAR(40) NOT NULL,
    "type" "PurchaseType" NOT NULL DEFAULT 'PEDIDO',
    "status" "PurchaseStatus" NOT NULL DEFAULT 'RASCUNHO',
    "payment_terms_id" TEXT,
    "seller_id" TEXT,
    "fiscal_access_key" VARCHAR(44),
    "fiscal_xml_url" TEXT,
    "order_date" TIMESTAMP(3) NOT NULL,
    "received_date" TIMESTAMP(3),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shipping_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retention_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "idempotency_key" VARCHAR(120),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "product_id" TEXT,
    "description" VARCHAR(255) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "purchase_unit_quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "creditable_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditable_tax_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "cfop" VARCHAR(8),
    "ncm_code" VARCHAR(12),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'FECHADO',
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "opening_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "closing_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "difference_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expected_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "counted_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "opened_by_id" TEXT,
    "closed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "cash_register_id" TEXT NOT NULL,
    "bank_account_id" TEXT,
    "payment_method_id" TEXT,
    "type" "CashMovementType" NOT NULL,
    "direction" "CashMovementDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "document_type" VARCHAR(40),
    "document_id" TEXT,
    "document_number" VARCHAR(40),
    "notes" TEXT,
    "moved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_integrations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "environment" "FiscalEnvironment" NOT NULL DEFAULT 'HOMOLOGACAO',
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "client_id_encrypted" TEXT,
    "client_secret_encrypted" TEXT,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "webhook_token_encrypted" TEXT,
    "external_id" TEXT,
    "last_testeded_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "last_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "model" "InvoiceModel" NOT NULL,
    "environment" "FiscalEnvironment" NOT NULL DEFAULT 'HOMOLOGACAO',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "series" VARCHAR(10),
    "default_cfop_out" VARCHAR(8),
    "default_cfop_in" VARCHAR(8),
    "operation_nature" VARCHAR(120),
    "consumer_presence_indicator" INTEGER,
    "municipality_code" VARCHAR(7),
    "contact_phone" VARCHAR(20),
    "contact_email" VARCHAR(180),
    "contact_name" VARCHAR(120),
    "danfe_format" VARCHAR(20),
    "danfe_security_form" VARCHAR(20),
    "danfe_printer_name" VARCHAR(120),
    "danfe_copies" INTEGER NOT NULL DEFAULT 1,
    "send_xml_by_email" BOOLEAN NOT NULL DEFAULT false,
    "is_test_mode" BOOLEAN NOT NULL DEFAULT false,
    "contingency_type" VARCHAR(40),
    "contingency_justification" TEXT,
    "contingency_active" BOOLEAN NOT NULL DEFAULT false,
    "contingency_active_at" TIMESTAMP(3),
    "contingency_ends_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_series" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "fiscal_config_id" TEXT NOT NULL,
    "model" "InvoiceModel" NOT NULL,
    "series" VARCHAR(10) NOT NULL,
    "environment" "FiscalEnvironment" NOT NULL DEFAULT 'PRODUCAO',
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "is_contingency" BOOLEAN NOT NULL DEFAULT false,
    "authorized_at" TIMESTAMP(3),
    "authorization_protocol" VARCHAR(60),
    "authorization_digest_value" VARCHAR(60),
    "authorized_from" INTEGER,
    "authorized_to" INTEGER,
    "available_from" INTEGER,
    "available_to" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" VARCHAR(140) NOT NULL,
    "type" VARCHAR(4) NOT NULL DEFAULT 'A1',
    "status" "CertificateStatus" NOT NULL DEFAULT 'VALIDO',
    "pfx_encrypted" TEXT,
    "storage_path" TEXT,
    "password_encrypted" TEXT,
    "checksum" VARCHAR(64),
    "subject_name" VARCHAR(200),
    "issuer_name" VARCHAR(200),
    "serial_number" VARCHAR(80),
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "owner_document" VARCHAR(18),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "fiscal_config_id" TEXT,
    "name" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "state" "BrazilState",
    "ncm_code" VARCHAR(12),
    "cest_code" VARCHAR(10),
    "product_id" TEXT,
    "productOrigin" "ProductOrigin",
    "service_id" TEXT,
    "cfop" VARCHAR(8),
    "tax_group" VARCHAR(60),
    "icms_tax_code" VARCHAR(20),
    "icms_rate_percent" DECIMAL(9,4),
    "icms_reduction_percent" DECIMAL(9,4),
    "icms_st_rate_percent" DECIMAL(9,4),
    "icms_st_mva_percent" DECIMAL(9,4),
    "pis_tax_code" VARCHAR(20),
    "pis_rate_percent" DECIMAL(9,4),
    "cofins_tax_code" VARCHAR(20),
    "cofins_rate_percent" DECIMAL(9,4),
    "ipi_rate_percent" DECIMAL(9,4),
    "iss_rate_percent" DECIMAL(9,4),
    "ibs_rate_percent" DECIMAL(9,4),
    "cbs_rate_percent" DECIMAL(9,4),
    "import_tax_rate_percent" DECIMAL(9,4),
    "selective_tax_rate_percent" DECIMAL(9,4),
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "fiscal_config_id" TEXT,
    "fiscal_series_id" TEXT,
    "sale_id" TEXT,
    "order_id" TEXT,
    "purchase_id" TEXT,
    "supplier_id" TEXT,
    "payment_terms_id" TEXT,
    "reference_invoice_id" TEXT,
    "operation_nature_override" VARCHAR(120),
    "model" "InvoiceModel" NOT NULL,
    "direction" "FiscalDirection" NOT NULL DEFAULT 'OUT',
    "status" "FiscalStatus" NOT NULL DEFAULT 'RASCUNHO',
    "environment" "FiscalEnvironment" NOT NULL DEFAULT 'HOMOLOGACAO',
    "number" INTEGER NOT NULL,
    "series" VARCHAR(10),
    "accessKey" VARCHAR(44),
    "query_key" VARCHAR(60),
    "receipt_token" VARCHAR(20),
    "authorized_at" TIMESTAMP(3),
    "authorization_protocol" VARCHAR(60),
    "authorization_digest" VARCHAR(80),
    "denial_reason" TEXT,
    "denial_protocol" VARCHAR(60),
    "customer_id" TEXT,
    "customer_name" VARCHAR(180) NOT NULL,
    "customer_document" VARCHAR(18),
    "customer_document_raw" VARCHAR(20),
    "customer_email" VARCHAR(180),
    "customer_state_registration" VARCHAR(20),
    "customerAddressKind" "FiscalAddressKind",
    "customer_country_code" VARCHAR(60),
    "customer_street" VARCHAR(150),
    "customer_street_number" VARCHAR(20),
    "customer_street_complement" VARCHAR(80),
    "customer_district" VARCHAR(80),
    "customer_city" VARCHAR(100),
    "customerState" "BrazilState",
    "customer_zip_code" VARCHAR(8),
    "customer_country_id" VARCHAR(20),
    "customer_phone" VARCHAR(20),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shipping_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_products" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_services" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "icms_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ipi_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pis_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cofins_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iss_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ibs_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cbs_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "import_tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "selective_tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retention_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transporter_name" VARCHAR(120),
    "transport_mod_frete" INTEGER,
    "vehicle_plate" VARCHAR(10),
    "vehicleUf" "BrazilState",
    "invoice_number" VARCHAR(40),
    "purchase_order_number" VARCHAR(40),
    "contract_number" VARCHAR(40),
    "additional_data" TEXT,
    "xml_url" TEXT,
    "xml_hash" VARCHAR(64),
    "danfe_url" TEXT,
    "pdf_url" TEXT,
    "cifp_pdf_url" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_protocol" VARCHAR(60),
    "cancellation_justification" VARCHAR(255),
    "substituted_by_id" TEXT,
    "contingency_je" VARCHAR(20),
    "emitted_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "notes" TEXT,
    "retention_until" TIMESTAMP(3),
    "approved_for_purge" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" VARCHAR(120),
    "issued_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "product_id" TEXT,
    "service_id" TEXT,
    "sale_item_id" TEXT,
    "description" VARCHAR(255) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ncm_code" VARCHAR(12),
    "ncm_table_version" VARCHAR(20),
    "cest_code" VARCHAR(10),
    "productOrigin" "ProductOrigin",
    "cfop" VARCHAR(8),
    "sped_item_type" VARCHAR(60),
    "icms_tax_code" VARCHAR(20),
    "icms_base" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "icms_rate_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "icms_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "icms_st_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "icms_st_base" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fcp_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "icms_uf_rate_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "icms_uf_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pis_tax_code" VARCHAR(20),
    "pis_base" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pis_rate_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "pis_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cofins_tax_code" VARCHAR(20),
    "cofins_base" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cofins_rate_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "cofins_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ipi_base" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ipi_rate_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "ipi_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iss_base" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iss_rate_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "iss_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ibs_base" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ibs_rate_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "ibs_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cbs_base" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cbs_rate_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "cbs_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "import_tax_base" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "import_tax_rate_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "import_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "selective_tax_base" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "selective_tax_rate_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "selective_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "federal_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "state_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "municipal_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approximate_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "additional_data" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "trace_id" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_events" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "type" "FiscalEventType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'SUCCESS',
    "message" VARCHAR(500),
    "payload" JSONB,
    "protocol" VARCHAR(60),
    "digest" VARCHAR(80),
    "error_code" VARCHAR(20),
    "ip" VARCHAR(64),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "integration_id" TEXT,
    "direction" "FiscalLogDirection" NOT NULL,
    "endpoint" VARCHAR(500) NOT NULL,
    "http_method" VARCHAR(10),
    "http_status" INTEGER,
    "duration_ms" INTEGER,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "sanitized_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error_message" TEXT,
    "correlation_id" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "type" "FiscalJobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "payload" JSONB,
    "result" JSONB,
    "error_message" TEXT,
    "queue" VARCHAR(40) NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "idempotency_key" VARCHAR(120),
    "lock_token" VARCHAR(60),
    "locked_at" TIMESTAMP(3),
    "lockedBy" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_name" VARCHAR(140),
    "user_email" VARCHAR(180),
    "session_id" TEXT,
    "is_impersonation" BOOLEAN NOT NULL DEFAULT false,
    "impersonation_reason" VARCHAR(255),
    "action" "AuditAction" NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(40),
    "description" VARCHAR(500),
    "changes" JSONB,
    "metadata" JSONB,
    "api_key_id" TEXT,
    "ip" VARCHAR(64),
    "user_agent" TEXT,
    "correlation_id" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "customer_id" TEXT,
    "purpose" VARCHAR(80) NOT NULL,
    "document_version" VARCHAR(20) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "legalBasis" "LegalBasis",
    "ip" VARCHAR(64),
    "user_agent" TEXT,
    "document_hash" VARCHAR(64),
    "notes" TEXT,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "customer_id" TEXT,
    "protocol" VARCHAR(20) NOT NULL,
    "type" "DataSubjectRequestType" NOT NULL,
    "status" "DataSubjectRequestStatus" NOT NULL DEFAULT 'ABERTA',
    "legalBasis" "LegalBasis",
    "description" VARCHAR(1000),
    "due_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "evidence_url" TEXT,
    "rejection_reason" TEXT,
    "handled_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "entity" VARCHAR(60),
    "entity_id" TEXT,
    "link_url" TEXT,
    "persistent" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "protocol" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ABERTO',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIA',
    "category" VARCHAR(60),
    "opened_by_id" TEXT,
    "assigned_to_id" TEXT,
    "is_product_issue" BOOLEAN NOT NULL DEFAULT false,
    "app_version" VARCHAR(20),
    "attachments" JSONB,
    "closed_at" TIMESTAMP(3),
    "closed_reason" TEXT,
    "first_response_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "satisfaction_rating" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT,
    "from_support" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "read_at" TIMESTAMP(3),
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE INDEX "permissions_group_idx" ON "permissions"("group");

-- CreateIndex
CREATE INDEX "roles_tenant_id_active_idx" ON "roles"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_slug_key" ON "roles"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plans_active_sort_order_idx" ON "plans"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "tenants_plan_id_idx" ON "tenants"("plan_id");

-- CreateIndex
CREATE INDEX "tenants_subscription_status_idx" ON "tenants"("subscription_status");

-- CreateIndex
CREATE INDEX "tenants_current_period_end_idx" ON "tenants"("current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_key" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_external_subscription_id_key" ON "subscriptions"("external_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE INDEX "subscription_events_subscription_id_created_at_idx" ON "subscription_events"("subscription_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_external_id_key" ON "billing_invoices"("external_id");

-- CreateIndex
CREATE INDEX "billing_invoices_tenant_id_status_due_date_idx" ON "billing_invoices"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_tenant_id_number_key" ON "billing_invoices"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "tenant_usage_tenant_id_computed_at_idx" ON "tenant_usage"("tenant_id", "computed_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_usage_tenant_id_period_key" ON "tenant_usage"("tenant_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_providers_key_key" ON "fiscal_providers"("key");

-- CreateIndex
CREATE INDEX "fiscal_providers_active_sort_order_idx" ON "fiscal_providers"("active", "sort_order");

-- CreateIndex
CREATE INDEX "ncm_active_idx" ON "ncm"("active");

-- CreateIndex
CREATE INDEX "municipalities_uf_name_idx" ON "municipalities"("uf", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_is_platform_admin_idx" ON "users"("is_platform_admin");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_status_idx" ON "sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_status_idx" ON "sessions"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_expires_at_idx" ON "password_reset_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_active_idx" ON "memberships"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_user_id_key" ON "memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "membership_roles_role_id_idx" ON "membership_roles"("role_id");

-- CreateIndex
CREATE INDEX "user_branch_access_branch_id_idx" ON "user_branch_access"("branch_id");

-- CreateIndex
CREATE INDEX "companies_tenant_id_is_headquarters_idx" ON "companies"("tenant_id", "is_headquarters");

-- CreateIndex
CREATE INDEX "companies_tenant_id_taxRegime_idx" ON "companies"("tenant_id", "taxRegime");

-- CreateIndex
CREATE UNIQUE INDEX "companies_tenant_id_cnpj_key" ON "companies"("tenant_id", "cnpj");

-- CreateIndex
CREATE INDEX "branches_tenant_id_active_idx" ON "branches"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "branches_company_id_idx" ON "branches"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_code_key" ON "branches"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_cnpj_key" ON "branches"("tenant_id", "cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_settings_tenant_id_key_key" ON "tenant_settings"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "customers_tenant_id_name_idx" ON "customers"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "customers_tenant_id_active_deleted_at_idx" ON "customers"("tenant_id", "active", "deleted_at");

-- CreateIndex
CREATE INDEX "customers_tenant_id_total_debt_idx" ON "customers"("tenant_id", "total_debt");

-- CreateIndex
CREATE INDEX "customers_tenant_id_last_purchase_at_idx" ON "customers"("tenant_id", "last_purchase_at");

-- CreateIndex
CREATE INDEX "customers_branch_id_idx" ON "customers"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_cpf_key" ON "customers"("tenant_id", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_cnpj_key" ON "customers"("tenant_id", "cnpj");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_name_idx" ON "suppliers"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_active_deleted_at_idx" ON "suppliers"("tenant_id", "active", "deleted_at");

-- CreateIndex
CREATE INDEX "suppliers_branch_id_idx" ON "suppliers"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_cpf_key" ON "suppliers"("tenant_id", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_cnpj_key" ON "suppliers"("tenant_id", "cnpj");

-- CreateIndex
CREATE INDEX "categories_tenant_id_parent_id_idx" ON "categories"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "categories_tenant_id_active_idx" ON "categories"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "brands_tenant_id_active_idx" ON "brands"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "brands_tenant_id_name_key" ON "brands"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "units_tenant_id_active_idx" ON "units"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "units_tenant_id_name_key" ON "units"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "products_tenant_id_name_idx" ON "products"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "products_tenant_id_barcode_idx" ON "products"("tenant_id", "barcode");

-- CreateIndex
CREATE INDEX "products_tenant_id_category_id_active_idx" ON "products"("tenant_id", "category_id", "active");

-- CreateIndex
CREATE INDEX "products_tenant_id_type_active_idx" ON "products"("tenant_id", "type", "active");

-- CreateIndex
CREATE INDEX "products_tenant_id_ncm_code_idx" ON "products"("tenant_id", "ncm_code");

-- CreateIndex
CREATE INDEX "products_tenant_id_total_stock_idx" ON "products"("tenant_id", "total_stock");

-- CreateIndex
CREATE INDEX "products_branch_id_idx" ON "products"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "services_tenant_id_name_idx" ON "services"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "services_tenant_id_active_idx" ON "services"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "services_branch_id_idx" ON "services"("branch_id");

-- CreateIndex
CREATE INDEX "services_municipality_id_idx" ON "services"("municipality_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_tenant_id_code_key" ON "services"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "payment_methods_tenant_id_active_idx" ON "payment_methods"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "payment_methods_branch_id_idx" ON "payment_methods"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_tenant_id_code_key" ON "payment_methods"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "payment_terms_tenant_id_active_idx" ON "payment_terms"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "payment_terms_branch_id_idx" ON "payment_terms"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_tenant_id_name_key" ON "payment_terms"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "stock_items_tenant_id_quantity_idx" ON "stock_items"("tenant_id", "quantity");

-- CreateIndex
CREATE INDEX "stock_items_tenant_id_branch_id_quantity_idx" ON "stock_items"("tenant_id", "branch_id", "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_tenant_id_branch_id_product_id_key" ON "stock_items"("tenant_id", "branch_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_inventory_item_id_key" ON "stock_movements"("inventory_item_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_branch_id_product_id_created_at_idx" ON "stock_movements"("tenant_id", "branch_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_document_type_document_id_idx" ON "stock_movements"("tenant_id", "document_type", "document_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_type_created_at_idx" ON "stock_movements"("tenant_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_supplier_id_idx" ON "stock_movements"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_tenant_id_idempotency_key_key" ON "stock_movements"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "stock_transfers_tenant_id_status_idx" ON "stock_transfers"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_tenant_id_origin_branch_id_destination_bran_idx" ON "stock_transfers"("tenant_id", "origin_branch_id", "destination_branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_tenant_id_number_key" ON "stock_transfers"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "stock_transfer_items_product_id_idx" ON "stock_transfer_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_items_transfer_id_product_id_key" ON "stock_transfer_items"("transfer_id", "product_id");

-- CreateIndex
CREATE INDEX "inventories_tenant_id_status_idx" ON "inventories"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "inventories_tenant_id_branch_id_type_idx" ON "inventories"("tenant_id", "branch_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "inventories_tenant_id_number_key" ON "inventories"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_inventory_items_movement_id_key" ON "stock_inventory_items"("movement_id");

-- CreateIndex
CREATE INDEX "stock_inventory_items_product_id_idx" ON "stock_inventory_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_inventory_items_inventory_id_product_id_key" ON "stock_inventory_items"("inventory_id", "product_id");

-- CreateIndex
CREATE INDEX "number_sequences_tenant_id_model_idx" ON "number_sequences"("tenant_id", "model");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_tenant_id_branch_id_model_year_key" ON "number_sequences"("tenant_id", "branch_id", "model", "year");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_converted_to_id_key" ON "quotes"("converted_to_id");

-- CreateIndex
CREATE INDEX "quotes_tenant_id_status_valid_until_idx" ON "quotes"("tenant_id", "status", "valid_until");

-- CreateIndex
CREATE INDEX "quotes_tenant_id_customer_id_idx" ON "quotes"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "quotes_tenant_id_branch_id_created_at_idx" ON "quotes"("tenant_id", "branch_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_tenant_id_number_key" ON "quotes"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "quote_items_quote_id_sort_order_idx" ON "quote_items"("quote_id", "sort_order");

-- CreateIndex
CREATE INDEX "quote_items_product_id_idx" ON "quote_items"("product_id");

-- CreateIndex
CREATE INDEX "quote_items_service_id_idx" ON "quote_items"("service_id");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_status_requested_delivery_date_idx" ON "sales_orders"("tenant_id", "status", "requested_delivery_date");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_customer_id_idx" ON "sales_orders"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_branch_id_created_at_idx" ON "sales_orders"("tenant_id", "branch_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_tenant_id_number_key" ON "sales_orders"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_tenant_id_idempotency_key_key" ON "sales_orders"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "sales_order_items_order_id_sort_order_idx" ON "sales_order_items"("order_id", "sort_order");

-- CreateIndex
CREATE INDEX "sales_order_items_product_id_idx" ON "sales_order_items"("product_id");

-- CreateIndex
CREATE INDEX "sales_order_items_service_id_idx" ON "sales_order_items"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quote_id_key" ON "sales"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_id_key" ON "sales"("order_id");

-- CreateIndex
CREATE INDEX "sales_tenant_id_status_sold_at_idx" ON "sales"("tenant_id", "status", "sold_at");

-- CreateIndex
CREATE INDEX "sales_tenant_id_customer_id_sold_at_idx" ON "sales"("tenant_id", "customer_id", "sold_at");

-- CreateIndex
CREATE INDEX "sales_tenant_id_seller_id_sold_at_idx" ON "sales"("tenant_id", "seller_id", "sold_at");

-- CreateIndex
CREATE INDEX "sales_tenant_id_branch_id_sold_at_idx" ON "sales"("tenant_id", "branch_id", "sold_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_number_key" ON "sales"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_idempotency_key_key" ON "sales"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_sort_order_idx" ON "sale_items"("sale_id", "sort_order");

-- CreateIndex
CREATE INDEX "sale_items_product_id_idx" ON "sale_items"("product_id");

-- CreateIndex
CREATE INDEX "sale_items_service_id_idx" ON "sale_items"("service_id");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_product_id_idx" ON "sale_items"("sale_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_gateway_transaction_id_key" ON "payment_transactions"("gateway_transaction_id");

-- CreateIndex
CREATE INDEX "payment_transactions_tenant_id_type_created_at_idx" ON "payment_transactions"("tenant_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "payment_transactions_sale_id_type_idx" ON "payment_transactions"("sale_id", "type");

-- CreateIndex
CREATE INDEX "payment_transactions_tenant_id_paid_at_idx" ON "payment_transactions"("tenant_id", "paid_at");

-- CreateIndex
CREATE INDEX "sale_returns_tenant_id_sale_id_idx" ON "sale_returns"("tenant_id", "sale_id");

-- CreateIndex
CREATE INDEX "sale_returns_tenant_id_status_returned_at_idx" ON "sale_returns"("tenant_id", "status", "returned_at");

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_tenant_id_number_key" ON "sale_returns"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "sale_return_items_return_id_idx" ON "sale_return_items"("return_id");

-- CreateIndex
CREATE INDEX "sale_return_items_product_id_idx" ON "sale_return_items"("product_id");

-- CreateIndex
CREATE INDEX "sale_return_items_service_id_idx" ON "sale_return_items"("service_id");

-- CreateIndex
CREATE INDEX "return_reasons_tenant_id_active_idx" ON "return_reasons"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "return_reasons_tenant_id_code_key" ON "return_reasons"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "commission_rules_tenant_id_active_idx" ON "commission_rules"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "commission_rules_tenant_id_seller_id_idx" ON "commission_rules"("tenant_id", "seller_id");

-- CreateIndex
CREATE INDEX "commission_rules_tenant_id_product_id_idx" ON "commission_rules"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "commissions_tenant_id_status_due_date_idx" ON "commissions"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "commissions_tenant_id_period_status_idx" ON "commissions"("tenant_id", "period", "status");

-- CreateIndex
CREATE INDEX "commissions_seller_id_idx" ON "commissions"("seller_id");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_tenant_id_seller_id_sale_id_period_key" ON "commissions"("tenant_id", "seller_id", "sale_id", "period");

-- CreateIndex
CREATE INDEX "commission_items_commission_id_idx" ON "commission_items"("commission_id");

-- CreateIndex
CREATE INDEX "commission_items_product_id_idx" ON "commission_items"("product_id");

-- CreateIndex
CREATE INDEX "chart_of_accounts_tenant_id_type_idx" ON "chart_of_accounts"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "chart_of_accounts_tenant_id_parent_id_idx" ON "chart_of_accounts"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "chart_of_accounts_tenant_id_is_profit_and_loss_idx" ON "chart_of_accounts"("tenant_id", "is_profit_and_loss");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_tenant_id_code_key" ON "chart_of_accounts"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "cost_centers_tenant_id_active_idx" ON "cost_centers"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_tenant_id_code_key" ON "cost_centers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "financial_entries_tenant_id_status_due_date_idx" ON "financial_entries"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "financial_entries_tenant_id_competence_date_idx" ON "financial_entries"("tenant_id", "competence_date");

-- CreateIndex
CREATE INDEX "financial_entries_tenant_id_document_type_document_id_idx" ON "financial_entries"("tenant_id", "document_type", "document_id");

-- CreateIndex
CREATE INDEX "financial_entries_tenant_id_type_due_date_idx" ON "financial_entries"("tenant_id", "type", "due_date");

-- CreateIndex
CREATE INDEX "financial_entries_source_account_id_idx" ON "financial_entries"("source_account_id");

-- CreateIndex
CREATE INDEX "financial_entries_destination_account_id_idx" ON "financial_entries"("destination_account_id");

-- CreateIndex
CREATE INDEX "financial_entries_cost_center_id_idx" ON "financial_entries"("cost_center_id");

-- CreateIndex
CREATE INDEX "financial_entries_bank_account_id_idx" ON "financial_entries"("bank_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_tenant_id_idempotency_key_key" ON "financial_entries"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "settlements_entry_id_idx" ON "settlements"("entry_id");

-- CreateIndex
CREATE INDEX "settlements_tenant_id_settled_at_idx" ON "settlements"("tenant_id", "settled_at");

-- CreateIndex
CREATE INDEX "settlements_bank_account_id_idx" ON "settlements"("bank_account_id");

-- CreateIndex
CREATE INDEX "settlements_payment_method_id_idx" ON "settlements"("payment_method_id");

-- CreateIndex
CREATE INDEX "bank_accounts_tenant_id_active_idx" ON "bank_accounts"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "bank_accounts_branch_id_idx" ON "bank_accounts"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_tenant_id_name_key" ON "bank_accounts"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "bank_reconciliations_bank_account_id_period_key" ON "bank_reconciliations"("bank_account_id", "period");

-- CreateIndex
CREATE INDEX "bank_reconciliation_items_reconciliation_id_idx" ON "bank_reconciliation_items"("reconciliation_id");

-- CreateIndex
CREATE INDEX "bank_reconciliation_items_entry_id_idx" ON "bank_reconciliation_items"("entry_id");

-- CreateIndex
CREATE INDEX "accounts_receivable_tenant_id_status_due_date_idx" ON "accounts_receivable"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "accounts_receivable_tenant_id_customer_id_status_idx" ON "accounts_receivable"("tenant_id", "customer_id", "status");

-- CreateIndex
CREATE INDEX "accounts_receivable_tenant_id_kind_due_date_idx" ON "accounts_receivable"("tenant_id", "kind", "due_date");

-- CreateIndex
CREATE INDEX "accounts_receivable_sale_id_idx" ON "accounts_receivable"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_receivable_tenant_id_number_key" ON "accounts_receivable"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "accounts_payable_tenant_id_status_due_date_idx" ON "accounts_payable"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "accounts_payable_tenant_id_supplier_id_status_idx" ON "accounts_payable"("tenant_id", "supplier_id", "status");

-- CreateIndex
CREATE INDEX "accounts_payable_tenant_id_kind_due_date_idx" ON "accounts_payable"("tenant_id", "kind", "due_date");

-- CreateIndex
CREATE INDEX "accounts_payable_purchase_id_idx" ON "accounts_payable"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_payable_tenant_id_number_key" ON "accounts_payable"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "installments_tenant_id_status_due_date_idx" ON "installments"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "installments_accounts_receivable_id_idx" ON "installments"("accounts_receivable_id");

-- CreateIndex
CREATE INDEX "installments_accounts_payable_id_idx" ON "installments"("accounts_payable_id");

-- CreateIndex
CREATE INDEX "installments_branch_id_idx" ON "installments"("branch_id");

-- CreateIndex
CREATE INDEX "purchases_tenant_id_status_order_date_idx" ON "purchases"("tenant_id", "status", "order_date");

-- CreateIndex
CREATE INDEX "purchases_tenant_id_supplier_id_order_date_idx" ON "purchases"("tenant_id", "supplier_id", "order_date");

-- CreateIndex
CREATE INDEX "purchases_tenant_id_branch_id_order_date_idx" ON "purchases"("tenant_id", "branch_id", "order_date");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_tenant_id_number_key" ON "purchases"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_tenant_id_fiscal_access_key_key" ON "purchases"("tenant_id", "fiscal_access_key");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_tenant_id_idempotency_key_key" ON "purchases"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_sort_order_idx" ON "purchase_items"("purchase_id", "sort_order");

-- CreateIndex
CREATE INDEX "purchase_items_product_id_idx" ON "purchase_items"("product_id");

-- CreateIndex
CREATE INDEX "cash_registers_tenant_id_status_idx" ON "cash_registers"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "cash_registers_branch_id_idx" ON "cash_registers"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_tenant_id_branch_id_name_key" ON "cash_registers"("tenant_id", "branch_id", "name");

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_cash_register_id_moved_at_idx" ON "cash_movements"("tenant_id", "cash_register_id", "moved_at");

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_type_moved_at_idx" ON "cash_movements"("tenant_id", "type", "moved_at");

-- CreateIndex
CREATE INDEX "cash_movements_branch_id_idx" ON "cash_movements"("branch_id");

-- CreateIndex
CREATE INDEX "cash_movements_bank_account_id_idx" ON "cash_movements"("bank_account_id");

-- CreateIndex
CREATE INDEX "cash_movements_created_by_id_idx" ON "cash_movements"("created_by_id");

-- CreateIndex
CREATE INDEX "fiscal_integrations_tenant_id_active_is_default_idx" ON "fiscal_integrations"("tenant_id", "active", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_integrations_tenant_id_provider_id_environment_key" ON "fiscal_integrations"("tenant_id", "provider_id", "environment");

-- CreateIndex
CREATE INDEX "fiscal_configs_tenant_id_active_idx" ON "fiscal_configs"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_configs_tenant_id_branch_id_model_environment_key" ON "fiscal_configs"("tenant_id", "branch_id", "model", "environment");

-- CreateIndex
CREATE INDEX "fiscal_series_tenant_id_model_active_idx" ON "fiscal_series"("tenant_id", "model", "active");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_series_tenant_id_branch_id_model_series_environment_key" ON "fiscal_series"("tenant_id", "branch_id", "model", "series", "environment");

-- CreateIndex
CREATE INDEX "certificates_tenant_id_status_idx" ON "certificates"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "certificates_tenant_id_valid_until_idx" ON "certificates"("tenant_id", "valid_until");

-- CreateIndex
CREATE INDEX "certificates_branch_id_idx" ON "certificates"("branch_id");

-- CreateIndex
CREATE INDEX "tax_rules_tenant_id_active_idx" ON "tax_rules"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "tax_rules_tenant_id_valid_from_valid_to_idx" ON "tax_rules"("tenant_id", "valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "tax_rules_tenant_id_state_ncm_code_idx" ON "tax_rules"("tenant_id", "state", "ncm_code");

-- CreateIndex
CREATE INDEX "tax_rules_product_id_idx" ON "tax_rules"("product_id");

-- CreateIndex
CREATE INDEX "tax_rules_service_id_idx" ON "tax_rules"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_accessKey_key" ON "invoices"("accessKey");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_status_emitted_at_idx" ON "invoices"("tenant_id", "status", "emitted_at");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_direction_emitted_at_idx" ON "invoices"("tenant_id", "direction", "emitted_at");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_customer_id_emitted_at_idx" ON "invoices"("tenant_id", "customer_id", "emitted_at");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_reference_invoice_id_idx" ON "invoices"("tenant_id", "reference_invoice_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_retention_until_approved_for_purge_idx" ON "invoices"("tenant_id", "retention_until", "approved_for_purge");

-- CreateIndex
CREATE INDEX "invoices_branch_id_status_idx" ON "invoices"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_accessKey_key" ON "invoices"("tenant_id", "accessKey");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_model_series_number_environment_directio_key" ON "invoices"("tenant_id", "model", "series", "number", "environment", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_idempotency_key_key" ON "invoices"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_sort_order_idx" ON "invoice_items"("invoice_id", "sort_order");

-- CreateIndex
CREATE INDEX "invoice_items_product_id_idx" ON "invoice_items"("product_id");

-- CreateIndex
CREATE INDEX "invoice_items_service_id_idx" ON "invoice_items"("service_id");

-- CreateIndex
CREATE INDEX "invoice_items_ncm_code_idx" ON "invoice_items"("ncm_code");

-- CreateIndex
CREATE INDEX "invoice_events_invoice_id_created_at_idx" ON "invoice_events"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "invoice_events_type_created_at_idx" ON "invoice_events"("type", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_logs_tenant_id_created_at_idx" ON "fiscal_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_logs_invoice_id_created_at_idx" ON "fiscal_logs"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_logs_integration_id_created_at_idx" ON "fiscal_logs"("integration_id", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_jobs_status_queue_scheduled_at_idx" ON "fiscal_jobs"("status", "queue", "scheduled_at");

-- CreateIndex
CREATE INDEX "fiscal_jobs_tenant_id_status_created_at_idx" ON "fiscal_jobs"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_jobs_invoice_id_idx" ON "fiscal_jobs"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_jobs_tenant_id_idempotency_key_key" ON "fiscal_jobs"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_entity_id_created_at_idx" ON "audit_logs"("tenant_id", "entity", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_user_id_created_at_idx" ON "audit_logs"("tenant_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_action_created_at_idx" ON "audit_logs"("tenant_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_correlation_id_idx" ON "audit_logs"("correlation_id");

-- CreateIndex
CREATE INDEX "consent_logs_user_id_purpose_idx" ON "consent_logs"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "consent_logs_customer_id_purpose_idx" ON "consent_logs"("customer_id", "purpose");

-- CreateIndex
CREATE INDEX "consent_logs_purpose_granted_at_idx" ON "consent_logs"("purpose", "granted_at");

-- CreateIndex
CREATE INDEX "data_subject_requests_user_id_status_type_idx" ON "data_subject_requests"("user_id", "status", "type");

-- CreateIndex
CREATE INDEX "data_subject_requests_status_due_at_idx" ON "data_subject_requests"("status", "due_at");

-- CreateIndex
CREATE INDEX "data_subject_requests_customer_id_idx" ON "data_subject_requests"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_subject_requests_protocol_key" ON "data_subject_requests"("protocol");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_read_at_idx" ON "notifications"("tenant_id", "user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_type_created_at_idx" ON "notifications"("tenant_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_created_at_idx" ON "notifications"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_status_priority_idx" ON "support_tickets"("tenant_id", "status", "priority");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_assigned_to_id_status_idx" ON "support_tickets"("tenant_id", "assigned_to_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_tenant_id_protocol_key" ON "support_tickets"("tenant_id", "protocol");

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "support_messages_author_id_idx" ON "support_messages"("author_id");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_modules" ADD CONSTRAINT "plan_modules_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_usage" ADD CONSTRAINT "tenant_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch_access" ADD CONSTRAINT "user_branch_access_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch_access" ADD CONSTRAINT "user_branch_access_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("ibge_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("ibge_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_default_payment_terms_id_fkey" FOREIGN KEY ("default_payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_ncm_code_fkey" FOREIGN KEY ("ncm_code") REFERENCES "ncm"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("ibge_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "stock_inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_origin_branch_id_fkey" FOREIGN KEY ("origin_branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_branch_id_fkey" FOREIGN KEY ("destination_branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventory_items" ADD CONSTRAINT "stock_inventory_items_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventory_items" ADD CONSTRAINT "stock_inventory_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_converted_to_id_fkey" FOREIGN KEY ("converted_to_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "return_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_reasons" ADD CONSTRAINT "return_reasons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_items" ADD CONSTRAINT "commission_items_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "commissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_items" ADD CONSTRAINT "commission_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_destination_account_id_fkey" FOREIGN KEY ("destination_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "financial_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "financial_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_accounts_receivable_id_fkey" FOREIGN KEY ("accounts_receivable_id") REFERENCES "accounts_receivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_accounts_payable_id_fkey" FOREIGN KEY ("accounts_payable_id") REFERENCES "accounts_payable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_integrations" ADD CONSTRAINT "fiscal_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_integrations" ADD CONSTRAINT "fiscal_integrations_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "fiscal_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_configs" ADD CONSTRAINT "fiscal_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_configs" ADD CONSTRAINT "fiscal_configs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_configs" ADD CONSTRAINT "fiscal_configs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "fiscal_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_series" ADD CONSTRAINT "fiscal_series_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_series" ADD CONSTRAINT "fiscal_series_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_series" ADD CONSTRAINT "fiscal_series_fiscal_config_id_fkey" FOREIGN KEY ("fiscal_config_id") REFERENCES "fiscal_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_fiscal_config_id_fkey" FOREIGN KEY ("fiscal_config_id") REFERENCES "fiscal_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_fiscal_config_id_fkey" FOREIGN KEY ("fiscal_config_id") REFERENCES "fiscal_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_fiscal_series_id_fkey" FOREIGN KEY ("fiscal_series_id") REFERENCES "fiscal_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reference_invoice_id_fkey" FOREIGN KEY ("reference_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_substituted_by_id_fkey" FOREIGN KEY ("substituted_by_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_events" ADD CONSTRAINT "invoice_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_events" ADD CONSTRAINT "invoice_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_logs" ADD CONSTRAINT "fiscal_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_logs" ADD CONSTRAINT "fiscal_logs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_logs" ADD CONSTRAINT "fiscal_logs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "fiscal_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_jobs" ADD CONSTRAINT "fiscal_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_jobs" ADD CONSTRAINT "fiscal_jobs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
