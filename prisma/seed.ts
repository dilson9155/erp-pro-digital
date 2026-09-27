import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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

  // Cria tenant (empresa)
  const tenant = await prisma.tenant.create({
    data: {
      name: "Marcio Sistemas",
      slug: "marcio-sistemas",
      status: "ATIVA",
      primaryColor: "#2224731",
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
    where: { key: "system.super_admin" },
    update: {},
    create: {
      key: "system.super_admin",
      name: "Super Admin do Sistema",
      description: "Acesso total à plataforma (super admin cross-tenant)",
      isSystem: true,
      tenantId: null,
      active: true,
    },
  });
  console.log("✅ Role de sistema criada:", systemRole.key);

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