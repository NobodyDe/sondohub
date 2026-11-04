# 10 — Tela do usuário no admin: ler, editar e atualizar

> 🎯 **Objetivo:** a tela `/admin/usuarios/:id` (`admin-user-page.tsx`) deixa de usar `FAKE_USERS` e passa a ler e gravar na API:
>
> | Rota | Faz |
> |---|---|
> | `GET /api/admin/users/:id` | O usuário + **todos** os apps ativos, com os níveis de cada um e se ele tem acesso (`hasAccess`) |
> | `PATCH /api/admin/users/:id` | Troca cargo e/ou ativo |
> | `PUT /api/admin/users/:id/apps/:slug` | Libera o app ou troca o nível |
> | `DELETE /api/admin/users/:id/apps/:slug` | Tira o acesso ao app |
> | `DELETE /api/admin/users/:id` | Remove o usuário |
>
> Todas ficam atrás do `SessionGuard` + `MasterGuard`, que o controller já tem.

---

## 🧠 Conceito: por que a resposta traz todos os apps

A tela desenha **um card por app do catálogo**, ligado ou desligado. Se a API devolvesse só os apps do usuário, o front precisaria de uma segunda chamada (o catálogo) e de um "cruzamento" das duas listas. Fazendo o cruzamento no banco, a tela recebe pronto:

```json
{
  "id": "…", "name": "Ana Ribeiro", "email": "…", "avatarUrl": null,
  "role": "ADMIN", "isActive": true,
  "apps": [
    { "slug": "demo",  "name": "App Demo",      "levels": [{ "level": 1, "label": "Leitura" }, …], "hasAccess": false, "level": null },
    { "slug": "gemeo", "name": "Gêmeo Digital", "levels": [ … ],                                    "hasAccess": true,  "level": 2 }
  ]
}
```

**O truque do Prisma:** em vez de partir do usuário, a consulta parte dos **apps** e pede o `access` filtrado por `userId`. Cada app volta com `access: []` (sem acesso) ou `access: [{ level: 2 }]` (com acesso). A tabela `user_app_access` tem chave `(userId, applicationId)`, então nunca vem mais de um.

**Por que toda rota de edição devolve o usuário inteiro de novo:** o front só precisa guardar a resposta e redesenhar. Não existe "atualizar a tela na mão" nem risco de a tela mostrar algo diferente do banco.

---

## Parte 1 — Ler: `GET /api/admin/users/:id`

### 🛠️ Passo 1 — Tipos no `contracts` (`packages/contracts/src/index.ts`)

O `AppLevel` hoje mora em `apps/hub/src/features/admin/types.ts` com o comentário "provisório". Agora que a API existe, ele sobe para o `contracts`. Acrescente no fim do arquivo:

```ts
/** Um nível de permissão, como vem da coluna applications.levels. */
export type AppLevel = { level: number; label: string };

/** Um app do catálogo visto de um usuário: os níveis do app e o nível dele (null = sem acesso). */
export type AdminUserAppAccess = {
  slug: string;
  name: string;
  levels: AppLevel[];
  hasAccess: boolean;
  level: number | null;
};

/** Resposta de GET /api/admin/users/:id e das rotas que editam o usuário. */
export type AdminUserDetail = HubProfile & {
  isActive: boolean;
  apps: AdminUserAppAccess[];
};
```

No hub, `features/admin/types.ts` troca a definição local pelo import:

```ts
import type { AppLevel } from "@sondohub/contracts";
```

> O `contracts` é consumido pelo `dist/`. Depois de mexer nele: `pnpm --filter @sondohub/contracts build` (ou deixe o `dev` rodando em watch).

**Por que `hasAccess` e `level` juntos**, se `hasAccess` é só `level !== null`? Porque foi o que a tela pediu: quem lê o JSON entende na hora. É um campo derivado e barato; não tem como os dois discordarem, porque saem da mesma linha (`access.length`).

### 🛠️ Passo 2 — Consulta no repositório (`users.repository.ts`)

```ts
import type { AdminUser, AdminUserDetail, AppLevel } from '@sondohub/contracts';
```

