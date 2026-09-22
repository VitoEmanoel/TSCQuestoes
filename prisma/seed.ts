import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

const TOPICS: Array<{ name: string; category: string }> = [
  { name: "Formação Geral", category: "Formação Geral" },
  { name: "Engenharia de Software", category: "Componente Específico" },
  { name: "Banco de Dados", category: "Componente Específico" },
  { name: "Estrutura de Dados e Algoritmos", category: "Componente Específico" },
  { name: "Programação", category: "Componente Específico" },
  { name: "Redes de Computadores", category: "Componente Específico" },
  { name: "Sistemas Operacionais", category: "Componente Específico" },
  { name: "Matemática e Lógica", category: "Componente Específico" },
  { name: "Governança e Gestão de TI", category: "Componente Específico" },
  { name: "Qualidade de Software", category: "Componente Específico" },
];

async function main() {
  for (const topic of TOPICS) {
    await prisma.topic.upsert({
      where: { name: topic.name },
      update: {},
      create: topic,
    });
  }

  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? "admin@tscquestoes.local";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "admin123";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Administrador",
      role: "ADMIN",
      passwordHash,
    },
  });

  console.log(`Seed concluído. Admin: ${adminEmail} / ${adminPassword}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
