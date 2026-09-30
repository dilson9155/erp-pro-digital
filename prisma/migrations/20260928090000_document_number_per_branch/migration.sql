-- Numeracao de documento por filial, e nao por empresa.
--
-- O PROBLEMA
--
-- `NumberSequence` ja era `@@unique([tenantId, branchId, model, year])`: a serie
-- de numeracao e POR FILIAL, e o `schema.prisma` (regra 7, "CONCORRENCIA") ja
-- mandava alocar numero dentro de transacao com lock pessimista sobre essa
-- tabela. Nove documentos, porem, declaravam `@@unique([tenantId, number])`.
--
-- As duas coisas nao podem ser verdade ao mesmo tempo. Com duas filiais ativas,
-- a filial A aloca 000001 e a filial B aloca 000001 — cada uma na SUA linha de
-- `number_sequences`, cada uma respeitando a propria unicidade. A segunda
-- insercao em `sales` estourava `sales_tenant_id_number_key`, e o usuario
-- veria "numero de venda duplicado" numa empresa que nunca duplication nada.
--
-- Pior: a falha dependeria de quantas filiais a empresa tem. Uma empresa de
-- filial unica nunca veria o erro, e o bug apareceria justamente no cliente que
-- crescer para duas filiais — e a serie de venda para de advancing ate o
-- constraint ser afrouxado na mao.
--
-- A CORRECAO
--
-- O unico passa de `tenant_id` para `tenant_id, branch_id` (e, no
-- `stock_transfers`, para `origin_branch_id`). Isso ALARGA a restricao: toda
-- linha que satisfazia a antiga tambem satisfaz a nova, entao o `CREATE UNIQUE
-- INDEX` nao pode falhar sobre dado existente, por mais antigo que seja. Nao ha
-- backfill nem deduplicacao a fazer.
--
-- Duplicidade dentro da MESMA filial continua barrada, que e o que a serie
-- precisa: e o que impede dois documentos com o mesmo numero na mesma serie.
--
-- `billing_invoices` NAO entra. E fatura da plataforma, nao tem `branchId`, e a
-- numeracao e global da assinatura.
--
-- Applies to: sales, quotes, sales_orders, sale_returns, purchases,
--             stock_transfers, inventories, accounts_receivable,
--             accounts_payable

-- --- Vendas, orçamentos, pedidos e devoluções ---------------------------
DROP INDEX "sales_tenant_id_number_key";
CREATE UNIQUE INDEX "sales_tenant_id_branch_id_number_key" ON "sales"("tenant_id", "branch_id", "number");

DROP INDEX "quotes_tenant_id_number_key";
CREATE UNIQUE INDEX "quotes_tenant_id_branch_id_number_key" ON "quotes"("tenant_id", "branch_id", "number");

DROP INDEX "sales_orders_tenant_id_number_key";
CREATE UNIQUE INDEX "sales_orders_tenant_id_branch_id_number_key" ON "sales_orders"("tenant_id", "branch_id", "number");

DROP INDEX "sale_returns_tenant_id_number_key";
CREATE UNIQUE INDEX "sale_returns_tenant_id_branch_id_number_key" ON "sale_returns"("tenant_id", "branch_id", "number");

-- --- Compras ------------------------------------------------------------
DROP INDEX "purchases_tenant_id_number_key";
CREATE UNIQUE INDEX "purchases_tenant_id_branch_id_number_key" ON "purchases"("tenant_id", "branch_id", "number");

-- --- Estoque -----------------------------------------------------------
-- A serie da transferencia e da filial de ORIGEM: e dela que o item sai do
-- estoque, e e por ela que a serie avanca.
DROP INDEX "stock_transfers_tenant_id_number_key";
CREATE UNIQUE INDEX "stock_transfers_tenant_id_origin_branch_id_number_key" ON "stock_transfers"("tenant_id", "origin_branch_id", "number");

DROP INDEX "inventories_tenant_id_number_key";
CREATE UNIQUE INDEX "inventories_tenant_id_branch_id_number_key" ON "inventories"("tenant_id", "branch_id", "number");

-- --- Financeiro ---------------------------------------------------------
DROP INDEX "accounts_receivable_tenant_id_number_key";
CREATE UNIQUE INDEX "accounts_receivable_tenant_id_branch_id_number_key" ON "accounts_receivable"("tenant_id", "branch_id", "number");

DROP INDEX "accounts_payable_tenant_id_number_key";
CREATE UNIQUE INDEX "accounts_payable_tenant_id_branch_id_number_key" ON "accounts_payable"("tenant_id", "branch_id", "number");
