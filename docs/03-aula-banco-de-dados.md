# Aula 03 — Banco de dados: usuários, apps e níveis

> **Objetivo:** modelar no Postgres **quem é o usuário**, **quais apps existem** e **qual nível cada usuário tem em cada app**, além das sessões de login. No fim da aula, o banco existe, tem dados de teste e você sabe consultar tudo.
>
> **Pré-requisito:** guia [02](02-setup-monorepo.md) concluído, com `pnpm db:up` rodando.

---

## 🧠 Conceito

O modelo inteiro responde a três perguntas. Cada pergunta é uma tabela:

| Pergunta | Tabela |
|---|---|
| Quem é você? | `users` |
| Que apps existem? | `applications` |
| O que você pode fazer em cada app? | `user_app_access` (a ponte entre as duas, com o **nível**) |

Uma quarta tabela, `sessions`, guarda os logins ativos. Ela é o "refresh token" do desenho original.

```
┌────────────────────┐       ┌───────────────────────────┐       ┌─────────────────────┐
│ users              │       │ user_app_access           │       │ applications        │
├────────────────────┤       ├───────────────────────────┤       ├─────────────────────┤
│ id (PK, uuid)      │──1:N──│ user_id (PK, FK)          │       │ id (PK, uuid)       │
│ email (único)      │       │ application_id (PK, FK)   │──N:1──│ slug (único) → aud  │
│ name               │       │ level                     │       │ name, icon_url, url │
│ password_hash      │       │ granted_at                │       │ origin (único)      │
│ avatar_url         │       └───────────────────────────┘       │ levels (json)       │
│ is_admin           │                                           │ is_active           │
│ is_active          │       ┌───────────────────────────┐       └─────────────────────┘
│ failed_login_count │──1:N──│ sessions                  │
│ locked_until       │       ├───────────────────────────┤
└────────────────────┘       │ id, user_id (FK)          │
                             │ token_hash (único)        │
                             │ expires_at, revoked_at    │
                             └───────────────────────────┘
```

**O "nível de hierarquia"** é um inteiro por par (usuário, app). Número maior significa mais permissão: 1 = leitura, 2 = edição, 3 = admin. Quem define os rótulos é cada app (campo `levels`), e quem decide o que cada nível pode fazer é o código de cada app (aula 07).

> **Por que um inteiro e não um nome de papel (`'admin'`, `'editor'`)?** Porque você pediu *hierarquia*: com número, a regra "editor ou acima" vira `level >= 2`, sem lista de papéis. Se um dia algum app precisar de permissões que **não** são hierárquicas (por exemplo, "pode exportar" sem ser editor), aí sim vale uma tabela de permissões. Hoje seria excesso.

---

## 🛠️ Passo 1 — O schema

Substitua os modelos em `apps/api/prisma/schema.prisma` (mantenha o `generator` e o `datasource` do guia 02):

```prisma
model User {
  id               String    @id @default(uuid()) @db.Uuid
  email            String    @unique
  name             String
  passwordHash     String?   @map("password_hash")
  avatarUrl        String?   @map("avatar_url")
  isAdmin          Boolean   @default(false) @map("is_admin")
  isActive         Boolean   @default(true) @map("is_active")
  failedLoginCount Int       @default(0) @map("failed_login_count")
  lockedUntil      DateTime? @map("locked_until")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  access   UserAppAccess[]
  sessions Session[]

  @@map("users")
}

model Application {
  id        String   @id @default(uuid()) @db.Uuid
  slug      String   @unique
  name      String
  iconUrl   String   @map("icon_url")
  url       String
  origin    String   @unique
  levels    Json
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")

  access UserAppAccess[]

  @@map("applications")
}

model UserAppAccess {
  userId        String   @map("user_id") @db.Uuid
  applicationId String   @map("application_id") @db.Uuid
  level         Int
  grantedAt     DateTime @default(now()) @map("granted_at")

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@id([userId, applicationId])
  @@index([applicationId])
  @@map("user_app_access")
}

model Session {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  tokenHash  String    @unique @map("token_hash")
  userAgent  String?   @map("user_agent")
  ip         String?
  createdAt  DateTime  @default(now()) @map("created_at")
  lastUsedAt DateTime  @default(now()) @map("last_used_at")
  expiresAt  DateTime  @map("expires_at")
  revokedAt  DateTime? @map("revoked_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}
```

### Por que cada decisão

