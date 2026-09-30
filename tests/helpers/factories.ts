/**
 * Fabricas de dados para os testes de integracao.
 *
 * POR QUE FABRICAS E NAO `create` DIRETO NOS TESTES
 *
 * As tabelas tem muitas colunas obrigatorias e, pior, defaults que importam
 * (`Decimal`, `Date`, enums). Um `db.user.create({ data: { email } })` espalhado
 * por 20 testes e 20 lugares para atualizar quando o schema mudar.
 *
 * A alternativa mais comum — `faker` — foi descartada de proposito. Alem da
 * dependencia, dado aleatorio reproduzivel e um dado que esconde bug: um teste
 * que passa com `name: "x"` e falha com `name: "Ana Paula Silva"` esta
 * escondendo um erro de truncamento ou de validacao. Aqui os valores sao
 * FIXOS e LEGIVEIS, e o unico dado variavel e o que o teste precisa variar.
 *
 * O que varia entre testes e gerado por `unique()`, que usa o tempo: dois
 * `createUser()` seguidos nao colidem no indice unico de `users.email`.
 */

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { PlanModuleKey, SubscriptionStatus } from "@/generated/prisma/enums";
import { hashPassword } from "@/lib/auth/password";
import { ACOES } from "@/lib/rbac/permissions";

/**
 * Client CRU, sem a extensao de tenant.
 *
 * O cliente normal (`scopedDb`) RECUSA toda operacao sem escopo — o que esta
 * correto em producao e atrapalha no teste: para criar o tenant que a sessao
 * vai referenciar, e preciso escrever antes de existir escopo.
 *
 * Por que nao e um problema de seguranca: este client so e importado por
 * `tests/`, e o ESLint bloqueia `@/server/**` fora do servidor. A extensao nao
 * e uma barreira de confianca entre o codigo e o banco; e uma garantia
 * ESTRUTURAL de que o codigo de aplicacao nao esquece filtro. Teste precisa
 * escrever sem ela para poder verificar o que ela faz.
 */
let client: PrismaClient | undefined;

export function testDb(): PrismaClient {
  if (client) return client;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente: o setup de integracao nao rodou?");

  const adapter = new PrismaPg({ connectionString: url, max: 5 });
  client = new PrismaClient({ adapter, log: ["error"] });
  return client;
}

