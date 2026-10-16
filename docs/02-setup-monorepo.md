# 02 — Setup do monorepo

> **Objetivo:** chegar a um monorepo com hub (React + Tailwind), API (Nest + Prisma 6), app demo e 3 packages, tudo lendo **um único `.env`** e com portas que não conflitam.
>
> Todos os comandos foram testados em 15/10/2026 no Windows (Node 24.20, pnpm 12, Nest CLI 12, Vite 8 e Prisma 6.19).
> Rode no **PowerShell**, a partir da raiz do repositório, salvo quando o passo indicar outro lugar.

---

## 0. Pré-requisitos

```powershell
node -v      # v24.x (LTS)
pnpm -v      # qualquer versão: o projeto fixa a dele
git --version
docker --version
```

- **Docker Desktop precisa estar aberto** para subir o Postgres.
- **Use uma pasta de caminho curto.** O Windows limita caminhos a 260 caracteres, e caminhos longos quebram as ferramentas nativas.

> ⚠️ **Pegadinha do PowerShell:** argumentos que começam com `@` (`@sondohub/client`) são interpretados como *splatting*. Sempre coloque esses argumentos **entre aspas**: `"@sondohub/contracts@workspace:*"`.

---

## 1. Raiz do repositório

O repositório já existe no GitHub e já traz esta pasta `docs/`, então comece clonando:

```powershell
cd $HOME\Desktop\projects
git clone https://github.com/NobodyDe/sondohub.git
cd sondohub
pnpm init
```

> Se o git reclamar de identidade no primeiro commit, configure a sua uma vez:
> `git config --global user.name "Seu Nome"` e `git config --global user.email "seu-email"`.
> Para não expor o email pessoal, use o *noreply* do GitHub (Settings → Emails).

O `pnpm init` grava `packageManager` e `devEngines` com a versão atual do pnpm e `onFail: download`. Assim, quem clonar o repositório usa **a mesma versão do pnpm**: ele baixa sozinho, sem ninguém precisar atualizar nada.

Agora substitua o `package.json` da raiz por este. **Mantenha as versões que o seu `pnpm init` gerou** em `packageManager` e `devEngines`:

```json
{
  "name": "sondohub",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "pnpm --filter \"@sondohub/*\" build && pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down",
    "db:migrate": "pnpm --filter api exec prisma migrate dev",
    "db:seed": "pnpm --filter api exec prisma db seed",
    "db:studio": "pnpm --filter api exec prisma studio"
  },
  "packageManager": "pnpm@12.11.2",
  "devEngines": {
    "packageManager": { "name": "pnpm", "version": "12.11.2", "onFail": "download" }
  }
}
```

**Por que assim:**

- **`private: true`:** a raiz nunca é publicada no npm.
- **Sem dependências na raiz:** cada app declara as suas. O pnpm é estrito e não deixa um pacote usar dependência que não declarou, o que evita "funciona na minha máquina".
- **`dev`:** compila os packages antes de subir tudo em paralelo. Na primeira execução, a API precisa do `dist` do `contracts` já pronto.
- **`pnpm -r build`:** respeita a ordem de dependências (topológica), então os packages compilam antes dos apps que os usam. Por isso não precisamos de Turborepo ou Nx agora.

---

## 2. Workspace — `pnpm-workspace.yaml`

Crie na raiz:

```yaml
packages:
  - "apps/*"
  - "packages/*"

# O pnpm não roda scripts de instalação de dependências sem autorização (proteção de supply-chain).
# Estes precisam: o Prisma baixa os engines e o argon2 instala o binário nativo.
allowBuilds:
  "@prisma/client": true
  "@prisma/engines": true
  prisma: true
  argon2: true
```

> Sem o `allowBuilds`, o `pnpm add prisma` falha com **`ERR_PNPM_IGNORED_BUILDS`**. Se aparecer em outro pacote, rode `pnpm approve-builds <pacote>`: ele grava a entrada aqui.

---

## 3. `.gitignore`, `.env` compartilhado e `tsconfig` base

**`.gitignore`** (raiz):

```gitignore
node_modules
dist
coverage
.env
*.log
.DS_Store
```

**`.env.example`** (raiz). Este vai para o git e documenta todas as variáveis:

```dotenv
# ── Portas (cada processo tem a sua; o Vite usa strictPort e falha se estiver ocupada) ──
API_PORT=3100
HUB_PORT=5180
DEMO_PORT=5181
DEMO_API_PORT=4100
POSTGRES_PORT=5433

# ── URLs ──
HUB_URL=http://localhost:5180
# Só variáveis com prefixo VITE_ chegam ao navegador. NUNCA coloque segredo com VITE_.
VITE_HUB_URL=http://localhost:5180

# ── Banco (a porta precisa bater com POSTGRES_PORT) ──
DATABASE_URL=postgresql://sondohub:sondohub@localhost:5433/sondohub?schema=public

# ── Sessão (produção: __Host-sondohub_session e COOKIE_SECURE=true) ──
SESSION_COOKIE_NAME=sondohub_session
COOKIE_SECURE=false

# ── JWT (aula 06: gere com  pnpm --filter api exec node scripts/generate-jwt-key.ts) ──
JWT_KEY_ID=
JWT_PRIVATE_KEY=

# ── Seed (só dev): senha dos usuários de teste criados pelo seed ──
SEED_ADMIN_EMAIL=admin@sondotecnica.com.br
SEED_PASSWORD=troque-esta-senha
```

Depois crie o seu `.env` a partir dele. O `.env` **não** vai para o git:

```powershell
Copy-Item .env.example .env
```

**Quem lê o `.env` e como.** Repare que nenhum processo precisa de biblioteca extra:

| Quem | Como lê o `.env` da raiz |
|---|---|
| docker compose | Automático (o `.env` fica na mesma pasta do `docker-compose.yml`) |
| API (Nest) | `nest start --env-file ../../.env` (flag nativa do Nest CLI) |
| Prisma CLI | `process.loadEnvFile()` no `prisma.config.ts` (Node nativo) |
| Hub e demo (Vite) | `envDir` + `loadEnv` no `vite.config.ts` |
| API do demo | `node --env-file=../../.env` (Node nativo) |

**Por que as portas não são as padrão:** nesta máquina, **3000 e 5173 já estavam em uso**. Usar portas próprias e `strictPort: true` faz o Vite **falhar com erro claro** em vez de pular para outra porta em silêncio. Isso importa porque a porta faz parte do *origin* cadastrado no banco: se o Vite mudasse de porta sozinho, o CORS quebraria sem explicação.

**`tsconfig.base.json`** (raiz), usado pelos packages:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "declaration": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  }
}
```

---

## 4. Postgres — `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: sondohub
      POSTGRES_PASSWORD: sondohub
      POSTGRES_DB: sondohub
    ports:
      - "${POSTGRES_PORT}:5432"   # vem do .env: 5433 no seu PC, 5432 dentro do container
    volumes:
      - pgdata:/var/lib/postgresql   # no Postgres 18 o volume é a pasta-pai (mudou em relação ao 17)

volumes:
  pgdata:
```

Usuário e senha aqui são **só de desenvolvimento**. Por isso podem ficar fixos no arquivo; em produção o banco é outro, e as credenciais vêm de um cofre de segredos.

---

## 5. Hub — React + TypeScript + Tailwind

```powershell
pnpm create vite@latest apps/hub --template react-ts --no-interactive --no-immediate
pnpm --filter hub add -D tailwindcss @tailwindcss/vite
pnpm --filter hub add react-router @tanstack/react-query
```

**`apps/hub/vite.config.ts`**: lê o `.env` da raiz, fixa a porta e faz proxy de `/api` para o Nest:

```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

// O .env fica na raiz do monorepo e é compartilhado por todos os apps.
const envDir = resolve(import.meta.dirname, '../..')

export default defineConfig(({ mode }) => {
  // '' = lê todas as variáveis aqui no Node. Só as VITE_* vão para o navegador.
  const env = loadEnv(mode, envDir, '')

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.HUB_PORT),
      strictPort: true,
      // Front e API no mesmo origin, como vai ser em produção (hub.sondotecnica.com.br/api).
      proxy: { '/api': `http://localhost:${env.API_PORT}` },
    },
  }
})
```

**`apps/hub/src/index.css`**: troque todo o conteúdo por uma linha:

```css
@import "tailwindcss";
```

**`apps/hub/src/App.tsx`** é provisório; a aula 05 substitui:

```tsx
export default function App() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100">
      <h1 className="text-2xl font-semibold text-slate-800">SondoHub</h1>
    </main>
  )
}
```

Apague o que o template trouxe e não será usado: `apps/hub/src/App.css` (se existir) e `apps/hub/src/assets/`.

**Por que o proxy:** em produção o front e a API ficam no **mesmo host**. Assim o cookie de sessão é *first-party* e o hub não precisa de CORS para falar com a própria API. O proxy reproduz isso no dev.

---

## 6. API — NestJS 12 + Prisma 6

```powershell
pnpm dlx @nestjs/cli@latest new api --directory apps/api --package-manager pnpm --skip-git --skip-install --no-observe
pnpm --filter api add zod helmet cookie-parser
pnpm --filter api add -D @types/cookie-parser prisma@6
pnpm --filter api add @prisma/client@6
cd apps/api
pnpm exec prisma init --datasource-provider postgresql
cd ../..
```

**Novidades do Nest 12 que você vai ver no scaffold:**

- **ESM:** `"type": "module"` e imports **com `.js`** (`import { AppModule } from './app.module.js'`), mesmo nos arquivos `.ts`.
- **Vitest + Oxlint** no lugar de Jest + ESLint.

### 6.1 Ajustes depois do scaffold

1. **`apps/api/package.json`**: adicione o script `dev` (o nome é o mesmo em todos os apps, para o `pnpm -r dev` da raiz funcionar):

   ```json
   "dev": "nest start --watch --env-file ../../.env",
   ```

2. **Apague `apps/api/.env`**, que foi criado pelo `prisma init`. O `.env` é um só, o da raiz.

3. **`apps/api/prisma.config.ts`**: troque todo o conteúdo:

   ```ts
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
   ```

   > O `prisma init` gera esse arquivo com `import "dotenv/config"`. Trocamos pelo `process.loadEnvFile`, que é nativo do Node, então não precisamos instalar o `dotenv`.

4. **`apps/api/prisma/schema.prisma`**: troque o bloco `generator`:

   ```prisma
   generator client {
     provider = "prisma-client-js"
   }
   ```

   > O `prisma init` 6.19 sugere o generator novo (`prisma-client`) com `output` fora de `src/`. Só que o build do Nest compila apenas `src/`, e o client gerado ficaria de fora. O clássico `prisma-client-js` gera dentro de `node_modules` e você importa de `@prisma/client`: é o padrão do Prisma 6 e funciona no Nest ESM (testado).

5. **`apps/api/src/config/env.ts`** (novo): valida as variáveis **no boot**. Se faltar alguma, a API nem sobe:

   ```ts
   import { z } from 'zod';

   // Cresce a cada aula: só entra aqui o que o código já usa.
   const envSchema = z.object({
     API_PORT: z.coerce.number().int().positive(),
     HUB_URL: z.url(),
   });

   export const env = envSchema.parse(process.env);
   ```

6. **`apps/api/src/main.ts`**:

   ```ts
   import { NestFactory } from '@nestjs/core';
   import cookieParser from 'cookie-parser';
   import helmet from 'helmet';
   import { AppModule } from './app.module.js';
   import { env } from './config/env.js';

   const app = await NestFactory.create(AppModule);
   app.setGlobalPrefix('api');
   app.use(helmet());
   app.use(cookieParser());
   app.enableShutdownHooks();
   await app.listen(env.API_PORT);
   ```

**Por que validar o env com zod:** um `process.env.API_PORT` errado vira `NaN` silencioso e só quebra lá na frente. O `envSchema.parse` falha **na hora** e diz qual variável está errada. Esse é o princípio *fail fast*.

---

## 7. Packages compartilhados

```powershell
mkdir packages/contracts/src, packages/client/src, packages/server/src
```

Os três seguem o mesmo molde: ESM, compilados com `tsc` puro para `dist/`, e `exports` apontando para o `dist`.

**`packages/contracts/package.json`**: schemas zod e tipos que a API, o hub e os SDKs compartilham:

```json
{
  "name": "@sondohub/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch --preserveWatchOutput"
  }
}
```

**`packages/client/package.json`** e **`packages/server/package.json`** são iguais, trocando o `name` para `@sondohub/client` e `@sondohub/server`.

**`tsconfig.json` de cada package:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

O **`packages/client/tsconfig.json`** tem componentes React, então ganha duas opções. Atenção: elas vão **dentro** de `compilerOptions`. Fora dele, o TypeScript simplesmente as ignora.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM"]
  },
  "include": ["src"]
}
```

Crie um `src/index.ts` provisório em cada um, para o build já funcionar:

```ts
export {};
```

**Dependências** (o filtro por pasta evita a pegadinha do `@` no PowerShell):

```powershell
pnpm --filter ./packages/contracts add zod
pnpm --filter ./packages/contracts add -D typescript@~6.0.2

pnpm --filter ./packages/client add "@sondohub/contracts@workspace:*"
pnpm --filter ./packages/client add --save-peer react
pnpm --filter ./packages/client add -D typescript@~6.0.2 @types/react

pnpm --filter ./packages/server add jose "@sondohub/contracts@workspace:*"
pnpm --filter ./packages/server add -D typescript@~6.0.2 @types/express

pnpm --filter hub add "@sondohub/contracts@workspace:*"
pnpm --filter api add "@sondohub/contracts@workspace:*"
```