| Decisão | Por quê |
|---|---|
| `id` UUID (`@db.Uuid`) | Não é sequencial, então não revela quantos usuários existem nem é adivinhável (`/users/2`, `/users/3`…). O tipo nativo ocupa 16 bytes. |
| `email` único, sempre minúsculo | O zod normaliza na entrada (`trim` + `toLowerCase`, aula 04). Assim `Ana@X.com` e `ana@x.com` são o mesmo usuário. |
| `passwordHash` opcional | Um usuário convidado ainda não criou senha (Fases 2 e 4). Login com hash `null` sempre falha. |
| `isActive` em vez de apagar | Desativar é reversível e mantém o histórico (auditoria, migração). |
| `failedLoginCount` + `lockedUntil` | Bloqueio temporário contra força bruta (aula 04). |
| `slug` | Vira o `aud` do token: um identificador estável e legível (`demo`, `gemeo`). |
| `origin` único | É assim que o hub descobre **qual app** está pedindo token (aula 05). |
| `levels` em JSON | Os rótulos dos níveis de cada app (`[{level: 1, label: "Leitura"}]`). Uma tabela própria seria excesso para uma lista curta editada pelo admin. |
| PK composta `(user_id, application_id)` | O **próprio banco** garante **um nível por usuário por app**, sem precisar de código para isso. |
| `onDelete: Cascade` | Apagar um usuário ou app remove junto os acessos e sessões, sem deixar órfãos. |
| `tokenHash` | O banco guarda o **hash** do cookie, nunca o valor. Se o banco vazar, as sessões não podem ser usadas. |
| `@map` / `@@map` | `snake_case` no Postgres (convenção do banco) e `camelCase` no TypeScript. |
| `@@index([applicationId])` | Acelera "quem acessa o app X?". A pergunta inversa ("quais apps o usuário Y acessa?") já usa a PK, que começa por `user_id`. |

---

## 🛠️ Passo 2 — Migration

```powershell
pnpm db:migrate --name init
```

O Prisma compara o schema com o banco, gera `apps/api/prisma/migrations/<data>_init/migration.sql`, aplica e gera o client tipado. **Esse arquivo vai para o git**: é o histórico do banco.

Este é o SQL que ele gera (saída real do Prisma 6.19 para o schema acima, resumida):

```sql
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "avatar_url" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon_url" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "levels" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_app_access" (
    "user_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_app_access_pkey" PRIMARY KEY ("user_id","application_id")
);

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "applications_slug_key" ON "applications"("slug");
CREATE UNIQUE INDEX "applications_origin_key" ON "applications"("origin");
CREATE INDEX "user_app_access_application_id_idx" ON "user_app_access"("application_id");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

ALTER TABLE "user_app_access" ADD CONSTRAINT "user_app_access_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_app_access" ADD CONSTRAINT "user_app_access_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

> **Leia o SQL antes de aplicar.** É um bom hábito: o schema Prisma é a intenção, e o SQL é o que de fato acontece no banco. Para ver o SQL sem aplicar nada:
> `pnpm --filter api exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`

---

## 🛠️ Passo 3 — Seed (dados de teste)

Crie `apps/api/prisma/seed.ts`. Ele roda direto no Node 24, sem `tsx`:

```ts
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const password = process.env.SEED_PASSWORD;
if (!password) throw new Error('Defina SEED_PASSWORD no .env');

const demoUrl = `http://localhost:${process.env.DEMO_PORT}`;
const passwordHash = await argon2.hash(password);

// upsert = "cria se não existir": o seed pode rodar várias vezes sem duplicar nada.
function upsertUser(email: string, name: string, isAdmin: boolean) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, isAdmin, passwordHash },
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

const admin = await upsertUser(process.env.SEED_ADMIN_EMAIL ?? 'admin@sondotecnica.com.br', 'Administrador', true);
const reader = await upsertUser('leitor@sondotecnica.com.br', 'Leitor', false);

await grantAccess(admin.id, demo.id, 3);
await grantAccess(reader.id, demo.id, 1);

