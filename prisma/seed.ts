import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Iniciando seed do super admin...");

  const email = "edilson9155@gmail.com";
  const password = "91550748";
  const name = "Edilson Marcio";

  // Verifica se já existe
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("⚠️  Usuário já existe, pulando criação.");
    return;
  }

  // Hash da senha (cost 12 = padrão do projeto)
  const passwordHash = await bcrypt.hash(password, 12);

  // Cria plano básico (gratuito/ilimitado para o admin)
  const plan = await prisma.plan.upsert({
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
  });
  console.log("✅ Plano criado:", plan.code);

  // Cria tenant (empresa)
  const tenant = await prisma.tenant.create({
    data: {
      name: "Marcio Sistemas",
      slug: "marcio-sistemas",
      status: "ATIVA",
      primaryColor: "#2224731",
      planId: plan.id,
      subscriptionStatus: "ATIVA",
    },
  });
  console.log("✅ Tenant criado:", tenant.name);

  // Cria usuário super admin
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      status: "ATIVO",
      emailVerifiedAt: new Date(),
      isPlatformAdmin: true, // SUPER ADMIN
      mustChangePassword: false,
    },
  });
  console.log("✅ Usuário super admin criado:", user.email);

  // Cria membership como dono
  const membership = await prisma.membership.create({
    data: {
      userId: user.id,
      tenantId: tenant.id,
      isOwner: true,
      active: true,
    },
  });
  console.log("✅ Membership criada (owner):", membership.id);

  // Cria role de sistema (opcional - para RBAC)
  const systemRole = await prisma.role.upsert({
    where: {
      tenantId_slug: {
        tenantId: null,
        slug: "super-admin",
      },
    },
    update: {},
    create: {
      tenantId: null,
      slug: "super-admin",
      name: "Super Admin do Sistema",
      description: "Acesso total à plataforma (super admin cross-tenant)",
      isSystem: true,
      active: true,
    },
  });
  console.log("✅ Role de sistema criada:", systemRole.id);

  // Vincula role ao membership
  await prisma.membershipRole.create({
    data: {
      membershipId: membership.id,
      roleId: systemRole.id,
    },
  });
  console.log("✅ Role vinculada ao membership");

  console.log("\n🎉 Seed concluído com sucesso!");
  console.log("📧 Email:", email);
  console.log("🔑 Senha:", password);
  console.log("🏢 Tenant:", tenant.name);
  console.log("👑 Super Admin: SIM");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });