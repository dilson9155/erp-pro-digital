-- Indice em `bank_reconciliations.tenant_id`.
--
-- Contexto: a extensao de tenant (`src/server/db/tenant-guard.ts`) injeta
-- `tenantId` em TODA query de model de negocio. A tabela tinha apenas
-- `@@unique([bank_account_id, period])`, cujo indice comeca por outra coluna,
-- entao a listagem de conciliacoes de uma empresa rodava como table scan.
--
-- Escrito a mao, e nao por `prisma migrate dev`, porque a role da aplicacao
-- (`erp_app`) esta sem `CREATEDB` e o comando precisa de um shadow database.
-- `migrate deploy` nao cria banco e por isso funciona com a role atual.
--
-- Este indice nao e redundante com o unico existente: aquele e consultado por
-- (bank_account_id, period), este por (tenant_id). Servem consultas diferentes.

CREATE INDEX "bank_reconciliations_tenant_id_idx" ON "bank_reconciliations"("tenant_id");
