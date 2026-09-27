-- Granularidade de ação por perfil.
--
-- `permissions.actions` era o array de ações de cada recurso, e `permissions` é
-- global (`key` único, sem `tenant_id`). Todos os perfis que concediam um
-- recurso apontavam para a MESMA linha, então herravam o MESMO conjunto de ações:
-- um perfil autorizado a ler uma venda também podia apagá-la e aprová-la, sem
-- qualquer meio de granularizar.
--
-- A correção move a concessão para o vínculo:
--   - `permissions.available_actions` (antes `actions`) passa a ser o CATÁLOGO
--     de ações que o recurso suporta. Serve para a tela de perfis oferecer as
--     caixas certas e para o servidor recusar ação que o recurso nem implementa.
--   - `role_permissions.actions` é o subconjunto que CADA perfil recebe.
--
-- A conversão preserva o comportamento anterior: cada `role_permissions` recebe
-- o array que a permissão tinha. Nenhum acesso muda, a partir de agora é que
-- passa a ser possível divergir.

ALTER TABLE "permissions" RENAME COLUMN "actions" TO "available_actions";

ALTER TABLE "role_permissions" ADD COLUMN "actions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Propaga o catálogo antigo para o vínculo. `DISTINCT` porque dois perfis do
-- mesmo recurso têm linhas de grant idênticas depois do UPDATE acima, e sem
-- isso o SELECT devolveria a mesma linha várias vezes e o INSERT falharia na
-- PK composta [role_id, permission_id].
UPDATE "role_permissions" AS rp
SET "actions" = p."available_actions"
FROM "permissions" AS p
WHERE p."id" = rp."permission_id";

-- A coluna agora é preenchida; o DEFAULT vira apenas trampolim para o
-- `prisma migrate diff` não sugerir uma mudança que não existe.
ALTER TABLE "role_permissions" ALTER COLUMN "actions" DROP DEFAULT;
