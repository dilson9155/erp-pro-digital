# ADR 0004 - A granularidade de ação mora no vínculo, não na permissão

- **Status:** aceita
- **Data:** 2026-09-27
- **Escopo:** RBAC; `Permission`, `RolePermission`, tela de configuração de perfis

## Contexto

O RBAC tem duas tabelas e uma escolha de modelagem que parece detalhe de schema e
é, na verdade, a decisão que define se o sistema de perfis serve para alguma coisa.

`Permission` é **global**: não tem `tenantId`, e `key` é `@unique`. Existe uma
linha só por recurso, em toda a plataforma:

```prisma
model Permission {
  key     String    @unique @db.VarChar(80)   // "VENDAS.venda"
  module  String    @db.VarChar(40)
  actions String[]                            // <-- aqui estava a concessão
}
```

`RolePermission` era só o vínculo entre perfil e permissão, sem nenhum dado próprio.

A primeira implementação do executor de RBAC desceu por esta linha:

```ts
select: { permission: { select: { key: true, actions: true } } }
```

E o teste de "união de ações de vários perfis" reprovou com `create, update` em vez
de `create, read, update`. Não era bug da consulta: era o schema respondendo.

Como `key` é única, "VENDAS.venda" é **a mesma linha** para todos os perfis de
todos os tenants. Guardar as ações nela significa que **todo perfil que possa ler
uma venda também pode apagá-la e aprová-la**, e não existe meio de granularizar,
porque não há segunda linha para granularizar. Vendedor, gerente e auditor
recebiam exatamente o mesmo poder, e a tela de perfis seria decoração.

As saídas possíveis eram três:

1. **Manter como está.** Um perfil por recurso, sete ações para todos. Aprovado por
   ser o modelo mais curto; rejeitado porque "liberar vendas para o vendedor"
   libera também "cancelar venda faturada" e "excluir venda do relatório".
2. **Uma `Permission` por ação** (`VENDAS.venda.delete` como chave própria). Resolve
   a granularidade, e paga por ela: `key` deixa de descrever o recurso, a contagem
   de linhas vai de ~80 para ~300, e a tela de perfis vira uma lista de 300 caixas
   sem agrupamento natural. Pior: nada impede que `VENDAS.venda.delete` exista sem
   `VENDAS.venda.read`, e o perfil passa a ter um poder que não faz sentido sozinho.
3. **Mover a concessão para o vínculo.** `Permission` descreve o recurso e o
   catálogo de ações que ele suporta; `RolePermission.actions` é o subconjunto que
   **aquele** perfil recebe.

## Decisão

Adotada a opção 3.

```prisma
model Permission {
  key              String   @unique @db.VarChar(80)   // "VENDAS.venda"
  module           String   @db.VarChar(40)
  availableActions String[] @map("available_actions") // o que o recurso SUPORTA
}

model RolePermission {
  roleId       String
  permissionId String
  actions      String[]   // o que ESTE PERFIL recebe
  @@id([roleId, permissionId])
}
```

Os dois arrays têm nomes diferentes de propósito, porque respondem a perguntas
diferentes:

- `availableActions` é o **catálogo do recurso**. A tela de perfis usa para saber
  quais checkboxes oferecer, e o servidor usa para recusar uma concessão de ação
  que o recurso nem implementa (`availableActions: ["read"]` num recurso
  somente-leitura não aceita `approve`).
- `actions` no vínculo é a **concessão**. É daqui que o executor de RBAC lê.

Um mesmo recurso pode ter um perfil com `["create","read"]` e outro com
`["read","update","approve"]`, sem duplicar a permissão.

## Consequências

**Ganhos.**

- A tela de configuração de perfis passa a ser correspondente: recurso na coluna,
  ações como checkboxes, e o subconjunto por perfil.
- Um perfil de leitura pode existir sem dar poder de apagar.
- A recusa de ação fora do catálogo tem onde morar, e é testável.

**Custos, assumidos conscientemente.**

- Uma coluna a mais em `role_permissions`, e a invariante `actions ⊆
  availableActions` passa a ser responsabilidade do **código que grava** o
  vínculo. Ela não é imposta pelo banco: `TEXT[]` não sabe o que é uma ação
  válida. Consequência prática: a tela de perfis precisa validar antes de gravar, e
  essa validação precisa de teste próprio.
- `availableActions` é metadado de seed. Se alguém adicionar uma ação nova ao
  catálogo de um recurso e esquecer de semear, a tela não oferece a caixa — o que
  é o modo de falha **seguro** (funcionalidade escondida, não permissão extra).

**Por que a migração converte em vez de começar vazio.** A migração
`20260927010000` renomeia `permissions.actions` para `available_actions`, cria
`role_permissions.actions` e propaga o valor antigo para os vínculos existentes.
Nenhum acesso muda na aplicação da migração: até aqui todo perfil vivia com o
catálogo inteiro, e continua. O que passa a ser possível **depois** é divergir. A
conversão preserva o estado existente, e não adota o estado desejado.

## Onde a decisão é verificada

- `src/lib/rbac/permissions.ts` — a tripla `(modulo, recurso, acao)` e a
  validação de entrada, que é o que impede uma ação fora do conjunto de chegar à
  consulta.
- `src/server/auth/rbac.ts` — lê `RolePermission.actions`, nunca
  `Permission.actions`.
- `tests/helpers/factories.ts` — `createRole` recusa conceder ação fora de
  `availableActions`, para que um teste com dado inválido falhe na fábrica e não
  chegue a medir a coisa errada.
- `tests/integration/rbac.test.ts` — "resolve a união de ações de vários perfis do
  mesmo recurso" é o teste que reprovou na implementação anterior e que agora
  prova a granularidade.