```ts
  /** Um usuário e TODOS os apps ativos, dizendo em quais ele entra e com que nível. */
  async findDetail(id: string): Promise<AdminUserDetail | null> {
    const [user, apps] = await Promise.all([
      this.prisma.user.findUnique({ where: { id }, select: safeUserSelect }),
      this.prisma.application.findMany({
        where: { isActive: true },
        select: {
          slug: true,
          name: true,
          levels: true,
          // Só o acesso deste usuário: volta [] (sem acesso) ou [{ level }].
          access: { where: { userId: id }, select: { level: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    if (!user) return null;

    return {
      ...user,
      apps: apps.map(({ access, levels, ...app }) => ({
        ...app,
        levels: levels as AppLevel[], // coluna Json: o Prisma não sabe o formato, o seed sabe.
        hasAccess: access.length > 0,
        level: access[0]?.level ?? null,
      })),
    };
  }
```

- **`Promise.all`:** as duas consultas não dependem uma da outra, então vão juntas ao banco.
- **`safeUserSelect`:** o mesmo select da listagem. O `passwordHash` continua sem chance de sair.
- **Devolve `null`** em vez de lançar erro: o repositório só fala com o banco. Decidir que "não achou" vira **404** é regra da API, e isso fica no service.

### 🛠️ Passo 3 — Service (`modules/users/admin-users.service.ts`, novo)

Nesta parte ele só traduz "não achou" em 404. Na Parte 2 ele ganha as regras de edição, e é por isso que já nasce separado do repositório.

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminUserDetail } from '@sondohub/contracts';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class AdminUsersService {
  constructor(private readonly users: UsersRepository) {}

  async getDetail(id: string): Promise<AdminUserDetail> {
    const user = await this.users.findDetail(id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }
}
```

### 🛠️ Passo 4 — Rota (`admin-users.controller.ts`)

```ts
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service.js';
```

```ts
  constructor(
    private readonly users: UsersRepository,
    private readonly admin: AdminUsersService,
  ) {}

  /** Um usuário, com todos os apps e o acesso dele em cada um. */
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getDetail(id);
  }
```

**Por que `ParseUUIDPipe`:** a coluna `id` é `@db.Uuid`. Sem o pipe, `/admin/users/abc` chega ao Postgres, que reclama do formato, e a API responde **500**. Com o pipe, a resposta é **400** antes de tocar no banco.

E registre o service no `users.module.ts`:

```ts
  providers: [UsersRepository, AdminUsersService],
```

### 🛠️ Passo 5 — Hub lendo a rota

**`apps/hub/src/lib/api.ts`** (importe `AdminUserDetail` do `contracts`):

```ts
  adminUser: (id: string) => request<AdminUserDetail>(`/admin/users/${id}`),
```

**`features/admin/user-access.ts`:** o `AppAccessList` recebe `apps` (o catálogo) e `grants` (o que o usuário tem). A resposta nova já é o catálogo, e os grants saem dela:

```ts
/** Só os apps que o usuário tem, no formato que o AppAccessList espera. */
export function grantsOf(apps: AdminUserAppAccess[]): AppGrant[] {
  return apps.flatMap(({ slug, level }) => (level === null ? [] : [{ slug, level }]));
}
```

O `AppAccessList` **não muda**: um `AdminUserAppAccess` tem `slug`, `name` e `levels`, então já serve como `CatalogApp`. E a tela de novo usuário continua usando o mesmo componente.

**`components/UserProfileHeader.tsx`:** ele só usa perfil + ativo, então a prop pede só isso (assim aceita o `AdminUserDetail`):

```ts
import type { HubProfile } from "@sondohub/contracts";

