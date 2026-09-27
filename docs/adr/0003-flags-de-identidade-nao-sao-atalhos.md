# ADR 0003 — `isPlatformAdmin` e `mustChangePassword` não são atalhos de autorização

- **Status:** aceita
- **Data:** 2026-09-26
- **Escopo:** fronteira entre identidade e autorização; `User`, `Session`, `proxy.ts`

## Contexto

`users` tem dois flags que parecem responder a pergunta "esta pessoa entra?" e que
na verdade respondem a perguntas diferentes:

```prisma
isPlatformAdmin    Boolean  @default(false)   // super admin da PLATAFORMA
mustChangePassword Boolean  @default(false)   // senha provisoria, trocar na 1a entrada
```

Sem um contrato escrito, o código que surgir a partir deles tem três destinos
possíveis, e todos já foram escritos em projetos de ERP:

1. `isPlatformAdmin` virando um `if` que pula a verificação de `Membership` — o
   super admin passa a ler qualquer empresa sem vínculo nenhum, sem rastro, e o
   vazamento de dados entre tenants deixa de ser exceção monitorada e vira
   caminho normal.
2. `mustChangePassword` virando um aviso na tela — o usuário clica em "entendi" e
   entra com a senha que o administrador mandou redefinir, que é uma senha que
   pode estar num e-mail, num tíquete e num ticket de suporte.
3. Os dois virarem `if` espalhados por páginas diferentes, cada um com a sua
   interpretação, o que garante que existam páginas com o comportamento errado.

O ponto em comum é que os dois flags são **estados que restringem ou rotulam**,
e nenhum dos dois **concede** acesso. Um sinalizador de autorização que também
pode ser lido como "se for platform admin, pula as checagens" é um
`auth bypass` esperando a próxima linha de código que o use assim.

## Decisão

**Os dois flags nunca ampliam escopo. Ambos só podem restringir ou exigir um
passo extra.**

### 1. `isPlatformAdmin` rotula, não concede

Super admin da plataforma administra a plataforma: planos, cobrança, suporte,
suspensão de empresa. Para tocar em **dado de negócio de uma empresa**, ele
precisa de um `Membership` como qualquer outro usuário.

```
isPlatformAdmin = true   +   Membership ativa   ->  acesso normal, auditado
isPlatformAdmin = true   +   sem Membership     ->  NEGADO
```

Sem `Membership`, a resposta é não. Não existe "acesso de emergência" nem
"acesso com justificativa": o caminho para algum dado de empresa continua sendo
criar o vínculo.

Quando o super admin atua dentro de uma empresa onde tem vínculo, a ação é
marcada em `AuditLog` com `isImpersonation`, porque o log precisa responder
"quem é o autor" e "o que essa pessoa faria normalmente".

O motivo de não abrir exceção: a exceção seria o ponto cego. `Membership` é
revogável, `isPlatformAdmin` não — o flag é do tipo que se concede uma vez e
fica. Se ele abrisse a porta, cada saída de emergência adicionada depois seria
uma porta permanente que ninguém fechou.

### 2. `mustChangePassword` bloqueia, não avisa

Enquanto o flag estiver ligado, o usuário só acessa a troca de senha. Nada mais:
não a escolha de empresa, não a seleção de filial, não o dashboard.

```
mustChangePassword = true  ->  /trocar-senha  (e nenhuma outra rota)
mustChangePassword = false ->  fluxo normal
```

A troca de senha é servida com sessão válida, e não com um link: a sessão
existe justamente para que o formulário possa ser submetido. A troca limpa o
flag na mesma operação que grava o novo hash, senão existe uma janela em que a
senha nova está salva e o usuário ainda está bloqueado.

**Super admin não é exceção para si mesmo.** `isPlatformAdmin` e
`mustChangePassword` são ortogonais: um super admin cuja senha foi
redefinida por um colega ainda tem de trocá-la. A conta que administra a
plataforma é a conta mais valiosa do sistema; a senha dela é o bem mais
protegido.

### 3. Onde isso é aplicado

Em um único lugar: `src/server/auth/policy.ts`, função pura
`decidirAcesso`. O `proxy.ts` e o layout consomem a decisão; nenhum dos dois
reinterpreta os flags. Os testes cobrem a função, não as páginas, porque a
função é onde o contrato está escrito.

## Consequências

**Boas**

- Não existe caminho no código que conceda acesso a partir de um flag de
  identidade. `isPlatformAdmin` é lido em um lugar só, e ler não concede.
- A página de troca de senha é a única exceção declarada, e a exceção está no
  tipo de retorno, não num `if` espalhado.
- Um super admin não consegue auditar a si mesmo: o `AuditLog` distingue a ação
  de suporte da ação de negócio.

**Custos, aceitos conscientemente**

- *Suporte precisa de uma ferramenta separada.* Um chamado "o cliente precisa
  ver o cadastro dele" vira criação de `Membership` com um usuário de suporte
  dedicado, ou uma exportação assinada. É mais lento que um `if`. É
  deliberado: a alternativa é um super admin com leitura de todos os clientes
  e nenhum registro disso.
- *Dois round-trips a mais por requisição.* `decidirAcesso` precisa de status,
  dos dois flags, do vínculo e da empresa da sessão. Eles vêm da sessão que o
  `authenticateSession` já carregou, e não de consultas novas.
- *`Membership` inativa não é o mesmo que Membership ausente.* Ambos negam,
  por decisões distintas: ausência é "não pertence", inatividade é "pertenceu e
  foi removido". O log de auditoria registra as duas com motivos diferentes.

## Alternativas descartadas

**`isPlatformAdmin` como atalho de permissão.** Descartado. É um `auth bypass`
com nome descritivo, e a tentação de usá-lo como tal aparece sempre que
alguém precisa de acesso urgente: às 23h, com o cliente na linha.

**`mustChangePassword` como banner.** Descartado. Um banner que pode ser
fechado é uma sugestão, e a senha redefinida por terceiro é justamente o caso
em que a sugestão não basta.

**Regras inline no `proxy.ts`.** Descartado. O proxy é o lugar onde a regra
seria aplicada com menos repetição e com mais chance de divergir entre `matcher`
e render: um matcher que esquece uma rota deixa a rota aberta sem erro nenhum.

## Como isto é verificado

- `tests/unit/auth-policy.test.ts` — cobre a função pura `decidirAcesso`: status
  não ativo, troca obrigatória acima de tudo, escolha de empresa sem vínculo,
  vínculo inativo, platform admin sem vínculo, e a ortogonalidade entre os dois
  flags.
- `npm run verify` — falha se algum teste acima deixar de passar.