console.log('Seed ok: admin (nível 3) e leitor (nível 1) no app demo');
await prisma.$disconnect();
```

Instale o argon2 na API e rode o seed:

```powershell
pnpm --filter api add argon2
```

```powershell
pnpm db:seed
```

**Como o comando funciona:**

- `pnpm db:seed` chama `prisma db seed`.
- O Prisma lê o `migrations.seed` do `prisma.config.ts` e executa `node prisma/seed.ts`.
- O seed herda as variáveis do `.env` que o próprio `prisma.config.ts` carregou.

**Por que dois usuários:** o admin tem nível 3 e o leitor nível 1 **no mesmo app**. É o mínimo para você ver o nível funcionando na aula 07: o leitor recebe 403 numa rota que exige nível 3.

> O `argon2.hash` usa **Argon2id** com os parâmetros padrão da lib (64 MiB, 3 iterações, paralelismo 4), acima do mínimo recomendado pela OWASP. Não precisa configurar nada.

---

## 🛠️ Passo 4 — As consultas que o sistema vai fazer

Estas são as consultas de verdade das próximas aulas. Entender cada uma agora deixa o resto fácil.

**1. Quais apps o usuário pode acessar?** O launcher e o widget usam esta:

```ts
prisma.application.findMany({
  where: { isActive: true, access: { some: { userId } } },
  select: { slug: true, name: true, iconUrl: true, url: true },
  orderBy: { name: 'asc' },
});
```

```sql
SELECT a.slug, a.name, a.icon_url, a.url
FROM applications a
JOIN user_app_access uaa ON uaa.application_id = a.id
WHERE uaa.user_id = $1 AND a.is_active
ORDER BY a.name;
```

**2. Qual o nível do usuário neste app?** É o que vai dentro do token:

```ts
prisma.userAppAccess.findUnique({
  where: { userId_applicationId: { userId, applicationId } },
  select: { level: true },
});
```

> `userId_applicationId` é o nome que o Prisma dá à PK composta. É uma busca direta pela chave primária, a mais rápida possível.

**3. Conceder ou mudar um nível** (o admin, na Fase 3): é o mesmo `upsert` do `grantAccess` do seed.

**4. Revogar o acesso:**

```ts
prisma.userAppAccess.delete({ where: { userId_applicationId: { userId, applicationId } } });
```

**5. Quem acessa o app X?** É a tela do admin e usa o índice `application_id`:

```ts
prisma.userAppAccess.findMany({
  where: { applicationId },
  select: { level: true, user: { select: { name: true, email: true } } },
});
```

Repare: **nenhuma consulta pede `passwordHash`**. Na aula 04 isso vira regra, com um `select` seguro centralizado no repositório.

---

## ✅ Checkpoint

**Visual:**

```powershell
pnpm db:studio
```

O Prisma Studio abre no navegador. Confira as 4 tabelas, os 2 usuários, o app `demo` e os 2 acessos.

**Pelo SQL**, direto no container:

```powershell
docker compose exec postgres psql -U sondohub -d sondohub -c "SELECT u.email, a.slug, uaa.level FROM user_app_access uaa JOIN users u ON u.id = uaa.user_id JOIN applications a ON a.id = uaa.application_id ORDER BY uaa.level DESC;"
```

Esperado:

```
           email            | slug | level
----------------------------+------+-------
 admin@sondotecnica.com.br  | demo |     3
 leitor@sondotecnica.com.br | demo |     1
```

**Teste o que o banco garante sozinho.** Tente dar um 2º nível ao mesmo usuário no mesmo app:

```powershell
docker compose exec postgres psql -U sondohub -d sondohub -c "INSERT INTO user_app_access (user_id, application_id, level) SELECT user_id, application_id, 2 FROM user_app_access LIMIT 1;"
```

Esperado: `duplicate key value violates unique constraint "user_app_access_pkey"`. É a PK composta trabalhando.

---

## ⚠️ Atenção

- **O `origin` inclui a porta.** `http://localhost:5181` é diferente de `http://localhost:5182`. Se você mudar `DEMO_PORT`, rode o seed de novo **e** atualize o `origin` no Studio, porque o `upsert` não altera registros que já existem.
- **O `levels` não é validado pelo banco.** É um JSON livre. Na Fase 3, o admin vai validá-lo com zod antes de salvar, e também vai validar que o nível concedido existe no app.
- **Nunca edite um `migration.sql` já aplicado.** Para mudar o banco, altere o schema e crie uma migration nova.

---

## 🏋️ Exercícios

1. Escreva a consulta Prisma que lista **os usuários com nível ≥ 2 no app `demo`**.
2. Por que a busca "quais apps o usuário Y acessa" **não** precisa de um índice extra em `user_app_access(user_id)`?

<details>
<summary>Respostas</summary>

1. ```ts
   prisma.user.findMany({
     where: { access: { some: { level: { gte: 2 }, application: { slug: 'demo' } } } },
     select: { name: true, email: true },
   });
   ```
2. Porque a PK composta é `(user_id, application_id)`, e o índice da PK começa por `user_id`. Um índice composto serve para buscas pela **primeira** coluna. Para buscas só pela segunda (`application_id`) não serve, e é por isso que criamos o `@@index([applicationId])`.

</details>

---

## 📎 Apêndice — Tabelas das próximas fases

Não crie agora. Estão aqui para você enxergar o modelo completo:

```prisma
// Fase 2 — links de uso único (convite, esqueci a senha, troca de email)
model UserToken {
  id        String       @id @default(uuid()) @db.Uuid
  userId    String       @map("user_id") @db.Uuid
  purpose   TokenPurpose
  tokenHash String       @unique @map("token_hash")
  newEmail  String?      @map("new_email")
  expiresAt DateTime     @map("expires_at")
  usedAt    DateTime?    @map("used_at")
  createdAt DateTime     @default(now()) @map("created_at")

  @@index([userId])
  @@map("user_tokens")
}

enum TokenPurpose {
  INVITE
  RESET_PASSWORD
  CHANGE_EMAIL
}

// Fase 3 — quem fez o quê
model AuditLog {
  id        String   @id @default(uuid()) @db.Uuid
  actorId   String?  @map("actor_id") @db.Uuid
  action    String
  targetId  String?  @map("target_id")
  metadata  Json?
  ip        String?
  createdAt DateTime @default(now()) @map("created_at")

  @@index([actorId])
  @@map("audit_logs")
}
```

➡️ Próximo: [04 — API: login e sessão](04-aula-api-login-e-sessao.md)
