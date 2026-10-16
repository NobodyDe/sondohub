import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// O .env é compartilhado na raiz do monorepo. Em produção as variáveis vêm do ambiente,
// então o arquivo pode não existir — por isso o existsSync.
const rootEnv = '../../.env';
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.ts' },
});
