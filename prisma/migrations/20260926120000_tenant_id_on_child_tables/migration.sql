-- Tenant proprio nas 15 tabelas-filhas de negocio.
--
-- PROBLEMA
--
-- Estas tabelas nao tinham `tenant_id`: herdavam a empresa pelo pai. Isso
-- significava que `SELECT * FROM sale_items` sem filtro traria itens de todas
-- as empresas, e nenhuma coluna podia ser usada para restricting o acesso.
-- Depender do pai no codigo e o que produz vazamento silencioso: funciona ate
-- alguem esquecer o `where`.
--
-- DECISAO (docs/adr/0002-tenant-isolation.md)
--
-- Denormalizar o tenant ate a folha. O custo e uma coluna por tabela e o risco
-- de a folha divergir do pai; o beneficio e que TODA tabela de negocio passa a
-- ser filtrada do mesmo jeito pela extensao `tenant-guard`, e o indice garante
-- que o filtro nao vire table scan.
--
-- As tres tabelas de ponte de RBAC (role_permissions, membership_roles,
-- user_branch_access) NAO entram aqui: ligam registro global a registro de
-- empresa e nao guardam dado de negocio. Ganhar tenant_id duplicaria o vinculo
-- sem fechar nenhum vazamento real.
--
-- ORDEM DAS OPERACOES
--
-- 1. Coluna anulavel (para poder preencher).
-- 2. Backfill a partir do pai.
-- 3. Checagem de orfaos: linha cujo pai nao existe nao tem de onde herdar o
--    tenant, e transformar isso em erro agora e muito melhor do que descobrir
--    depois, em producao, com a coluna NOT NULL travando uma gravacao.
-- 4. `NOT NULL` + FK + indice.
--
-- Escrito a mao, e nao por `prisma migrate dev`, porque a role da aplicacao
-- (`erp_app`) esta sem CREATEDB e o comando precisa de shadow database.
-- `migrate deploy` nao cria banco e funciona com a role atual.

-- =====================================================================
-- 1 e 4: consent_logs e data_subject_requests
--
-- Estas duas nao tem pai com tenant: apontam para `users` (global) ou
-- `customers` (de empresa), ambos opcionais. O `tenant_id` e preenchido pelo
-- chamador a partir do contexto, e o guard o injeta automaticamente.
-- =====================================================================

ALTER TABLE "consent_logs" ADD COLUMN "tenant_id" TEXT;
UPDATE "consent_logs" cl
   SET "tenant_id" = c."tenant_id"
  FROM "customers" c
 WHERE cl."customer_id" = c."id";

ALTER TABLE "consent_logs" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "consent_logs"
  ADD CONSTRAINT "consent_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "consent_logs_tenant_id_idx" ON "consent_logs"("tenant_id");

ALTER TABLE "data_subject_requests" ADD COLUMN "tenant_id" TEXT;
UPDATE "data_subject_requests" dsr
   SET "tenant_id" = c."tenant_id"
  FROM "customers" c
 WHERE dsr."customer_id" = c."id";

ALTER TABLE "data_subject_requests" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "data_subject_requests"
  ADD CONSTRAINT "data_subject_requests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "data_subject_requests_tenant_id_idx" ON "data_subject_requests"("tenant_id");

-- =====================================================================
-- 2 a 4: demais tabelas, com backfill a partir do pai
-- =====================================================================

-- subscription_events <- subscriptions.subscription_id
ALTER TABLE "subscription_events" ADD COLUMN "tenant_id" TEXT;
UPDATE "subscription_events" se
   SET "tenant_id" = s."tenant_id" FROM "subscriptions" s
 WHERE se."subscription_id" = s."id";
ALTER TABLE "subscription_events" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "subscription_events"
  ADD CONSTRAINT "subscription_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "subscription_events_tenant_id_idx" ON "subscription_events"("tenant_id");

-- stock_transfer_items <- stock_transfers.transfer_id
ALTER TABLE "stock_transfer_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "stock_transfer_items" sti
   SET "tenant_id" = st."tenant_id" FROM "stock_transfers" st
 WHERE sti."transfer_id" = st."id";
ALTER TABLE "stock_transfer_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "stock_transfer_items"
  ADD CONSTRAINT "stock_transfer_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "stock_transfer_items_tenant_id_idx" ON "stock_transfer_items"("tenant_id");

-- stock_inventory_items <- inventories.inventory_id
-- ATENCAO ao nome: o model chama `InventoryItem`, mas a tabela fisica chama
-- `stock_inventory_items` (`@@map`). E o tipo de divergencia que o verificador
-- de tenant pegaria, e que a migration falhou de proposito ao encontrar.
ALTER TABLE "stock_inventory_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "stock_inventory_items" sii
   SET "tenant_id" = i."tenant_id" FROM "inventories" i
 WHERE sii."inventory_id" = i."id";
