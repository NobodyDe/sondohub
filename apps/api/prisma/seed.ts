import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import type { UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const masterEmail = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_PASSWORD;
if (!masterEmail || !password) throw new Error('Defina SEED_ADMIN_EMAIL e SEED_PASSWORD no .env');

const passwordHash = await argon2.hash(password);

type Level = { level: number; label: string };

// upsert = "cria se não existir": o seed pode rodar várias vezes sem duplicar nada.
function upsertUser(email: string, name: string, role: UserRole) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash },
  });
}

// O origin é a identidade do app no hub (CORS e emissão do token), por isso sai da mesma URL.
function upsertApp(slug: string, name: string, url: string, levels: Level[]) {
  return prisma.application.upsert({
    where: { slug },
    update: {},
    create: { slug, name, url, origin: url, iconUrl: `${url}/favicon.svg`, levels },
  });
}

function grantAccess(userId: string, applicationId: string, level: number) {
  return prisma.userAppAccess.upsert({
    where: { userId_applicationId: { userId, applicationId } },
    update: { level },
    create: { userId, applicationId, level },
  });
}

const demo = await upsertApp('demo', 'App Demo', `http://localhost:${process.env.DEMO_PORT}`, [
  { level: 1, label: 'Leitura' },
  { level: 2, label: 'Edição' },
  { level: 3, label: 'Admin' },
]);

const gemeo = await upsertApp('gemeo', 'Gêmeo Digital', 'http://localhost:5173', [
  { level: 1, label: 'Leitura' },
  { level: 2, label: 'Gestor' },
]);

const master = await upsertUser(masterEmail, 'Master', 'MASTER');
const reader = await upsertUser('leitor@sondotecnica.com.br', 'Leitor', 'USER');

await grantAccess(master.id, demo.id, 3);
await grantAccess(master.id, gemeo.id, 2);
await grantAccess(reader.id, demo.id, 1);

console.log(`Seed ok: ${masterEmail} (Master) com acesso ao demo e ao gêmeo; leitor só no demo`);
await prisma.$disconnect();
