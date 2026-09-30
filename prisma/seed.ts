/**
 * Seed de desenvolvimento.
 *
 * Idempotente de proposito: rodar duas vezes tem de deixar o banco no mesmo
 * estado, e nao falhar na segunda. Isso nao e vaidade — e o que permite usar
 * `npm run db:seed` como comando de reparo ("o cadastro de permissao sumiu, roda
 * o seed de novo") sem medo de duplicar linha nem precisar de `db:reset`, que
 * levaria junto os dados que odeveloper acabou de digitar.
 *
 * A ordem das etapas e uma dependencia real, nao uma preferencia de leitura:
 *
 *   1. permissoes   -> o catalogo precisa existir antes de qualquer concessao
 *   2. plano        -> o gate de plano cruza `Permission.module` com `PlanModule`
 *   3. tenant       -> tudo abaixo pertence a um tenant
 *   4. empresa      -> `Branch.companyId` e obrigatorio
 *   5. filial       -> e a unica que o login exige (ver `escolher-filial`)
 *   6. usuario      -> o login exige conta `ATIVO`
 *   7. membership   -> liga usuario, empresa e perfis
 *   8. perfis       -> as concessoes, agora que as permissoes existem
 *   9. assinatura   -> sem ela o gate de plano reprova TUDO (fail-closed)
 *
 * POR QUE A ASSINATURA ESTA NO FIM E NAO DISPENSAVEL
 *
 * `resolverRbac` consulta `Subscription` pelo `tenantId` e, se ela nao existir,
 * trata como "nada contratado" — o que zera TODAS as permissoes do usuario
 * (`src/server/auth/rbac.ts`, `planoDoTenant`). E a decisao correta para
 * producao: quem nao tem contrato nao opera. Em desenvolvimento, porem, o
 * primeiro sintoma e "acontece de nao salvar", e a causa parece ser o formulario
 * e nao a assinatura. Por isso o seed garante a assinatura ATIVA.
 *
 * POR QUE AS PERMISSOES VEM DO CODIGO E NAO DO ARQUIVO
 *
 * A fonte unica e `src/lib/rbac/catalogo.ts`. O seed grava o que esta la
 * declarado, e a tela de perfis desenha o mesmo catalogo. Se os dois divergissem,
 * o sintoma seria um checkbox que o banco nao conhece, ou uma permissao que o
 * banco conhece e ninguem consegue conceder.
 */

import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  CATALOGO,
  chaveDefinicao,
  modulosDoCatalogo,
  type DefinicaoPermissao,
} from "../src/lib/rbac/catalogo";
import { definirPerfisPadrao, type PerfilPadrao } from "../src/lib/rbac/perfis-padrao";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Conta de desenvolvimento. A senha e de desenvolvimento, nunca de producao. */
const DEV = {
  email: "edilson9155@gmail.com",
  senha: "91550748",
  nome: "Edilson Marcio",
  tenantSlug: "marcio-sistemas",
  tenantNome: "Marcio Sistemas",
  /** CNPJ mascarado: `VarChar(18)` e exatamente o comprimento do CNPJ com mascara. */
  cnpj: "00.000.000/0001-91",
} as const;

async function sincronizarPermissoes(): Promise<Map<string, string>> {
  console.log("1/9 Sincronizando catalogo de permissoes...");

  // `upsert` e nao `createMany`: o `update` mantem o rotulo, o grupo e as acoes
  // disponiveis em sincronia com o catalogo. Sem isso, corrigir um rotulo typo
  // no codigo exigiria um UPDATE manual no banco, e a proxima maquina de
  // desenvolvimento continuaria vendo o texto velho.
  const porChave = new Map<string, string>();
  for (const definicao of CATALOGO) {
    const dados = {
      module: definicao.modulo,
      label: definicao.label,
      description: `${definicao.label} (${definicao.recurso})`,
      group: definicao.grupo,
      availableActions: [...definicao.acoes],
      platformOnly: definicao.platformOnly ?? false,
    };
    const linha = await prisma.permission.upsert({
      where: { key: chaveDefinicao(definicao) },
      update: dados,
      create: { key: chaveDefinicao(definicao), ...dados },
      select: { id: true },
    });
    porChave.set(chaveDefinicao(definicao), linha.id);
  }

  console.log(`     ${porChave.size} permissoes no catalogo.`);
  return porChave;
}

