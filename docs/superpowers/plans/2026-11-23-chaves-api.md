# Chaves de API (backend + front real) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar chaves de API no banco (só o hash), com CRUD em `/api/me/api-keys`, opção "Nunca expira" só para MASTER, e trocar o mock do hub pela API.

**Architecture:** Mesmo padrão das sessões (`sessions.token_hash`): o segredo é gerado com `randomBytes(32)`, vai para a pessoa uma única vez e o banco guarda só o SHA-256. Um módulo Nest novo (`ApiKeysModule`) com um service e um controller em `me/api-keys`, protegido pelo `SessionGuard`. Os tipos e o schema zod de entrada ficam em `@sondohub/contracts`, usados pela API e pelo hub.

**Tech Stack:** NestJS, Prisma 6 (PostgreSQL), zod 4, vitest, React + TanStack Query.

**Spec:** pedido do usuário em 2026-11-23 (Passos 1, 2 e 3) + telas já feitas em `apps/hub/src/features/developer/`.

## Decisões (validar antes de executar)

1. **Hash, não criptografia.** Criptografia é reversível: quem vaza o banco junto com a chave de criptografia lê todas as chaves. Hash é de mão única, e o servidor só precisa comparar. É o que GitHub, Stripe e o próprio SondoHub (sessões) fazem. SHA-256 basta porque o segredo tem 256 bits aleatórios; argon2/bcrypt (lentos) são para senhas fracas, e impediriam a busca direta por `key_hash`.
2. **Schema proposto vs. o seu:**
   - Tabela `api_keys` (o rascunho dizia `users`).
   - `expire_in time` → `expires_at timestamptz` **nullable** (`null` = nunca expira). O tipo `time` guarda só hora do dia, sem data.
   - `revoked_in time` → `revoked_at timestamptz` nullable.
   - Novos: `name` (para reconhecer a chave na tela), `key_hash` (único, é por ele que a chave é achada), `hint` (`"sk_sondo_1Wj...tQAA"`, para a tela; não é segredo), `created_at`, `last_used_at` (a tela já mostra "Último uso"; fica `null` até existir o guard que aceita a chave).
3. **Remover = revogar** (`revoked_at = now()`), não `DELETE`. Fica o rastro de quem criou e quando parou de valer. A lista mostra só as não revogadas.
4. **Sai o "Desativar/Reativar" do front.** O backend pedido tem só criar, listar e remover; manter um estado que o banco não tem seria mentira na tela. Status no front: `active` ou `expired`.
5. **"Nunca expira" só para MASTER, checado na API** (403 para os outros). Esconder a opção no front é só conforto; quem protege é a API.
6. **Formato do segredo:** `sk_sondo_` + 43 caracteres base64url. O prefixo fixo ajuda scanners de segredo (GitHub secret scanning) e a reconhecer a chave num log.
7. **Fora do escopo:** guard que autentica chamadas com a chave (integração futura), limite de chaves por usuário, nome único no banco (o front já avisa nome repetido).

## Global Constraints

- Nunca gravar nem logar o segredo; só `key_hash` e `hint`.
- O segredo só aparece na resposta do `POST`.
- Toda consulta e remoção filtra por `userId` da sessão (ninguém mexe na chave de outro trocando o id).
- Prazos aceitos: `7 | 30 | 90 | 365` dias, ou `null` (só MASTER).
- `name`: trim, 1 a 60 caracteres.
- Migration **não** roda contra o banco do `.env` (é o de homologação no Azure). Gerar o SQL offline; aplicar é decisão do dono do banco (`pnpm db:deploy`).

## Review Focus

- Usuário comum mandando `expiresInDays: null` direto na API → 403, nada gravado. (Task 2)
- `DELETE` com id de chave de outra pessoa → 204 sem efeito; a chave do outro continua valendo. (Task 2)
- `DELETE` de chave já revogada → 204, `revoked_at` original não muda. (Task 2)
- Chave sem validade aparece como "Nunca" na tabela e no painel, nunca como "Invalid Date". (Task 4)
- `GET` não pode devolver `keyHash`. (Task 2)

---

### Task 1: Schema Prisma + migration + contratos

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `ApiKey`, relação em `User`)
- Create: `apps/api/prisma/migrations/20261123120000_api_keys/migration.sql`
- Modify: `packages/contracts/src/index.ts` (fim do arquivo)