/** Fecha o pool. Chamado no `afterAll` do arquivo de teste. */
export async function closeTestDb(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

let counter = 0;

/** Sufixo unico, sem depender de `Math.random` (que tornaria a falha irreproduzivel). */
function unique(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

export const SENHA_PADRAO = "senha-de-teste-123";

/**
 * Hash por senha, memoizado.
 *
 * A suite de integracao cria um usuario por teste, e bcrypt a custo 12 leva
 * ~300 ms por hash: 25 testes viravam 8 s so de hash, com a suite inteira
 * abovejando no bcrypt.
 *
 * A solucao NAO e baixar `BCRYPT_COST` para 4 nos testes. `src/lib/env.ts`
 * exige minimo 10, e essa regra existe para que ninguem de deploying erre a
 * mao. Afrouxar o schema "so para teste" cria um caminho em que o valor baixo
 * passa a ser aceito em producao por engano — o teste passaria a validar uma
 * configuracao que nunca deve existir.
 *
 * E nao afrouxar o `min(10)` por um argumento de performance sem numero: sao
 * 8 s, nao 8 minutos, e o custo real de um banco de teste mal-indexado e
 * maior que isso.
 *
 * A alternativa escolhida e reaproveitar o HASH, nao a senha. Varios usuarios
 * de teste compartilhando a mesma string de hash e correto: o salt e interno
 * ao hash, e a comparacao continua sendo bcrypt de verdade. O que a suite
 * perde e a cobertura de "duas senhas iguais nao geram o mesmo hash", e essa
 * e garantida por teste unitario, que pode pagar o custo uma unica vez.
 */
const hashPorSenha = new Map<string, string>();

async function hashDeTeste(senha: string): Promise<string> {
  const existente = hashPorSenha.get(senha);
  if (existente) return existente;

  const hash = await hashPassword(senha);
  hashPorSenha.set(senha, hash);
  return hash;
}

/**
 * Hash em custo deliberadamente baixo, para o caminho de rehash.
 *
 * A logica de rehash compara o custo embutido no hash com `BCRYPT_COST`. Com
 * ambos em 12 (o normal) o caminho nunca dispara em teste — o que deixaria a
 * migracao de hash sem cobertura. Esta funcao existe para produzir um hash
 * legado de verdade e nao um hash falso: `verifyPassword` tem de aceitar a
 * senha, senao o teste passaria por um motivo errado.
 */
export async function createHashComCustoBaixo(senha: string, custo = 10): Promise<string> {
  return bcrypt.hash(senha, custo);
}

export interface UserOverrides {
  readonly email?: string;
  readonly name?: string;
  readonly status?: "ATIVO" | "INATIVO" | "BLOQUEADO" | "PENDENTE_ATIVACAO";
  readonly isPlatformAdmin?: boolean;
  readonly mustChangePassword?: boolean;
  readonly password?: string;
  readonly emailVerifiedAt?: Date | null;
}

export async function createUser(overrides: UserOverrides = {}) {
  const password = overrides.password ?? SENHA_PADRAO;
  return testDb().user.create({
    data: {
      email: overrides.email ?? `user-${unique()}@exemplo.com.br`,
      name: overrides.name ?? "Usuario de Teste",
      status: overrides.status ?? "ATIVO",
      isPlatformAdmin: overrides.isPlatformAdmin ?? false,
      mustChangePassword: overrides.mustChangePassword ?? false,
      emailVerifiedAt: overrides.emailVerifiedAt ?? new Date("2024-01-01T00:00:00Z"),
      // Hash real de bcrypt, e nao um placeholder: `authenticateSession`
      // compara de verdade, e um hash falso transformaria o teste de senha em
      // tautologia.
      passwordHash: await hashDeTeste(password),
    },
  });
}

/**
 * Plano de teste.
 *
 * `Tenant.planId` e `NOT NULL` com `onDelete: Restrict`: uma empresa sem plano
 * nao existe. Isso e deliberado — o preco e sempre lido do plano, nunca
 * fixado no codigo.
 *
 * NAO e memoizado entre chamadas, apesar de parecer candidato obvio a cache.
 * O motivo e o `TRUNCATE` de `afterEach`: um `planId` guardado em memoria
 * sobrevive ao arquivo, e o `findUniqueOrThrow` seguinte estoura com P2025
 * numa linha que nao tem nada a ver com planos. Como o plano tem uma linha
 * unica e o custo e desprezivel, o cache aqui so economizaria o mesmo
 * trabalho que ele proprio quebra.
 */
export async function createPlan(code = "TESTE") {
  return testDb().plan.create({
    data: {
      code: `${code}-${unique()}`,
      name: "Plano de Teste",
      description: "Plano criado pela suite de integracao. Nao usar fora dela.",
      priceCents: 0,
      features: ["vendas", "estoque"],
      maxUsers: 5,
      active: true,
    },
  });
}

export async function createTenant(name = "Empresa de Teste") {
  const plan = await createPlan();
  return testDb().tenant.create({
    data: {
      name,
      slug: `empresa-${unique()}`,
      planId: plan.id,
    },
  });
}

/**
 * CNPJ valido e unico.
 *
 * `@@unique([tenantId, cnpj])` em `companies` e em `branches`: dois
 * `createBranch()` seguidos com CNPJ fixo colidiriam. Como o CNPJ aqui e
 * apenas identificador de teste (nenhum provedor fiscal e chamado), o
 * formato importa so para satisfazer o `VarChar(18)`.
 */
function cnpj(): string {
  counter += 1;
  return `${counter.toString().padStart(8, "0")}00000195`;
}

export async function createCompany(tenantId: string, name = "Empresa LTDA") {
  return testDb().company.create({
    data: { tenantId, name, cnpj: cnpj(), isHeadquarters: true },
  });
}

export async function createBranch(tenantId: string, companyId: string, name = "Filial Central") {
  return testDb().branch.create({
    data: {
      tenantId,
      companyId,
      name,
      code: `F${unique().slice(-5).toUpperCase()}`,
      cnpj: cnpj(),
    },
  });
}

export async function createMembership(tenantId: string, userId: string, owner = false) {
  return testDb().membership.create({
    data: { tenantId, userId, isOwner: owner, active: true },
  });
}

/**
 * Empresa completa: tenant + company + filial.
 *
 * Existe porque `createTenant` sozinho nao serve para testar acesso por filial,
 * e montar a cadeia em cada teste repetiria a mesma ordem de create. As
 * permissoes de `Branch` exigem `companyId`, e `Company` exige `tenantId` — a
 * ordem nao e livre.
 */
export async function createTenantWithBranch() {
  const tenant = await createTenant();
  const company = await createCompany(tenant.id);
  const branch = await createBranch(tenant.id, company.id);
  return { tenant, company, branch };
}

/**
 * Assinatura com os modulos contratados.
 *
 * Existe porque o gate de plano do RBAC consulta a `Subscription`, nao o espelho
 * `Tenant.subscriptionStatus`: o preco e congelado na assinatura, e e ela a
 * fonte da verdade. Um tenant de teste SEM assinatura e, para o RBAC, um tenant
 * que nao contratou nada — e o teste precisa criar a assinatura explicitamente
 * para nao estar medindo o caso errado.
 *
 * Os modulos vao em `PlanModule` (o contrato) e nao em flags do tenant, porque
 * e no plano que o upgrade acontece.
 */
export async function createSubscription(
  tenantId: string,
  modulos: readonly PlanModuleKey[] = [],
  status: SubscriptionStatus = "ATIVA",
) {
  const tenant = await testDb().tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { planId: true },
  });

  // `PlanModule` tem PK composta `[planId, module]`, entao um modulo repetido
  // estouraria P2002. Deduplica aqui para o chamador poder passar a lista que
  // quiser sem se preocupar.
  const unicos = [...new Set(modulos)];

  await testDb().planModule.createMany({
    data: unicos.map((module) => ({ planId: tenant.planId, module })),
  });

  return testDb().subscription.create({
    data: {
      tenantId,
      planId: tenant.planId,
      status,
      startedAt: new Date("2024-01-01T00:00:00Z"),
      currentPeriodStart: new Date("2024-01-01T00:00:00Z"),
      currentPeriodEnd: new Date("2025-01-01T00:00:00Z"),
    },
  });
}