async function garantirPlano() {
  console.log("2/9 Garantindo plano com todos os modulos...");

  const modulos = modulosDoCatalogo();

  const plano = await prisma.plan.upsert({
    where: { code: "admin-unlimited" },
    update: {},
    create: {
      code: "admin-unlimited",
      name: "Admin Ilimitado",
      description: "Plano ilimitado para super admin",
      priceCents: 0,
      annualPriceCents: 0,
      currency: "BRL",
      billingPeriod: "MENSAL",
      trialDays: 0,
      maxUsers: 0,
      maxProducts: 0,
      maxCustomers: 0,
      maxSuppliers: 0,
      maxBranches: 0,
      maxInvoicesPerMonth: 0,
      maxSalesPerMonth: 0,
      maxStorageMb: 0,
      features: ["*"],
      sortOrder: 0,
      highlight: true,
      active: true,
    },
    select: { id: true, code: true },
  });

  // `PlanModule` tem PK composta (planId, module), entao `skipDuplicates` e o
  // caminho curto para "assegurar que existe" sem ler antes de gravar.
  await prisma.planModule.createMany({
    data: modulos.map((module) => ({ planId: plano.id, module })),
    skipDuplicates: true,
  });

  console.log(`     ${modulos.length} modulos contratados.`);
  return plano;
}

async function garantirTenant(planId: string) {
  console.log("3/9 Garantindo tenant...");

  // Busca por `slug` e nao por nome: o slug e a chave estavel do tenant, e o
  // nome muda ("Marcio Sistemas" -> "Marcio Sistemas ME") sem que o tenant
  // deixe de ser o mesmo.
  const existente = await prisma.tenant.findFirst({
    where: { slug: DEV.tenantSlug },
    select: { id: true, name: true },
  });
  if (existente) {
    console.log(`     Tenant ja existe: ${existente.name}`);
    return existente;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: DEV.tenantNome,
      slug: DEV.tenantSlug,
      status: "ATIVA",
      // `#222473` e um indigo escuro: contraste suficiente para o texto branco
      // do logo sobre ele. A primeira versao gravava `#2224731`, com sete
      // caracteres — nao e uma cor valida, e qualquer tela que fosse validar o
      // hex antes de aplicar rejeitaria a configuracao do tenant.
      primaryColor: "#222473",
      planId,
      subscriptionStatus: "ATIVA",
    },
    select: { id: true, name: true },
  });

  console.log(`     Tenant criado: ${tenant.name}`);
  return tenant;
}

async function garantirEmpresa(tenantId: string) {
  console.log("4/9 Garantindo empresa matriz...");

  const existente = await prisma.company.findFirst({
    where: { tenantId },
    select: { id: true, name: true },
  });
  if (existente) {
    console.log(`     Empresa ja existe: ${existente.name}`);
    return existente;
  }

  // Uma so empresa por tenant no seed. `Company` e a razao social que emite
  // documento fiscal; `Branch` e o ponto operacional. Um grupo economico com
  // varias razoes sociais e um caso real, porem nao e o que o ambiente de
  // desenvolvimento precisa para validar o fluxo.
  const company = await prisma.company.create({
    data: {
      tenantId,
      isHeadquarters: true,
      name: `${DEV.tenantNome} LTDA`,
      tradeName: DEV.tenantNome,
      cnpj: DEV.cnpj,
      taxRegime: "SIMPLES_NACIONAL",
    },
    select: { id: true, name: true },
  });

  console.log(`     Empresa criada: ${company.name}`);
  return company;
}