ALTER TABLE "stock_inventory_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "stock_inventory_items"
  ADD CONSTRAINT "stock_inventory_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "stock_inventory_items_tenant_id_idx" ON "stock_inventory_items"("tenant_id");

-- quote_items <- quotes.quote_id
ALTER TABLE "quote_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "quote_items" qi
   SET "tenant_id" = q."tenant_id" FROM "quotes" q
 WHERE qi."quote_id" = q."id";
ALTER TABLE "quote_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "quote_items"
  ADD CONSTRAINT "quote_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "quote_items_tenant_id_idx" ON "quote_items"("tenant_id");

-- sales_order_items <- sales_orders.order_id
ALTER TABLE "sales_order_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "sales_order_items" soi
   SET "tenant_id" = so."tenant_id" FROM "sales_orders" so
 WHERE soi."order_id" = so."id";
ALTER TABLE "sales_order_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "sales_order_items"
  ADD CONSTRAINT "sales_order_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "sales_order_items_tenant_id_idx" ON "sales_order_items"("tenant_id");

-- sale_items <- sales.sale_id
ALTER TABLE "sale_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "sale_items" si
   SET "tenant_id" = s."tenant_id" FROM "sales" s
 WHERE si."sale_id" = s."id";
ALTER TABLE "sale_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "sale_items_tenant_id_idx" ON "sale_items"("tenant_id");

-- sale_return_items <- sale_returns.return_id
ALTER TABLE "sale_return_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "sale_return_items" sri
   SET "tenant_id" = sr."tenant_id" FROM "sale_returns" sr
 WHERE sri."return_id" = sr."id";
ALTER TABLE "sale_return_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "sale_return_items"
  ADD CONSTRAINT "sale_return_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "sale_return_items_tenant_id_idx" ON "sale_return_items"("tenant_id");

-- commission_items <- commissions.commission_id
ALTER TABLE "commission_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "commission_items" ci
   SET "tenant_id" = c."tenant_id" FROM "commissions" c
 WHERE ci."commission_id" = c."id";
ALTER TABLE "commission_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "commission_items"
  ADD CONSTRAINT "commission_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "commission_items_tenant_id_idx" ON "commission_items"("tenant_id");

-- bank_reconciliation_items <- bank_reconciliations.reconciliation_id
ALTER TABLE "bank_reconciliation_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "bank_reconciliation_items" bri
   SET "tenant_id" = br."tenant_id" FROM "bank_reconciliations" br
 WHERE bri."reconciliation_id" = br."id";
ALTER TABLE "bank_reconciliation_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "bank_reconciliation_items"
  ADD CONSTRAINT "bank_reconciliation_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "bank_reconciliation_items_tenant_id_idx" ON "bank_reconciliation_items"("tenant_id");

-- purchase_items <- purchases.purchase_id
ALTER TABLE "purchase_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "purchase_items" pi
   SET "tenant_id" = p."tenant_id" FROM "purchases" p
 WHERE pi."purchase_id" = p."id";
ALTER TABLE "purchase_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "purchase_items"
  ADD CONSTRAINT "purchase_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "purchase_items_tenant_id_idx" ON "purchase_items"("tenant_id");

-- invoice_items <- invoices.invoice_id
ALTER TABLE "invoice_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "invoice_items" ii
   SET "tenant_id" = i."tenant_id" FROM "invoices" i
 WHERE ii."invoice_id" = i."id";
ALTER TABLE "invoice_items" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "invoice_items_tenant_id_idx" ON "invoice_items"("tenant_id");

-- invoice_events <- invoices.invoice_id
ALTER TABLE "invoice_events" ADD COLUMN "tenant_id" TEXT;
UPDATE "invoice_events" ie
   SET "tenant_id" = i."tenant_id" FROM "invoices" i
 WHERE ie."invoice_id" = i."id";
ALTER TABLE "invoice_events" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "invoice_events"
  ADD CONSTRAINT "invoice_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "invoice_events_tenant_id_idx" ON "invoice_events"("tenant_id");

-- support_messages <- support_tickets.ticket_id
ALTER TABLE "support_messages" ADD COLUMN "tenant_id" TEXT;
UPDATE "support_messages" sm
   SET "tenant_id" = st."tenant_id" FROM "support_tickets" st
 WHERE sm."ticket_id" = st."id";
ALTER TABLE "support_messages" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "support_messages"
  ADD CONSTRAINT "support_messages_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "support_messages_tenant_id_idx" ON "support_messages"("tenant_id");