/** Opcoes de `createRole`. */
export interface RoleOverrides {
  readonly tenantId?: string | null;
  readonly slug?: string;
  readonly scope?: "PLATFORM" | "TENANT" | "SYSTEM";
  readonly active?: boolean;
  readonly deletedAt?: Date | null;
  readonly isSystem?: boolean;
}

/** Uma concessão: recurso, módulo e as ações que ESTE perfil recebe. */
export interface PermissaoSpec {
  readonly key: string;
  readonly module: string;
  /** Ações concedidas por este perfil. Subconjunto de `availableActions`. */
  readonly actions: readonly string[];
  /**
   * Catálogo de ações do recurso. Padrao: as sete canônicas.
   *
   * Existe para o teste conseguir montar um recurso que NAO suporta uma ação
   * (ex.: `availableActions: ["read"]` para algo sem approve) e comprovar que a
   * concessão de uma ação fora do catálogo é recusada.
   */
  readonly availableActions?: readonly string[];
}

/**
 * Perfil, com as concessões que ele concede.
 *
 * `availableActions` e `actions` são coisas diferentes e a separação é o que dá
 * granularidade ao RBAC: a primeira é o catálogo do recurso (global, uma linha
 * por recurso em toda a plataforma) e a segunda é o que este perfil recebe. Dois
 * perfis sobre `VENDAS.venda` podem receber conjuntos diferentes — se as ações
 * estivessem só na permissão, ambos herdariam exatamente o mesmo poder.
 */