async function garantirFilial(tenantId: string, companyId: string) {
  console.log("5/9 Garantindo filial matriz...");

  // `Branch.companyId` e `Branch.cnpj` sao OBRIGATORIOS no schema. A primeira
  // versao do seed criava a filial sem os dois, e o resultado era um erro de
  // constraint que so aparecia depois que o usuario ja tinha feito login — a
  // tela `escolher-filial` virava um 500 em vez de uma lista vazia.
  const existente = await prisma.branch.findFirst({
    where: { tenantId, code: "001" },
    select: { id: true, name: true },
  });
  if (existente) {
    console.log(`     Filial ja existe: ${existente.name}`);
    return existente;
  }

  const filial = await prisma.branch.create({
    data: {
      tenantId,
      companyId,
      name: "Matriz",
      code: "001",
      isHeadquarters: true,
      cnpj: DEV.cnpj,
      active: true,
    },
    select: { id: true, name: true },
  });

  console.log(`     Filial criada: ${filial.name}`);
  return filial;
}

async function garantirUsuario() {
  console.log("6/9 Garantindo usuario...");

  const existente = await prisma.user.findUnique({
    where: { email: DEV.email },
    select: { id: true, name: true },
  });
  if (existente) {
    console.log(`     Usuario ja existe: ${existente.name}`);
    return existente;
  }

  const usuario = await prisma.user.create({
    data: {
      email: DEV.email,
      // Custo 12, o mesmo do resto do projeto (`src/lib/auth/password.ts`).
      passwordHash: await bcrypt.hash(DEV.senha, 12),
      name: DEV.nome,
      status: "ATIVO",
      emailVerifiedAt: new Date(),
      isPlatformAdmin: true,
      mustChangePassword: false,
    },
    select: { id: true, name: true },
  });

  console.log(`     Usuario criado: ${usuario.name}`);
  return usuario;
}

async function garantirMembership(userId: string, tenantId: string) {
  console.log("7/9 Garantizando vinculo usuario <-> empresa...");

  const existente = await prisma.membership.findFirst({
    where: { userId, tenantId },
    select: { id: true, isOwner: true },
  });
  if (existente) {
    console.log(`     Vinculo ja existe: ${existente.id}`);
    return existente;
  }

  const membership = await prisma.membership.create({
    data: { userId, tenantId, isOwner: true, active: true },
    select: { id: true, isOwner: true },
  });

  console.log("     Vinculo criado (owner).");
  return membership;
}

/**
 * Cria os perfis padrao e concede as acoes de cada um.
 *
 * O perfil e global (`tenantId: null`) pelo mesmo motivo do "Operador" descrito
 * em `resolverRbac`: e a definicao de um cargo, nao de uma empresa. Se cada
 * tenant criasse os seus, dois clientes com a mesma operacao teriam perfis
 * divergentes, e o suporte perderia a capacidad de dizer "o vendedor padrao
 * nao pode cancelar venda".
 */
async function garantirPerfis(
  permissoes: Map<string, string>,
  membershipId: string,
): Promise<void> {
  console.log("8/9 Garantindo perfis padrao e concessoes...");

  for (const perfil of definirPerfisPadrao()) {
    const role = await upsertPerfil(perfil);
    await conceder(role.id, permissoes, perfil);
    await vincular(membershipId, role.id);
    console.log(`     ${perfil.nome}: ${perfil.concessoes.length} recursos`);
  }
}

/**
 * Cria ou atualiza um perfil global.
 *
 * Nao da para usar `upsert` com `where: { tenantId_slug: { tenantId: null, ... } }`:
 * `Role.tenantId` e nullable e o Prisma 7 recusa `null` dentro de uma chave
 * composta no `where` ("Argument `tenantId` must not be null"). E um limite do
 * cliente, nao do schema — `@@unique([tenantId, slug])` aceita a linha, so nao
 * aceita ser addressada por `upsert`.
 *
 * A alternativa — tornar `Role.tenantId` nao-null e modelar perfil global com um
 * tenant sentinela — foi rejeitada: perfil global e um conceito real deste
 * produto (o mesmo cargo em varias empresas), e o preco de transforma-lo em
 * "tenant sentinela" e maior: um tenant passaria a ler perfis de outro. Um
 * `findFirst` a mais no seed e um preco melhor.
 */