type UserProfileHeaderProps = {
  user: HubProfile & { isActive: boolean };
  onActiveChange: (isActive: boolean) => void;
};
```

**`admin-user-page.tsx`** (versão de leitura; os botões passam a gravar na Parte 2):

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import AdminShell from "./components/AdminShell.tsx";
import AppAccessList from "./components/AppAccessList.tsx";
import RemoveUserSection from "./components/RemoveUserSection.tsx";
import RolePicker from "./components/RolePicker.tsx";
import UserProfileHeader from "./components/UserProfileHeader.tsx";
import { grantsOf } from "./user-access.ts";
import { hubApi } from "@/lib/api.ts";
import type { UserRole } from "@sondohub/contracts";
import type { CatalogApp } from "./types.ts";

export function AdminUserPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: user, isPending } = useQuery({
    queryKey: ["admin", "users", id],
    queryFn: () => hubApi.adminUser(id),
    retry: false, // 404 é resposta, não falha de rede: mostra "não encontrado" na hora.
  });

  if (isPending)
    return (
      <AdminShell>
        <p className="text-muted-foreground">Carregando…</p>
      </AdminShell>
    );

  if (!user)
    return (
      <AdminShell>
        <div className="mx-auto flex max-w-[980px] flex-col items-start gap-3">
          <h1 className="text-2xl font-bold">Usuário não encontrado</h1>
          <Link to="/admin/usuarios">Voltar para a lista</Link>
        </div>
      </AdminShell>
    );

  function changeRole(role: UserRole) {
    console.info("Cargo (fake):", role); // Parte 2: PATCH /api/admin/users/:id.
  }

  function changeActive(isActive: boolean) {
    console.info("Ativo (fake):", isActive); // Parte 2: PATCH /api/admin/users/:id.
  }

  function changeAppLevel(app: CatalogApp, level: number | null) {
    console.info("Nível (fake):", app.slug, level); // Parte 2: PUT/DELETE .../apps/:slug.
  }

  function remove() {
    navigate("/admin/usuarios"); // Parte 2: DELETE /api/admin/users/:id antes de voltar.
  }

  return (
    <AdminShell>
      <div className="mx-auto flex max-w-[980px] flex-col gap-8">
        <UserProfileHeader user={user} onActiveChange={changeActive} />
        <RolePicker value={user.role} onChange={changeRole} />
        <AppAccessList apps={user.apps} grants={grantsOf(user.apps)} onLevelChange={changeAppLevel} />
        <RemoveUserSection onRemove={remove} />
      </div>
    </AdminShell>
  );
}
```

**Por que o `useState` saiu:** a fonte da verdade agora é a API, e o React Query já guarda a resposta. Uma cópia local em `useState` teria de ser sincronizada com o cache, e esse é o tipo de bug que aparece só depois.

### ✅ Checkpoint da Parte 1

1. Logado como Master, abra `http://localhost:<porta do hub>/api/admin/users/<id do seed>` no navegador: vem o JSON com **todos** os apps, `hasAccess` e `level`.
2. `…/api/admin/users/abc` → **400**. Um UUID que não existe → **404**.
3. Logado como Admin ou User → **403**.
4. Na lista de usuários, clique em alguém: a tela mostra os dados reais, e os cards ligados batem com o banco.

---

## Parte 2 — Editar e atualizar

### 🛠️ Passo 6 — Validação do body (`apps/api/src/common/zod-validation.pipe.ts`)

É o mesmo pipe da [aula 08](08-aula-seguranca.md) (Passo 2). Se você ainda não criou, crie agora; as rotas de escrita não devem confiar no body.

```ts
import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map(({ path, message }) => ({ path, message })));
    }
    return result.data;
  }
}
```

### 🛠️ Passo 7 — Schemas no `contracts`

O `UserRole` vira schema, e o tipo sai dele. Assim os valores aceitos existem num lugar só. Troque a linha `export type UserRole = …` por:

```ts
/** Cargo do usuário no hub. Espelha o enum UserRole do Prisma. */
export const userRoleSchema = z.enum(["MASTER", "ADMIN", "USER"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Body de PATCH /api/admin/users/:id. Manda só o que mudou. */
export const updateUserSchema = z.object({
  role: userRoleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Body de PUT /api/admin/users/:id/apps/:slug. */
export const appAccessSchema = z.object({ level: z.number().int().positive() });
export type AppAccessInput = z.infer<typeof appAccessSchema>;
```

(E de novo: `pnpm --filter @sondohub/contracts build`.)

**Por que o zod não checa se o nível existe:** os níveis de cada app estão no banco (`applications.levels`), e o schema não enxerga o banco. O zod garante o **formato** (inteiro positivo). Se o nível **existe naquele app** é regra de negócio, e fica no service.