**Interfaces:**
- Produces (Prisma): `prisma.apiKey` com campos `id, userId, name, keyHash, hint, createdAt, expiresAt: Date | null, lastUsedAt: Date | null, revokedAt: Date | null`.
- Produces (contracts):
  - `API_KEY_EXPIRY_DAYS = [7, 30, 90, 365] as const`
  - `createApiKeySchema = z.object({ name: z.string().trim().min(1).max(60), expiresInDays: z.literal(API_KEY_EXPIRY_DAYS).nullable() })` (zod 4 aceita lista em `z.literal`)
  - `type CreateApiKeyInput = z.infer<typeof createApiKeySchema>`
  - `type ApiKey = { id: string; name: string; hint: string; createdAt: string; expiresAt: string | null; lastUsedAt: string | null }`
  - `type CreatedApiKey = { key: ApiKey; secret: string }`

- [ ] **Step 1: Adicionar o model** em `schema.prisma`, no estilo de `Session`:

```prisma
/// Chave de API de um usuário. O segredo não fica aqui: só o SHA-256 (key_hash) e um trecho para a tela (hint).
model ApiKey {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  name       String    @db.VarChar(60)
  keyHash    String    @unique @map("key_hash")
  hint       String
  createdAt  DateTime  @default(now()) @map("created_at")
  expiresAt  DateTime? @map("expires_at") // null = nunca expira (só MASTER cria)
  lastUsedAt DateTime? @map("last_used_at")
  revokedAt  DateTime? @map("revoked_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("api_keys")
}
```

e `apiKeys ApiKey[]` em `User`.

- [ ] **Step 2: Gerar o SQL sem tocar no banco**

```bash
git show HEAD:apps/api/prisma/schema.prisma > %TEMP%/schema-old.prisma
pnpm --filter api exec prisma migrate diff --from-schema-datamodel %TEMP%/schema-old.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261123120000_api_keys/migration.sql
```

Expected: SQL com `CREATE TABLE "api_keys"`, índice único em `key_hash`, índice em `user_id` e FK com `ON DELETE CASCADE`. Nada além disso.

- [ ] **Step 3: `pnpm --filter api exec prisma generate`** → PASS (client com `apiKey`).
- [ ] **Step 4: Contratos** em `packages/contracts/src/index.ts` (as exports acima) e `pnpm --filter @sondohub/contracts build` → PASS.
- [ ] **Step 5: Commit** `feat(api-keys): tabela api_keys e contratos`

### Task 2: ApiKeysService (TDD)

**Files:**
- Modify: `apps/api/src/modules/sessions/sessions.service.ts` (exportar `hashToken`)
- Create: `apps/api/src/modules/api-keys/api-keys.service.ts`
- Test: `apps/api/src/modules/api-keys/api-keys.service.spec.ts`

**Interfaces:**
- Consumes: `hashToken(token: string): string` (agora exportada), `PrismaService`, `SafeUser` (`id`, `role`).
- Produces:
  - `listOwn(userId: string): Promise<ApiKeyRow[]>`: não revogadas, `orderBy createdAt desc`, `select` sem `keyHash`.
  - `create(user: SafeUser, input: CreateApiKeyInput): Promise<{ key: ApiKeyRow; secret: string }>`
  - `revokeOwn(userId: string, id: string): Promise<void>`: `updateMany where { id, userId, revokedAt: null }`.
  - `ApiKeyRow` = o `select` (`id, name, hint, createdAt, expiresAt, lastUsedAt`).

- [ ] **Step 1: Testes que falham** (prisma mockado com `vi.fn()`, mesmo estilo de `password-reset.service.spec.ts`):
  - `grava só o hash e devolve o segredo uma vez`: `secret` casa `/^sk_sondo_[A-Za-z0-9_-]{43}$/`; `data.keyHash === hashToken(secret)`; nenhum campo de `data` contém `secret`; `data.hint === secret.slice(0, 12) + '...' + secret.slice(-4)`.
  - `calcula a validade em dias`: `expiresInDays: 30` → `data.expiresAt` ≈ agora + 30 dias (tolerância 5 s).
  - `MASTER cria chave sem validade`: role `MASTER`, `expiresInDays: null` → `data.expiresAt === null`.
  - `recusa chave sem validade para quem não é MASTER`: role `USER` → `rejects.toBeInstanceOf(ForbiddenException)` e `apiKey.create` não chamado.
  - `revokeOwn filtra pelo dono e ignora já revogada`: `updateMany` chamado com `where: { id: 'k1', userId: 'u1', revokedAt: null }`.
  - `listOwn não pede o hash`: `findMany` chamado com `where: { userId: 'u1', revokedAt: null }` e `select` sem `keyHash`.