async function upsertPerfil(perfil: PerfilPadrao) {
  const existente = await prisma.role.findFirst({
    where: { tenantId: null, slug: perfil.slug },
    select: { id: true },
  });

  if (existente) {
    await prisma.role.update({
      where: { id: existente.id },
      data: { name: perfil.nome, description: perfil.descricao, active: true },
    });
    return existente;
  }

  return prisma.role.create({
    data: {
      tenantId: null,
      slug: perfil.slug,
      name: perfil.nome,
      description: perfil.descricao,
      scope: "TENANT",
      isSystem: true,
      active: true,
    },
    select: { id: true },
  });
}

/**
 * Concede o subconjunto de acoes do perfil.
 *
 * Duas concessoes distintas por perfil, e a distincao e o ponto: o perfil
 * "Vendedor" recebe `VENDAS.venda` com `["create", "read", "cancel"]` e nunca
 * com `update` nem `delete`. Conceder tudo e o que faz um ERP virar um sistema
 * sem governanca — e o granularity por perfil e a razao de `actions` estar no
 * vinculo e nao na permissao (ver ADR 0004).
 */
async function conceder(
  roleId: string,
  permissoes: Map<string, string>,
  perfil: PerfilPadrao,
): Promise<void> {
  for (const concessao of perfil.concessoes) {
    const definicao: DefinicaoPermissao | undefined = CATALOGO.find(
      (candidata) =>
        candidata.modulo === concessao.modulo && candidata.recurso === concessao.recurso,
    );
    if (!definicao) {
      // Chave de concessao que o catalogo nao conhece e bug de codigo: o perfil
      // pediria acesso a algo que nao existe. Falhar aqui, no seed, e melhor do
      // que criar um perfil que "nao concede nada" e so falha quando alguem usa.
      throw new Error(
        `Perfil "${perfil.slug}" concede ${concessao.modulo}.${concessao.recurso}, ` +
          `que nao existe no catalogo de permissoes.`,
      );
    }

    const acoesInvalidas = concessao.acoes.filter(
      (acao) => !definicao.acoes.includes(acao),
    );
    if (acoesInvalidas.length > 0) {
      throw new Error(
        `Perfil "${perfil.slug}" concede acao invalida em ` +
          `${concessao.modulo}.${concessao.recurso}: ${acoesInvalidas.join(", ")}. ` +
          `Suportadas: ${definicao.acoes.join(", ")}.`,
      );
    }

    const permissionId = permissoes.get(chaveDefinicao(definicao));
    if (!permissionId) continue;

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: { actions: [...concessao.acoes] },
      create: { roleId, permissionId, actions: [...concessao.acoes] },
    });
  }
}

async function vincular(membershipId: string, roleId: string): Promise<void> {
  // `MembershipRole` tem PK composta; `skipDuplicates` mantem o seed
  // idempotente sem ler antes de gravar.
  await prisma.membershipRole.createMany({
    data: [{ membershipId, roleId }],
    skipDuplicates: true,
  });
}

async function garantirAssinatura(tenantId: string, planId: string) {
  console.log("9/9 Garantindo assinatura...");

  const assinatura = await prisma.subscription.upsert({
    where: { tenantId },
    update: { status: "ATIVA", planId },
    create: {
      tenantId,
      planId,
      status: "ATIVA",
      startedAt: new Date(),
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      priceCents: 0,
      currency: "BRL",
      billingPeriod: "MENSAL",
    },
    select: { id: true, status: true },
  });

  console.log(`     Assinatura ${assinatura.status}.`);
}

async function main() {
  console.log("Seed de desenvolvimento\n");

  const permissoes = await sincronizarPermissoes();
  const plano = await garantirPlano();
  const tenant = await garantirTenant(plano.id);
  const company = await garantirEmpresa(tenant.id);
  await garantirFilial(tenant.id, company.id);
  const usuario = await garantirUsuario();
  const membership = await garantirMembership(usuario.id, tenant.id);
  await garantirPerfis(permissoes, membership.id);
  await garantirAssinatura(tenant.id, plano.id);

  console.log("\nSeed concluido.");
  console.log(`Email:  ${DEV.email}`);
  console.log(`Senha:  ${DEV.senha}`);
  console.log(`Empresa: ${tenant.name}`);
  console.log("Super admin: SIM");
}

main()
  .then(() => prisma.$disconnect())
  .catch((erro: unknown) => {
    console.error("Erro no seed:", erro);
    process.exit(1);
  });
