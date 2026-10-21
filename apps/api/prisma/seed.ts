import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import type { UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const password = process.env.SEED_PASSWORD;
if (!password) throw new Error('Defina SEED_PASSWORD no .env');

const demoUrl = `http://localhost:${process.env.DEMO_PORT}`;
const passwordHash = await argon2.hash(password);

// upsert = "cria se não existir": o seed pode rodar várias vezes sem duplicar nada.
function upsertUser(email: string, name: string, role: UserRole) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash },
  });
}

function grantAccess(userId: string, applicationId: string, level: number) {
  return prisma.userAppAccess.upsert({
    where: { userId_applicationId: { userId, applicationId } },
    update: { level },
    create: { userId, applicationId, level },
  });
}

const demo = await prisma.application.upsert({
  where: { slug: 'demo' },
  update: {},
  create: {
    slug: 'demo',
    name: 'App Demo',
    url: demoUrl,
    origin: demoUrl,
    iconUrl: `${demoUrl}/favicon.svg`,
    levels: [
      { level: 1, label: 'Leitura' },
      { level: 2, label: 'Edição' },
      { level: 3, label: 'Admin' },
    ],
  },
});

const admin = await upsertUser(
  process.env.SEED_ADMIN_EMAIL ?? 'admin@sondotecnica.com.br',
  'Administrador',
  'MASTER',
);
const reader = await upsertUser('leitor@sondotecnica.com.br', 'Leitor', 'USER');

await grantAccess(admin.id, demo.id, 3);
await grantAccess(reader.id, demo.id, 1);

console.log('Seed ok: admin (nível 3) e leitor (nível 1) no app demo');
await prisma.$disconnect();