export async function createRole(
  permissoes: readonly PermissaoSpec[],
  options: RoleOverrides = {},
) {
  const role = await testDb().role.create({
    data: {
      tenantId: options.tenantId ?? null,
      name: options.slug ?? `Perfil ${unique()}`,
      slug: options.slug ?? `perfil-${unique()}`,
      scope: options.scope ?? "TENANT",
      active: options.active ?? true,
      isSystem: options.isSystem ?? false,
      deletedAt: options.deletedAt ?? null,
    },
  });

  for (const p of permissoes) {
    const catalogo = p.availableActions ?? ACOES;

    // Subconjunto inválido é erro de DADO do teste, e falhar aqui é melhor que
    // criar uma concessão que o banco aceita e o produto jamais deveria ter
    // criado: a gravação de perfil tem de recusar ação fora do catálogo, e o
    // teste que fiscaliza essa regra precisa de um caminho que a produza.
    for (const acao of p.actions) {
      if (!catalogo.includes(acao)) {
        throw new Error(
          `createRole: "${p.key}" concede "${acao}", que nao esta em availableActions [${catalogo.join(", ")}]`,
        );
      }
    }

    // `key` é `@unique` global: o mesmo recurso em vários perfis aponta para a
    // MESMA linha de `Permission`, e o que difere é o vínculo. Por isso o
    // `upsert` só cria — o `update` do catálogo viraria uma corrida entre testes
    // que usam o mesmo recurso com catálogos diferentes, e o último a escrever
    // determinaria o resultado do primeiro.
    const permissao = await testDb().permission.upsert({
      where: { key: p.key },
      create: {
        key: p.key,
        module: p.module,
        label: p.key,
        group: p.module,
        availableActions: [...catalogo],
      },
      update: {},
    });

    await testDb().rolePermission.create({
      data: { roleId: role.id, permissionId: permissao.id, actions: [...p.actions] },
    });
  }

  return role;
}

/** Liga um perfil a uma membership. */
export async function attachRole(membershipId: string, roleId: string) {
  return testDb().membershipRole.create({ data: { membershipId, roleId } });
}

/**
 * Cenario de estoque: tenant, filial, unidade, categoria e produtos.
 *
 * A cadeia e longa e a ordem e livre de escolha — `Product` exige `unitId`, que
 * exige `tenantId`; `StockItem` exige os tres. Montar isso em cada teste
 * repetiria a ordem, e um erro de ordem se parece com bug de logica: o
 * `create` falha e o teste aponta a linha errada.
 */
export interface CenarioEstoque {
  readonly tenant: { id: string };
  readonly branch: { id: string };
  readonly produtos: {
    /** MERCADORIA com saldo. */
    readonly mercadoria: { id: string };
    /** Segunda mercadoria, para testar travamento em ordem. */
    readonly outraMercadoria: { id: string };
    /** `type: SERVICO` em `Product`: item de NFS-e, sem saldo. */
    readonly servicoNfs: { id: string };
  };
  /** `Service` do catalogo de servicos: TABELA SEPARADA de `Product`. */
  readonly servicos: {
    readonly instalacao: { id: string };
  };
}

export async function createCenarioEstoque(): Promise<CenarioEstoque> {
  const { tenant, branch } = await createTenantWithBranch();

  const unidade = await testDb().unit.create({
    data: { tenantId: tenant.id, name: "UN" },
  });
  const categoria = await testDb().category.create({
    data: { tenantId: tenant.id, name: "Geral" },
  });

  const criarProduto = (nome: string, sku: string, type: "MERCADORIA" | "SERVICO" = "MERCADORIA") =>
    testDb().product.create({
      data: {
        tenantId: tenant.id,
        unitId: unidade.id,
        categoryId: categoria.id,
        type,
        sku,
        name: nome,
        unitPrice: 10,
        active: true,
      },
    });

  const [mercadoria, outraMercadoria, servicoNfs] = await Promise.all([
    criarProduto("Teclado", "TEC-001"),
    criarProduto("Mouse", "MOU-001"),
    criarProduto("Consultoria NFS-e", "SRV-001", "SERVICO"),
  ]);

  // `Service` NAO e um `Product` com `type: SERVICO`. Sao dois modelos, duas
  // tabelas e duas FKs em `SaleItem`. A fabricada existe para provar isso.
  const servicoInstalacao = await testDb().service.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      unitId: unidade.id,
      categoryId: categoria.id,
      code: "SRV-001",
      name: "Instalacao",
      unitPrice: 150,
      active: true,
    },
  });

  return {
    tenant,
    branch,
    produtos: { mercadoria, outraMercadoria, servicoNfs },
    servicos: { instalacao: servicoInstalacao },
  };
}

/**
 * Linha de estoque com saldo e custo medio.
 *
 * `averageCost` e `totalValue` sao passados separados porque e a unica forma de
 * montar um saldo que o `movimento.ts` nao produziria sozinho: um saldo com
 * media e valor total coerentes vem de uma compra, e o teste precisa de um saldo
 * inicial antes de qualquer compra existir.
 */
