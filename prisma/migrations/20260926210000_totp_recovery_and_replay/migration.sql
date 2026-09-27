-- Recuperacao de TOTP e anti-replay.
--
-- Contexto: `users` ja tinha `totp_secret_encrypted` e `totp_enabled_at`, mas
-- faltavam as duas colunas que tornam o segundo fator realmente utilizavel.
--
-- `totp_recovery_hashes`: array JSON de SHA-256 (base64url) dos codigos de
-- recuperacao. Sem eles, quem perde o celular nao tem NENHUMA saida sem
-- sem passar por um administrador. Um segundo fator sem caminho de escape
-- proprio vira, na pratica, um segundo fator que as pessoas desativam.
--
-- Nao e model separado porque o conjunto e sempre lido e escrito inteiro,
-- nunca consultado por codigo especifico. O indice de um model aqui nao
-- serviria de nada.
--
-- `totp_last_step`: ultimo passo aceito, para impedir replay. Um codigo vale por
-- 90 s (o passo de 30 s mais os vizinhos, para tolerancia a desvio de relogio).
-- Quem observa o codigo na tela da vitima pode reapresenta-lo nessa janela;
-- gravar o passo consumido e recusa-lo depois transforma a janela em uso unico.
--
-- `BIGINT` e nao `INTEGER`: o passo e `floor(unix_segundos / 30)`, e o limite
-- de 2^31 passos estoura em 2038. `BIGINT` no Prisma mapeia para `BigInt` no
-- cliente, que e o tipo certo para um contador que nao para.
--
-- Escrito a mao, e nao por `prisma migrate dev`, porque a role da aplicacao
-- (`erp_app`) esta sem `CREATEDB` e o comando precisa de um shadow database.
-- `migrate deploy` nao cria banco e por isso funciona com a role atual.

ALTER TABLE "users" ADD COLUMN "totp_recovery_hashes" TEXT;
ALTER TABLE "users" ADD COLUMN "totp_last_step" BIGINT;
