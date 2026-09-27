# ADR 0002 — Isolamento de tenant: coluna na folha, não herança pelo pai

- **Status:** aceita
- **Data:** 2026-09-26
- **Escopo:** todas as tabelas de negócio do ERP

## Contexto

O ERP é multi-tenant. Toda tabela de negócio pertence a uma empresa (`Tenant`),
e o endereço dessas empresas é o CNPJ que emite nota, a filial que vende e o
estoque que movimenta. Um vazamento entre tenants não é um bug de exibição:
é a nota fiscal de uma empresa aparecendo no relatório de outra.

A causa raiz desse tipo de vazamento quase nunca é o banco. É o código que
esqueceu um `where`:

```ts
// Funciona. Até alguém escrever a versão de baixo.
const vendas = await db.sale.findMany({ where: { tenantId } });

// Traz vendas de TODAS as empresas.
const vendas = await db.sale.findMany();
```

Revisão de código não escala contra isso. A regra adotada é tornar o vazamento
impossível por construção: **a aplicação nunca escreve `tenantId`**. Uma
extensão do Prisma injeta o filtro, e a ausência de escopo **recusa** a query
em vez de executá-la sem filtro.

## O problema resolvido aqui

Com a regra acima, toda tabela que passa pelo guard precisa de uma coluna
`tenant_id`. As 15 tabelas-filhas de negócio não tinham uma:

| Tabela | Herdava de |
|---|---|
| `sale_items` | `sales` |
| `invoice_items`, `invoice_events` | `invoices` |
| `purchase_items` | `purchases` |
| `quote_items` | `quotes` |
| `sales_order_items` | `sales_orders` |
| `sale_return_items` | `sale_returns` |
| `commission_items` | `commissions` |
| `stock_transfer_items` | `stock_transfers` |
| `stock_inventory_items` | `inventories` |
| `bank_reconciliation_items` | `bank_reconciliations` |
| `subscription_events` | `subscriptions` |
| `support_messages` | `support_tickets` |
| `consent_logs`, `data_subject_requests` | — (apontam para `users` ou `customers`, ambos opcionais) |

Herdar pelo pai funciona **apenas se ninguém esquecer o pai no filtro**, que é
exatamente o que a extensão existe para eliminar. Um `db.saleItem.findMany()`
sem filtro traria itens de todas as empresas.

## Decisão

**Adicionar `tenant_id` às 15 tabelas-filhas.** Coluna física, `NOT NULL`, com
FK para `tenants` e índice próprio. Migration
`20260926120000_tenant_id_on_child_tables`.

Duas decisões de apoio:

1. **As três tabelas de ponte de RBAC ficam sem `tenant_id`**
   (`role_permissions`, `membership_roles`, `user_branch_access`). Ligam um
   registro global (`User`, `Permission`) a um registro de empresa e não guardam
   dado de negócio. Conceder `tenant_id` duplicaria o vínculo sem fechar
   nenhum vazamento real, porque o acesso a elas acontece por `include` do pai,
   que já foi filtrado. Escrita direta nessas três permanece bloqueada pelo
   guard; leitura exige filtro apontando o pai.

2. **`role` e `session` mantêm `tenant_id` anulável**, com regra própria.
   `Role` com `tenant_id IS NULL` é a matriz de permissões do sistema, clônica
   para cada empresa; sem ela não existiria fonte para clonar. `Session` com
   `tenant_id IS NULL` é a sessão ainda não vinculada a uma empresa, durante a
   tela de escolha após o login — filtrá-la por empresa destruiria essa tela.
   Ambas são exceções com justificativa registrada no verificador.

## Consequências

**Boas**

- O guard é uniforme: 69 tabelas, uma regra só. Não existe "esse model é
  diferente".
- Nenhuma consulta depende de lembrar o pai no filtro.
- O índice em `tenant_id` existe em todas as 69 tabelas, verificado contra o
  catálogo do Postgres. Sem ele, o filtro automático seria table scan.
- O código de negócio escreve `db.sale.create({ data: { items: { create } } })`
  de forma normal. O guard propaga o tenant para os itens aninhados e ignora
  qualquer `tenantId` que o chamador tenha informado no item: a folha tem de
  pertencer à mesma empresa do pai.

**Custos, aceitos conscientemente**

- *Coluna duplicada pode divergir do pai.* Mitigação: o guard sobrescreve o
  valor do item, e o pai tem FK com `ON DELETE CASCADE`. Para auditoria
  (reconciliação, retrabalho em lote) a verificação deve comparar
  `filho.tenant_id` com `pai.tenant_id`; oADR 0005 trata isso.
- *Mais 15 colunas e 15 índices.* Custo de armazenamento desprezível neste
  volume, e é o que paga a uniformidade.
- *Migration que faz backfill.* Numa base com milhões de itens, o
  `UPDATE ... FROM` trava. Aqui a base nasce vazia, e o procedimento está
  documentado: coluna anulável, backfill, `SET NOT NULL` (que falha alto se
  houver órfão), FK, índice.

## Alternativas descartadas

**Herança pelo pai, com escrita bloqueada.** Sem migration. O guard exigiria
filtro do pai na leitura e bloquearia escrita direta, obrigando todo módulo a
escrever "via pai". Descartado por ergonomic: o CRUD de itens de venda é o
caminho mais quente do ERP, e torná-lo mais verboso para evitar 15 colunas
inverte o custo real. Era a opção inicial, e o verificador de tenant
existia justamente para medir o furo que ela deixava.

**Row Level Security do Postgres.** Camada mais forte: protege inclusive contra
`psql` e contra bug na aplicação. Não adotada agora porque RLS exige
`current_setting` por conexão, o que conflita com o pool compartilhado do
`pg` (uma conexão serve várias requisições com tenants diferentes) e begs por
`SET LOCAL` em transação, o que limita a extensão a dentro de transação.
Fica como camada de defesa em profundidade para a fase de produção, quando o
pool puder ser dedicado por tenant.

## Como isto é verificado

- `npm run db:verify-tenant` — confere schema, banco e lista do guard; falha se
  um model novo tiver `tenant_id` e não for registrado, se a lista citingar
  model inexistente, se houver coluna sem índice, ou se a migration não foi
  aplicada. Rodar no CI.
- `tests/unit/tenant-guard.test.ts` — 37 testes sobre a função pura
  `applyTenantGuard`: injeção, fail-closed, `NOT NULL` nos itens, bloqueio de
  mudança de tenant, negação da sentinela de sistema.
- Regras de ESLint impedem que um Client Component importe `@/server/**` ou o
  Prisma Client, o que colocaria o banco no bundle do navegador.