export async function createStockItem(
  tenantId: string,
  branchId: string,
  productId: string,
  opcoes: { readonly quantity?: string; readonly reserved?: string; readonly averageCost?: string } = {},
) {
  const quantity = opcoes.quantity ?? "10";
  const averageCost = opcoes.averageCost ?? "5";
  return testDb().stockItem.create({
    data: {
      tenantId,
      branchId,
      productId,
      quantity,
      reservedQuantity: opcoes.reserved ?? "0",
      averageCost,
      totalValue: Number(quantity) * Number(averageCost),
    },
  });
}

/** Item de rascunho: um de `productId`/`serviceId`, exatamente como `SaleItem`. */
export interface ItemSaleRascunho {
  readonly productId?: string | null;
  readonly serviceId?: string | null;
  readonly description?: string;
  readonly quantity: string;
  readonly unitPrice: string;
}

/** Opcoes do rascunho: o que a tela tambem grava no cabecalho. */
export interface OpcoesSaleRascunho {
  readonly paymentTermsId?: string | null;
  readonly paymentMethodId?: string | null;
  readonly customerId?: string | null;
  readonly status?: "RASCUNHO" | "PENDENTE";
  readonly soldAt?: Date | null;
}

/** Venda em rascunho, com o numero que a baixa usa no documento. */
export async function createSaleRascunho(
  tenantId: string,
  branchId: string,
  numero: string,
  itens: readonly ItemSaleRascunho[],
  opcoes: OpcoesSaleRascunho = {},
) {
  return testDb().sale.create({
    data: {
      tenantId,
      branchId,
      number: numero,
      status: opcoes.status ?? "RASCUNHO",
      type: "BALCAO",
      channel: "BALCAO",
      paymentTermsId: opcoes.paymentTermsId ?? null,
      paymentMethodId: opcoes.paymentMethodId ?? null,
      customerId: opcoes.customerId ?? null,
      soldAt: opcoes.soldAt ?? null,
      subtotal: itens.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0),
      total: itens.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0),
      items: {
        create: itens.map((item, indice) => ({
          tenantId,
          productId: item.productId ?? null,
          serviceId: item.serviceId ?? null,
          description: item.description ?? "Item de teste",
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: Number(item.quantity) * Number(item.unitPrice),
          sortOrder: indice,
        })),
      },
    },
  });
}

/**
 * Condicao de pagamento para os testes de financeiro.
 *
 * O teste precisa de um termo com desconto a vista de verdade (o bug que
 * somava o desconto as parcelas) e de um parcelado para o recebimento parcial,
 * entao a fabrica aceita so os campos que esses dois casos usam.
 */
export async function createPaymentTerms(
  tenantId: string,
  opcoes: {
    readonly branchId?: string | null;
    readonly type?: "A_VISTA" | "DIAS" | "DIAS_RECEBIMENTO" | "DIA_FIXO" | "PARCELADO" | "CUSTOM";
    readonly installmentCount?: number;
    readonly intervalDays?: number;
    readonly cashDiscountCents?: number;
    readonly name?: string;
  } = {},
) {
  return testDb().paymentTerms.create({
    data: {
      tenantId,
      branchId: opcoes.branchId ?? null,
      name: opcoes.name ?? "Condicao de Teste",
      type: opcoes.type ?? "A_VISTA",
      installmentCount: opcoes.installmentCount ?? 1,
      intervalDays: opcoes.intervalDays ?? 0,
      cashDiscountCents: opcoes.cashDiscountCents ?? 0,
      active: true,
    },
  });
}

/** Forma de pagamento, para o recebimento imediato da confirmacao. */
export async function createPaymentMethod(
  tenantId: string,
  opcoes: {
    readonly branchId?: string | null;
    readonly type?: "DINHEIRO" | "PIX" | "CARTAO_DEBITO" | "CARTAO_CREDITO" | "BOLETO" | "TRANSFERENCIA" | "CHEQUE" | "CREDITO_PROPRIO" | "OUTRO";
    readonly name?: string;
  } = {},
) {
  return testDb().paymentMethod.create({
    data: {
      tenantId,
      branchId: opcoes.branchId ?? null,
      code: `M${unique().slice(-5).toUpperCase()}`,
      name: opcoes.name ?? "Dinheiro",
      type: opcoes.type ?? "DINHEIRO",
    },
  });
}
