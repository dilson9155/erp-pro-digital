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
import { hashPassword } from "@/lib/auth/password";

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