- [ ] **Step 2:** `pnpm --filter api test api-keys` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** `ApiKeysService` (`@Injectable`, recebe `PrismaService`). Segredo: `'sk_sondo_' + randomBytes(32).toString('base64url')`. Prazo: `addDays` local de uma linha.
- [ ] **Step 4:** `pnpm --filter api test api-keys` → PASS.
- [ ] **Step 5: Commit** `feat(api-keys): service com hash e regra do MASTER`

### Task 3: Controller e módulo

**Files:**
- Create: `apps/api/src/modules/api-keys/my-api-keys.controller.ts`
- Create: `apps/api/src/modules/api-keys/api-keys.module.ts`
- Modify: `apps/api/src/app.module.ts` (importar `ApiKeysModule`)

**Interfaces:**
- Consumes: `ApiKeysService` (Task 2), `createApiKeySchema` (Task 1), `SessionGuard`, `CurrentAuth`, `ZodValidationPipe`.
- Produces (HTTP, prefixo global `/api`):
  - `GET /me/api-keys` → `200 ApiKey[]`
  - `POST /me/api-keys` body `CreateApiKeyInput` → `201 CreatedApiKey`; `400` corpo inválido; `403` `null` sem ser MASTER
  - `DELETE /me/api-keys/:id` (`ParseUUIDPipe`) → `204`

- [ ] **Step 1:** Controller no molde de `my-sessions.controller.ts` (`@Controller('me/api-keys')`, `@UseGuards(SessionGuard)`); módulo importa `SessionsModule` (o guard precisa do `SessionsService`).
- [ ] **Step 2:** `pnpm --filter api build` e `pnpm --filter api test` → PASS.
- [ ] **Step 3: Commit** `feat(api-keys): rotas /me/api-keys`

### Task 4: Hub usa a API

**Files:**
- Modify: `apps/hub/src/lib/api.ts` (3 métodos)
- Modify: `apps/hub/src/features/developer/api-keys.ts` (apagar mock, `disabled`, `maskedKey`, `randomToken`; tipos vêm de contracts)
- Modify: `apps/hub/src/features/developer/use-api-keys.ts` (usar `hubApi`; apagar `useSetApiKeyDisabled`)
- Modify: `ApiKeyActions.tsx` (só "Excluir chave"), `ApiKeysTable.tsx`, `ApiKeyDetailsPanel.tsx`, `ApiKeyStatus.tsx`, `pages/api-keys-page.tsx` (filtro "Desativadas" sai)
- Modify: `CreateApiKeyDialog.tsx` (opção "Nunca expira" se `owner.role === 'MASTER'`; recebe `role`)
- Modify: `DeleteApiKeyDialog.tsx` (texto sem "use Desativar")

**Interfaces:**
- Consumes: rotas da Task 3, tipos da Task 1.
- Produces: `hubApi.apiKeys(): Promise<ApiKey[]>`, `hubApi.createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey>`, `hubApi.deleteApiKey(id: string): Promise<void>`.

- [ ] **Step 1:** `keyStatus(key)` vira `key.expiresAt && Date.parse(key.expiresAt) <= now ? 'expired' : 'active'`. Onde aparece a validade: `expiresAt ? formatDate(expiresAt) : 'Nunca'`. A chave mascarada passa a ser `key.hint`. "Criada por" no painel usa o perfil de `me` (a lista só traz chaves do próprio usuário), então `createdBy` sai do tipo.
- [ ] **Step 2:** No `<select>` de prazo, valor `"never"` mapeado para `null` no submit; a opção só renderiza para MASTER. Erro 403 vira a mensagem "Só o Master pode criar chave sem validade."
- [ ] **Step 3:** `pnpm --filter hub build` e `pnpm --filter hub lint` → PASS.
- [ ] **Step 4: Verificar no navegador** (preview `sondohub-hub-mock`, com o mock de `/api/me` ampliado para `GET/POST/DELETE /api/me/api-keys` em memória): criar com 30 dias, criar "Nunca expira" como MASTER, trocar o mock para `role: "USER"` e ver que a opção some, excluir uma chave. Sem erros no console.
- [ ] **Step 5: Commit** `feat(hub): chaves de API pela API`