### 🛠️ Passo 8 — Escritas no repositório

**`users.repository.ts`:**

```ts
import type { AdminUser, AdminUserDetail, AppLevel, UpdateUserInput } from '@sondohub/contracts';
```

```ts
  async update(id: string, data: UpdateUserInput): Promise<void> {
    await this.prisma.user.update({ where: { id }, data });
  }

  /** Cria o acesso ou troca o nível: "liberar" e "mudar nível" são a mesma operação. */
  async upsertAccess(userId: string, applicationId: string, level: number): Promise<void> {
    await this.prisma.userAppAccess.upsert({
      where: { userId_applicationId: { userId, applicationId } },
      update: { level },
      create: { userId, applicationId, level },
    });
  }

  /** deleteMany não quebra se o acesso já não existia: tirar duas vezes dá o mesmo resultado. */
  async deleteAccess(userId: string, applicationId: string): Promise<void> {
    await this.prisma.userAppAccess.deleteMany({ where: { userId, applicationId } });
  }

  /** Sessões e acessos saem junto (onDelete: Cascade no schema). */
  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }
```

**`apps/apps.repository.ts`** (a busca de app é assunto do repositório de apps):

```ts
  findBySlug(slug: string) {
    return this.prisma.application.findUnique({
      where: { slug },
      select: { id: true, levels: true },
    });
  }
```

E o `users.module.ts` passa a importar o módulo de apps:

```ts
  imports: [SessionsModule, AppsModule],
```