**Por que assim:**

- **`workspace:*`:** o app usa o package **direto do monorepo**, sem publicar. Na Fase 4, ao publicar, o pnpm troca pela versão real.
- **`--save-peer react`:** o `client` **não traz** o próprio React; ele usa o do app. Dois Reacts na mesma página quebram os hooks.
- **TypeScript 6:** é a versão que os scaffolds do Nest e do Vite fixam. Usar a mesma em tudo evita diferenças de checagem.

---

## 8. App demo (o "laboratório" do SSO)

```powershell
pnpm create vite@latest apps/demo --template react-ts --no-interactive --no-immediate
pnpm --filter demo add express "@sondohub/client@workspace:*" "@sondohub/server@workspace:*" "@sondohub/contracts@workspace:*"
pnpm --filter demo add -D @types/express
```

**`apps/demo/vite.config.ts`**: a mesma ideia do hub, com outra porta e proxy para a API do próprio demo:

```ts
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

const envDir = resolve(import.meta.dirname, '../..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '')

  return {
    envDir,
    plugins: [react()],
    server: {
      port: Number(env.DEMO_PORT),
      strictPort: true,
      proxy: { '/api': `http://localhost:${env.DEMO_API_PORT}` },
    },
  }
})
```

**`apps/demo/server.ts`** é provisório; a aula 07 troca. O Node 24 roda `.ts` direto, sem `tsx` nem build:

```ts
import express from 'express';

const app = express();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(Number(process.env.DEMO_API_PORT));
```

**Scripts em `apps/demo/package.json`:** troque o `dev` e acrescente dois:

```json
"dev": "pnpm run \"/^dev:/\"",
"dev:web": "vite",
"dev:api": "node --env-file=../../.env --watch server.ts",
```

> O `pnpm run "/^dev:/"` roda **em paralelo** todos os scripts que começam com `dev:` (testado). Não precisa de `concurrently`.

Para o `tsc` também checar o `server.ts`, inclua o arquivo em `apps/demo/tsconfig.node.json`:

```json
"include": ["vite.config.ts", "server.ts"]
```

---

## 9. Primeira execução

```powershell
pnpm install
```

```powershell
pnpm db:up
```

```powershell
pnpm dev
```

### ✅ Checkpoint

| Abra | Esperado |
|---|---|
| http://localhost:5180 | Hub com "SondoHub" centralizado (Tailwind funcionando) |
| http://localhost:3100/api | `Hello World!` (Nest direto) |
| http://localhost:5180/api | `Hello World!` (passando pelo proxy do hub) |
| http://localhost:5181/api/health | `{"ok":true}` (proxy do demo → Express) |
| `docker compose ps` | `postgres` rodando, com `0.0.0.0:5433->5432` |

---

## 10. Estrutura final

```
sondohub/
├─ apps/
│  ├─ api/            NestJS 12 + Prisma 6   (porta 3100)
│  ├─ hub/            React + Tailwind        (porta 5180)
│  └─ demo/           React + Express          (5181 / 4100)
├─ packages/
│  ├─ contracts/      schemas zod + tipos
│  ├─ client/         SDK + widget (React)
│  └─ server/         validação do token nos backends
├─ docs/              esta documentação
├─ .env               (não versionado)
├─ .env.example
├─ docker-compose.yml
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

## Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| `ERR_PNPM_IGNORED_BUILDS` | O pacote tem script de instalação não autorizado | Coloque-o no `allowBuilds` ou rode `pnpm approve-builds <pacote>` |
| `Port 5180 is already in use` | Outro processo está na porta | Mude no `.env` **e** no cadastro do app no banco (o `origin` inclui a porta) |
| `P1001 Can't reach database server at localhost:5433` | O Postgres não está rodando | Abra o Docker Desktop e rode `pnpm db:up` |
| Erro de *splatting* no PowerShell | Argumento começando com `@` | Coloque o argumento entre aspas |
| `ZodError` ao subir a API | Variável faltando no `.env` | A mensagem diz qual; compare com o `.env.example` |
| `Cannot find module '@sondohub/contracts'` | Os packages ainda não foram compilados | `pnpm --filter "@sondohub/*" build` (o `pnpm dev` já faz isso) |
| `@prisma/client did not initialize yet` (no seed ou no boot) | Clone novo: o client do Prisma ainda não foi gerado. O `migrate dev` gera; o `migrate deploy` não | `pnpm --filter api exec prisma generate` |

O banco (schema, migration e seed) está documentado no [apêndice](apendice-banco-de-dados.md).

➡️ Próximo: [03 — Rota de login](03-aula-login.md)