### 🛠️ Passo 9 — Regras no service (`admin-users.service.ts`, versão completa)

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminUserDetail, AppLevel, UpdateUserInput } from '@sondohub/contracts';
import { AppsRepository } from '../apps/apps.repository.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly apps: AppsRepository,
  ) {}

  async getDetail(id: string): Promise<AdminUserDetail> {
    const user = await this.users.findDetail(id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async update(actorId: string, id: string, input: UpdateUserInput): Promise<AdminUserDetail> {
    assertNotSelf(actorId, id);
    await this.getDetail(id); // 404 claro, em vez do erro do Prisma ao atualizar quem não existe.
    await this.users.update(id, input);
    return this.getDetail(id);
  }

  async setAppLevel(id: string, slug: string, level: number): Promise<AdminUserDetail> {
    await this.getDetail(id); // sem isso, um id inexistente estoura a chave estrangeira (500).
    const app = await this.findApp(slug);
    const levels = app.levels as AppLevel[];
    if (!levels.some((option) => option.level === level))
      throw new BadRequestException('Este app não tem esse nível.');

    await this.users.upsertAccess(id, app.id, level);
    return this.getDetail(id);
  }

  async removeApp(id: string, slug: string): Promise<AdminUserDetail> {
    const app = await this.findApp(slug);
    await this.users.deleteAccess(id, app.id);
    return this.getDetail(id); // aqui o 404 do usuário sai de graça.
  }

  async remove(actorId: string, id: string): Promise<void> {
    assertNotSelf(actorId, id);
    await this.getDetail(id);
    await this.users.delete(id);
  }

  private async findApp(slug: string) {
    const app = await this.apps.findBySlug(slug);
    if (!app) throw new NotFoundException('App não encontrado.');
    return app;
  }
}

/** O Master não mexe no próprio cargo, status nem conta por aqui: evita se trancar fora do painel. */
function assertNotSelf(actorId: string, id: string) {
  if (actorId === id) throw new ForbiddenException('Você não pode alterar a própria conta por aqui.');
}
```

**Quem faz o quê:**

| Camada | Responsabilidade |
|---|---|
| Controller | HTTP: rota, guards, pipes (formato do body e do id) |
| Service | Regras: 404, nível válido, não mexer em si mesmo |
| Repositório | Só Prisma: ler e gravar |

**Por que `assertNotSelf`:** sem ele, o único Master pode se rebaixar para User (ou se desativar) com um clique e ninguém mais entra no painel. A trava custa uma linha. Trocar o **próprio nível nos apps** continua liberado, porque não tranca ninguém fora do hub.

### 🛠️ Passo 10 — Rotas (`admin-users.controller.ts`, versão completa)

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  type AppAccessInput,
  appAccessSchema,
  type UpdateUserInput,
  updateUserSchema,
} from '@sondohub/contracts';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { MasterGuard } from '../../common/auth/master.guard.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { AdminUsersService } from './admin-users.service.js';
import { UsersRepository } from './users.repository.js';

@Controller('admin/users')
@UseGuards(SessionGuard, MasterGuard)
export class AdminUsersController {
  constructor(
    private readonly users: UsersRepository,
    private readonly admin: AdminUsersService,
  ) {}

  /** Todos os usuários, com cargo, status e apps liberados. */
  @Get()
  list() {
    return this.users.listAll();
  }

  /** Um usuário, com todos os apps e o acesso dele em cada um. */
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getDetail(id);
  }

  /** Troca cargo e/ou ativo. */
  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ) {
    return this.admin.update(auth.user.id, id, body);
  }

  /** Libera o app ou troca o nível. */
  @Put(':id/apps/:slug')
  setAppLevel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(appAccessSchema)) body: AppAccessInput,
  ) {
    return this.admin.setAppLevel(id, slug, body.level);
  }

  /** Tira o acesso ao app. */
  @Delete(':id/apps/:slug')
  removeApp(@Param('id', ParseUUIDPipe) id: string, @Param('slug') slug: string) {
    return this.admin.removeApp(id, slug);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.remove(auth.user.id, id);
  }
}
```

**Por que `PATCH` para o usuário e `PUT` para o app:** `PATCH` é "mude só estes campos" (o body pode ter só `role`). `PUT` em `/apps/:slug` é "o acesso a este app fica exatamente assim": repetir a chamada dá o mesmo resultado, e por isso o mesmo endpoint cria ou atualiza.

### 🛠️ Passo 11 — Hub gravando

**`lib/api.ts`** (importe `UpdateUserInput` também):

```ts
  updateAdminUser: (id: string, input: UpdateUserInput) =>
    request<AdminUserDetail>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  setAdminUserApp: (id: string, slug: string, level: number) =>
    request<AdminUserDetail>(`/admin/users/${id}/apps/${slug}`, {
      method: "PUT",
      body: JSON.stringify({ level }),
    }),
  removeAdminUserApp: (id: string, slug: string) =>
    request<AdminUserDetail>(`/admin/users/${id}/apps/${slug}`, { method: "DELETE" }),
  deleteAdminUser: (id: string) => request<void>(`/admin/users/${id}`, { method: "DELETE" }),
```

#### Atualização otimista: a tela muda no clique

Se a tela esperasse a resposta da API para mudar, cada clique pareceria travado. Na atualização **otimista**, a tela muda **na hora** e a requisição vai por trás. A cada clique:

1. **No clique:** aplica a mudança no cache (`onMutate`). O switch ou o nível muda na mesma hora.
2. **Deu certo:** guarda a resposta da API, que é a versão oficial do banco (`onSuccess`).
3. **Deu errado:** busca de novo o usuário no banco, e a tela volta ao que estava salvo (`onError`). Depois mostra o aviso de erro.

Para isso, cada edição precisa dizer **duas coisas**: como fica a tela agora (`apply`) e qual chamada fazer (`request`).

**`features/admin/user-access.ts`:** o `withAppLevel` antigo (que trabalhava com o `AdminUser` da lista fake) vira a versão para o `AdminUserDetail`. É a "previsão" de como fica o usuário depois de mexer num app:

```ts
import type { AdminUserAppAccess, AdminUserDetail } from "@sondohub/contracts";
import type { AppGrant, CatalogApp } from "./types.ts"; // o AdminUser sai daqui
```

```ts
/** O usuário com o nível do app trocado. level null = sem acesso. */
export function withAppLevel(user: AdminUserDetail, slug: string, level: number | null): AdminUserDetail {
  return {
    ...user,
    apps: user.apps.map((app) =>
      app.slug === slug ? { ...app, level, hasAccess: level !== null } : app,
    ),
  };
}
```

**`admin-user-page.tsx`** (versão final):

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import AdminShell from "./components/AdminShell.tsx";
import AppAccessList from "./components/AppAccessList.tsx";
import RemoveUserSection from "./components/RemoveUserSection.tsx";
import RolePicker from "./components/RolePicker.tsx";
import UserProfileHeader from "./components/UserProfileHeader.tsx";
import { grantsOf, withAppLevel } from "./user-access.ts";
import { hubApi } from "@/lib/api.ts";
import type { AdminUserDetail, UserRole } from "@sondohub/contracts";
import type { CatalogApp } from "./types.ts";

const USERS_LIST_KEY = ["admin", "users"];

/** Uma edição: como a tela fica agora (apply) e a chamada que grava (request). */
type Edit = {
  apply: (user: AdminUserDetail) => AdminUserDetail;
  request: () => Promise<AdminUserDetail>;
};

export function AdminUserPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userKey = ["admin", "users", id];

  const { data: user, isPending } = useQuery({
    queryKey: userKey,
    queryFn: () => hubApi.adminUser(id),
    retry: false, // 404 é resposta, não falha de rede: mostra "não encontrado" na hora.
  });

  const save = useMutation({
    mutationKey: userKey, // para contar quantas edições deste usuário estão em andamento.
    scope: { id: `admin-user-${id}` }, // uma requisição por vez, na ordem dos cliques.
    mutationFn: ({ request }: Edit) => request(),
    // Roda no clique, antes da requisição: a tela muda na hora.
    onMutate: async ({ apply }) => {
      await queryClient.cancelQueries({ queryKey: userKey }); // um GET atrasado não desfaz o clique.
      queryClient.setQueryData<AdminUserDetail>(userKey, (current) => current && apply(current));
    },
    onSuccess: (updated) => {
      // Com outra edição na fila, esta resposta já está velha: quem grava é a última.
      if (queryClient.isMutating({ mutationKey: userKey }) === 1) queryClient.setQueryData(userKey, updated);
    },
    // Falhou: busca de novo o que está no banco, e a tela volta ao que estava salvo.
    onError: () => queryClient.invalidateQueries({ queryKey: userKey }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: USERS_LIST_KEY, exact: true }),
  });

  const remove = useMutation({
    mutationFn: () => hubApi.deleteAdminUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_LIST_KEY, exact: true });
      navigate("/admin/usuarios");
    },
  });

  if (isPending)
    return (
      <AdminShell>
        <p className="text-muted-foreground">Carregando…</p>
      </AdminShell>
    );

  if (!user)
    return (
      <AdminShell>
        <div className="mx-auto flex max-w-[980px] flex-col items-start gap-3">
          <h1 className="text-2xl font-bold">Usuário não encontrado</h1>
          <Link to="/admin/usuarios">Voltar para a lista</Link>
        </div>
      </AdminShell>
    );

  function changeRole(role: UserRole) {
    save.mutate({
      apply: (current) => ({ ...current, role }),
      request: () => hubApi.updateAdminUser(id, { role }),
    });
  }

  function changeActive(isActive: boolean) {
    save.mutate({
      apply: (current) => ({ ...current, isActive }),
      request: () => hubApi.updateAdminUser(id, { isActive }),
    });
  }

  function changeAppLevel(app: CatalogApp, level: number | null) {
    save.mutate({
      apply: (current) => withAppLevel(current, app.slug, level),
      request: () =>
        level === null
          ? hubApi.removeAdminUserApp(id, app.slug)
          : hubApi.setAdminUserApp(id, app.slug, level),
    });
  }

  return (
    <AdminShell>
      <div className="mx-auto flex max-w-[980px] flex-col gap-8">
        <UserProfileHeader user={user} onActiveChange={changeActive} />
        {(save.error || remove.error) && (
          <p role="alert" className="text-sm font-semibold text-danger-text">
            Não deu para salvar. A tela voltou ao que está gravado.
          </p>
        )}
        <RolePicker value={user.role} onChange={changeRole} />
        <AppAccessList apps={user.apps} grants={grantsOf(user.apps)} onLevelChange={changeAppLevel} />
        <RemoveUserSection onRemove={() => remove.mutate()} />
      </div>
    </AdminShell>
  );
}
```

**Por que uma mutation só (`save`) recebendo `{ apply, request }`:** as três edições seguem o mesmo ciclo (aplicar na tela, gravar, confirmar ou desfazer). Três `useMutation` repetiriam esse ciclo três vezes. Cada handler só diz *o que* muda, e a mutation cuida do *como*.

**Por que `apply` é uma função, e não o usuário já pronto:** o `onMutate` aplica a mudança sobre o que **está no cache naquele momento** (`current`). Com dois cliques rápidos (cargo e depois um app), o segundo parte do resultado do primeiro. Se o handler montasse o usuário a partir do `user` da renderização, poderia partir de uma versão velha e desfazer o primeiro clique.

**As três linhas que evitam bugs de clique rápido:**

| Linha | Sem ela |
|---|---|
| `scope: { id }` | Nível 2 e depois nível 3: as duas requisições saem juntas e podem chegar ao banco fora de ordem. O banco termina com 2 e a tela mostra 3. Com o `scope`, a tela muda nos dois cliques, mas as requisições vão **em fila**. |
| `cancelQueries` | Um GET que já estava a caminho chega depois do clique e desfaz o que a pessoa acabou de ver. |
| `isMutating(...) === 1` | A resposta do clique 1 chega com o clique 2 ainda na fila. A tela "pula" de volta para o 1 e só depois vai para o 2. |

**Por que, no erro, buscar de novo em vez de guardar um "antes" e restaurar:** com edições na fila, o "antes" de uma pode ser o "depois" de outra. Restaurar uma foto velha apagaria um clique que deu certo. Buscar no banco é mais simples e sempre acerta.

**Por que `exact: true` no `invalidateQueries`:** a chave da lista (`["admin","users"]`) é prefixo da chave deste usuário (`["admin","users",id]`). Sem o `exact`, invalidar a lista também refaria o GET deste usuário, que acabou de ser atualizado pelo `setQueryData`.

**Faxina:** o `FAKE_USERS` em `fake-users.ts` fica sem uso; apague-o. O `FAKE_APPS` continua, porque a tela de novo usuário ainda depende dele até existir `GET /api/admin/apps`.

### ✅ Checkpoint da Parte 2

1. Troque o cargo de alguém e dê F5: o cargo novo continua lá (veio do banco, não do estado da tela).
1. No DevTools → Network, coloque **Slow 4G** e clique nos switches e níveis: a tela muda **na hora**, e as requisições aparecem uma depois da outra. Com a API desligada, o clique muda, a tela volta e o aviso de erro aparece.
2. Ligue um app: ele entra no **menor nível**. Troque o nível, desligue e confira a tabela `user_app_access` no DBeaver.
3. Desative um usuário: a sessão dele cai na próxima requisição (o `SessionsService` já recusa `isActive = false`).
4. Tente mudar **o seu próprio** cargo: **403** e a mensagem de erro aparece na tela.
5. `PUT …/apps/demo` com `{ "level": 99 }` → **400**. `{ "level": "2" }` → **400** (é o zod barrando o formato).
6. Remova um usuário: volta para a lista, e ele não aparece mais.

---

## ⚠️ Ficou simples de propósito

- **A tela "mente" por um instante:** até a API responder, ela mostra o que **vai** ficar salvo. Se a API recusar (403 em si mesmo, nível inválido), o clique aparece e volta. É o preço do clique instantâneo, e o aviso de erro explica o que aconteceu.
- **Sem indicador de "salvando":** se quiser mostrar que ainda tem coisa a caminho, `save.isPending` diz isso. Só use se o "volta no erro" não bastar.
- **Remover o usuário não é otimista:** é irreversível e leva para outra tela. Esperar a confirmação do banco é o certo aqui.
- **"Não pode mexer em si mesmo" cobre o caso de um Master só.** Se houver dois Masters, um ainda pode rebaixar o outro. Regras como "sempre sobra pelo menos um Master" entram quando forem pedidas.
- **Mensagem de erro genérica:** a API manda o motivo (`message`), mas o `ApiError` do hub só guarda o status. Quando precisar mostrar o motivo, é ali que se lê o body.
- **Apps inativos não aparecem na tela,** mas o acesso a eles continua no banco. Se o app voltar a ficar ativo, o acesso volta junto.
