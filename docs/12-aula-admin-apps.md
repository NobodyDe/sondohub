# 12 — Catálogo de aplicativos: criar e editar

> 🎯 **Objetivo:** o Master cadastra e edita os aplicativos do hub pelo painel, sem seed e sem DBeaver. A tela `/admin/aplicativos` lista o catálogo, `/admin/aplicativos/novo` cria e `/admin/aplicativos/:id` edita. De brinde, o `FAKE_APPS` da tela de novo usuário (aula 11) sai de cena.
>
> | Rota | Body | Resposta |
> |---|---|---|
> | `GET /api/admin/apps` | — | **200** `AdminApp[]` (inclusive inativos) |
> | `GET /api/admin/apps/:id` | — | **200** `AdminApp` · **404** |
> | `POST /api/admin/apps` | `{ slug, name, url, iconUrl, levels, isActive }` | **201** `AdminApp` · **409** slug ou endereço já usado |
> | `PUT /api/admin/apps/:id` | `{ name, url, iconUrl, levels, isActive }` | **200** `AdminApp` · **404** · **409** endereço já usado ou nível em uso |
> | qualquer uma | sem sessão / não é Master | **401** / **403** |
>
> **Sem `DELETE` de propósito:** remover um app apagaria em cascata o acesso de todo mundo. Para tirar do ar, desligue o **ativo**.

---

## 🧠 Conceito 1: a tela manda pouco, a API completa o resto

| Campo no banco | Quem preenche | Regra |
|---|---|---|
| `id` | Postgres | `uuid()` do schema, já existe |
| `slug`, `name`, `url` | Tela | obrigatórios |
| `icon_url` | Tela **ou** API | vazio → `url + "/favicon.svg"` |
| `origin` | **Só a API** | `new URL(url).origin` |
| `levels` | Tela | padrão `Leitura / Edição / Admin`, editável |
| `is_active` | Tela | padrão `true` |

**Por que a origem não vem da tela:** ela é a **identidade do app no SSO** (o `POST /api/sso/token` procura o app pela origem de quem chama) e entra na lista de CORS. Se viesse do front, um erro de digitação faria a URL apontar para um lugar e a origem para outro. Calculada da URL, as duas nunca discordam. `new URL("https://gemeo.sondotecnica.com.br/app/").origin` dá `https://gemeo.sondotecnica.com.br`: tira caminho e barra final sozinho.

**Por que o ícone padrão é resolvido ao gravar:** o launcher já faz `<img src={app.iconUrl}>`, e a coluna é `NOT NULL`. Gravando o valor final, nenhuma tela que lê o app precisa saber da regra. A regra mora numa função no `contracts` (`defaultIconUrl`), usada pela API para gravar e pelo hub para a prévia.

## 🧠 Conceito 2: níveis são uma escada, e só crescem ou encolhem pelo topo

O número do nível é o que vai no token (`level`) e o que os apps comparam (`if (user.level >= 2)`, aula 07). O rótulo é só texto para a tela. Daí três regras:

1. **Os números são sempre `1, 2, 3…`, em ordem.** O schema recusa `[1, 3]` ou `[2, 1]`.
2. **Renomear é livre.** "Edição" vira "Gestor" sem efeito nenhum no app.
3. **Adicionar e remover, só no fim.** Remover o nível do meio renumeraria os de cima, e quem era "3 = Admin" viraria "2" sem ninguém pedir. Por isso a tela só oferece remover o último.

E uma regra que precisa do banco: **não dá para remover um nível que alguém usa.** Se a Ana está no nível 3 e o app passa a ter só 2, ela ficaria com um nível que não existe. A API confere e responde **409**.

**Por que no máximo 5:** é o que cabe no seletor de permissão do cadastro de usuário (`AppAccessCard`, um card de 280px). Se um app precisar de mais, o seletor muda junto.

## 🧠 Conceito 3: `PUT` aqui, `PATCH` nos usuários

Na tela de usuário, cada clique grava sozinho (cargo, ativo, um app), por isso `PATCH` com "só o que mudou". Aqui é um **formulário com botão Salvar**: a tela sempre manda o app inteiro. `PUT` diz isso no contrato e simplifica a API: não existe "o campo veio ou não veio", e a origem e o ícone são recalculados sempre do mesmo jeito.

O `slug` fica fora do `PUT`: ele é o identificador usado nas rotas do painel (`/admin/users/:id/apps/:slug`) e não muda depois de criado.

---

## Parte 1 — API

### 🛠️ Passo 1 — Contratos (`packages/contracts/src/index.ts`)

No fim do arquivo:

```ts
/** Níveis de um app novo. Número maior = mais permissão. */
export const DEFAULT_APP_LEVELS: AppLevel[] = [
  { level: 1, label: "Leitura" },
  { level: 2, label: "Edição" },
  { level: 3, label: "Admin" },
];

/** Ícone de quem não informou um: o favicon.svg na raiz da URL do app. */
export function defaultIconUrl(url: string) {
  return `${url.trim().replace(/\/+$/, "")}/favicon.svg`;
}

// Só http(s): url e iconUrl viram href/src no launcher, e um "javascript:..." ali executaria código.
const httpUrlSchema = z.url({
  protocol: /^https?$/,
  error: "Use um endereço que comece com http:// ou https://.",
});

const appSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Use pelo menos 2 caracteres.")
  .max(40, "Use no máximo 40 caracteres.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífen (ex.: gemeo-digital).");

/** Vazio = usar o favicon.svg do app (a API resolve ao gravar). */
const iconUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || httpUrlSchema.safeParse(value).success,
    "Deixe vazio ou use um endereço http:// ou https://.",
  );

const appLevelSchema = z.object({
  level: z.number().int().positive(),
  label: z.string().trim().min(1, "Dê um nome ao nível.").max(20, "Use no máximo 20 caracteres."),
});

/** 1, 2, 3… em ordem: o número vai no token e os apps comparam "level >= 2". */
const appLevelsSchema = z
  .array(appLevelSchema)
  .min(1, "O aplicativo precisa de pelo menos um nível.")
  .max(5, "Use no máximo 5 níveis.")
  .refine(
    (levels) => levels.every((option, index) => option.level === index + 1),
    "Os níveis precisam ser 1, 2, 3…, em ordem.",
  );

/** Body de POST /api/admin/apps. A origem não vem da tela: a API tira da URL. */
export const createAppSchema = z.object({
  slug: appSlugSchema,
  name: z.string().trim().min(2, "Informe o nome do aplicativo.").max(60, "Use no máximo 60 caracteres."),
  url: z.string().trim().pipe(httpUrlSchema),
  iconUrl: iconUrlSchema,
  levels: appLevelsSchema,
  isActive: z.boolean(),
});
export type CreateAppInput = z.infer<typeof createAppSchema>;

/** Body de PUT /api/admin/apps/:id. O app inteiro, menos o slug, que não muda depois de criado. */
export const updateAppSchema = createAppSchema.omit({ slug: true });
export type UpdateAppInput = z.infer<typeof updateAppSchema>;

/** Um app no painel: o que a tela edita, mais a origem e quantas pessoas têm acesso. */
export type AdminApp = LauncherApp & {
  id: string;
  origin: string;
  levels: AppLevel[];
  isActive: boolean;
  userCount: number;
};
```

Depois: `pnpm --filter @sondohub/contracts build`.

- **`trim().toLowerCase()` antes do `.regex`:** "  Gemeo " vira `gemeo` e passa. É o mesmo cuidado do `emailSchema`: a transformação vem antes da checagem.
- **`iconUrl` com `refine`, não `z.union`:** a união devolve um "entrada inválida" genérico quando as duas opções falham. O `refine` deixa escrever a mensagem que a pessoa precisa ler.
- **Sem `.default()` nos schemas:** o padrão dos níveis e do ativo fica nos valores iniciais do formulário (Passo 7). Com `.default()`, o tipo de entrada e o de saída do schema ficariam diferentes, e o `useForm` passaria a pedir os dois tipos só por causa disso.
- **`DEFAULT_APP_LEVELS` e `defaultIconUrl` no `contracts`:** a API e o hub usam os dois. Escritos num lugar só, não divergem.

### 🛠️ Passo 2 — Repositório (`modules/apps/apps.repository.ts`)

O `AppsRepository` já fala com a tabela `applications`. As consultas do painel entram nele.

```ts
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AdminApp, AppLevel, CreateAppInput, LauncherApp } from '@sondohub/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';

/** O que o banco grava: o que veio da tela + a origem que a API calculou. */
export type AppData = CreateAppInput & { origin: string };

const adminAppSelect = {
  id: true,
  slug: true,
  name: true,
  iconUrl: true,
  url: true,
  origin: true,
  levels: true,
  isActive: true,
  _count: { select: { access: true } }, // quantas linhas em user_app_access: um COUNT, não a lista.
} satisfies Prisma.ApplicationSelect;

type AdminAppRow = Prisma.ApplicationGetPayload<{ select: typeof adminAppSelect }>;

function toAdminApp({ _count, levels, ...app }: AdminAppRow): AdminApp {
  return { ...app, levels: levels as AppLevel[], userCount: _count.access };
}
```

E dentro da classe, depois do `findBySlug`:

```ts
  /** Todos os apps, inclusive os inativos: o painel precisa vê-los para reativar. */
  async listAdmin(): Promise<AdminApp[]> {
    const apps = await this.prisma.application.findMany({
      select: adminAppSelect,
      orderBy: { name: 'asc' },
    });
    return apps.map(toAdminApp);
  }

  async findAdminDetail(id: string): Promise<AdminApp | null> {
    const app = await this.prisma.application.findUnique({ where: { id }, select: adminAppSelect });
    return app && toAdminApp(app);
  }

  async findIdByOrigin(origin: string): Promise<string | null> {
    const app = await this.prisma.application.findUnique({ where: { origin }, select: { id: true } });
    return app?.id ?? null;
  }

  /** Grava o app e devolve o id. */
  async create(data: AppData): Promise<string> {
    const app = await this.prisma.application.create({ data, select: { id: true } });
    return app.id;
  }

  async update(id: string, data: Omit<AppData, 'slug'>): Promise<void> {
    await this.prisma.application.update({ where: { id }, data });
  }

  /** O maior nível que alguém tem neste app (0 = ninguém tem acesso). */
  async highestLevelInUse(applicationId: string): Promise<number> {
    const { _max } = await this.prisma.userAppAccess.aggregate({
      where: { applicationId },
      _max: { level: true },
    });
    return _max.level ?? 0;
  }
```

- **`adminAppSelect` + `toAdminApp`:** a lista e o detalhe devolvem o mesmo formato. Com o select e a conversão escritos uma vez, as duas consultas não divergem.
- **`_count` em vez de trazer os acessos:** a lista só mostra "3 pessoas". O Prisma faz um `COUNT` no banco, e nenhuma linha de acesso sai de lá.
- **`highestLevelInUse` com `aggregate`:** a pergunta é "existe alguém acima do nível N?". Um `MAX` responde com um número, sem carregar ninguém.

### 🛠️ Passo 3 — Service (`modules/apps/admin-apps.service.ts`, novo)

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AdminApp,
  type CreateAppInput,
  defaultIconUrl,
  type UpdateAppInput,
} from '@sondohub/contracts';
import { AppsRepository } from './apps.repository.js';

@Injectable()
export class AdminAppsService {
  constructor(private readonly apps: AppsRepository) {}

  async getDetail(id: string): Promise<AdminApp> {
    const app = await this.apps.findAdminDetail(id);
    if (!app) throw new NotFoundException('Aplicativo não encontrado.');
    return app;
  }

  async create(input: CreateAppInput): Promise<AdminApp> {
    const data = withDerivedFields(input);
    if (await this.apps.findBySlug(data.slug))
      throw conflict('slug', 'Já existe um aplicativo com esse identificador.');
    await this.assertOriginFree(data.origin);

    const id = await this.apps.create(data);
    return this.getDetail(id);
  }

  async update(id: string, input: UpdateAppInput): Promise<AdminApp> {
    await this.getDetail(id); // 404 claro, em vez do erro do Prisma ao atualizar quem não existe.
    const data = withDerivedFields(input);
    await this.assertOriginFree(data.origin, id);
    await this.assertLevelsCoverUsers(id, data.levels.length);

    await this.apps.update(id, data);
    return this.getDetail(id);
  }

  /** A origem identifica o app no SSO: com dois apps nela, o hub não saberia de qual é o token. */
  private async assertOriginFree(origin: string, appId?: string) {
    const ownerId = await this.apps.findIdByOrigin(origin);
    if (ownerId && ownerId !== appId)
      throw conflict('url', 'Já existe um aplicativo nesse endereço.');
  }

  /** Tirar um nível que alguém usa deixaria essa pessoa com um nível que o app não tem. */
  private async assertLevelsCoverUsers(appId: string, levelCount: number) {
    const highest = await this.apps.highestLevelInUse(appId);
    if (highest > levelCount)
      throw conflict('levels', `Há pessoas no nível ${highest}. Mude o nível delas antes de remover.`);
  }
}

/** Origem e ícone padrão saem da URL: a tela não precisa (nem deve) mandar. */
function withDerivedFields<T extends UpdateAppInput>(input: T) {
  return {
    ...input,
    iconUrl: input.iconUrl || defaultIconUrl(input.url),
    origin: new URL(input.url).origin,
  };
}

/** 409 dizendo qual campo bateu: a tela mostra a mensagem embaixo dele. */
function conflict(field: string, message: string) {
  return new ConflictException({ field, message });
}
```

**A ordem é a mesma do `create` de usuário (aula 11):** primeiro tudo que pode recusar, **depois** a gravação. Um pedido inválido nunca escreve no banco.

**Por que `withDerivedFields` é genérica (`<T extends UpdateAppInput>`):** o `create` recebe o app com `slug` e o `update` sem. A mesma função serve aos dois e devolve o tipo certo para cada um. A regra de origem e ícone fica escrita uma vez.

**Por que o 409 leva `field`:** neste formulário, dois campos podem bater (identificador e endereço). Um 409 sem mais nada obrigaria a tela a dizer "um dos dois já existe". Com `{ field, message }`, a mensagem aparece embaixo do campo certo. Passando um objeto para a `ConflictException`, o Nest devolve exatamente esse objeto como corpo da resposta.

**Por que conferir slug e origem antes, se as colunas já são `@unique`:** como na aula 11, o índice é a **garantia** e a checagem é a **mensagem**. Sem ela, o Prisma lança `P2002` e a resposta é 500.

### 🛠️ Passo 4 — Rotas (`modules/apps/admin-apps.controller.ts`, novo)

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import {
  type CreateAppInput,
  createAppSchema,
  type UpdateAppInput,
  updateAppSchema,
} from '@sondohub/contracts';
import { MasterGuard } from '../../common/auth/master.guard.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { ZodValidationPipe } from '../../common/auth/zod-validation.pipe.js';
import { AdminAppsService } from './admin-apps.service.js';
import { AppsRepository } from './apps.repository.js';

@Controller('admin/apps')
@UseGuards(SessionGuard, MasterGuard)
export class AdminAppsController {
  constructor(
    private readonly apps: AppsRepository,
    private readonly admin: AdminAppsService,
  ) {}

  /** O catálogo inteiro, com quantas pessoas têm acesso a cada app. */
  @Get()
  list() {
    return this.apps.listAdmin();
  }

  /** Cadastra o app. Origem e ícone padrão saem da URL. */
  @Post()
  create(@Body(new ZodValidationPipe(createAppSchema)) body: CreateAppInput) {
    return this.admin.create(body);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getDetail(id);
  }

  /** Grava o app inteiro (menos o slug). */
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAppSchema)) body: UpdateAppInput,
  ) {
    return this.admin.update(id, body);
  }
}
```

Mesmo desenho do `AdminUsersController`: `SessionGuard` → `MasterGuard` na classe inteira, `ZodValidationPipe` no body, `ParseUUIDPipe` no id. A listagem vai direto ao repositório porque não tem regra nenhuma (é o que o `list()` de usuários também faz).

**Se o body do `PUT` trouxer `slug`:** o `z.object` do Zod descarta chaves que não estão no schema. O slug some antes de chegar ao service, sem erro.

### 🛠️ Passo 5 — Módulo (`modules/apps/apps.module.ts`)

```ts
import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/session.module.js';
import { AdminAppsController } from './admin-apps.controller.js';
import { AdminAppsService } from './admin-apps.service.js';
import { AppsRepository } from './apps.repository.js';

@Module({
  imports: [SessionsModule], // o SessionGuard precisa do SessionsService.
  controllers: [AdminAppsController],
  providers: [AppsRepository, AdminAppsService],
  exports: [AppsRepository],
})
export class AppsModule {}
```

O `AppModule` não muda: o `AppsModule` já entra pelo `AccountModule` e pelo `SsoModule`, e o Nest registra os controllers de todo módulo que estiver na árvore. É o mesmo caminho pelo qual o `AdminUsersController` funciona hoje (via `AuthModule` → `UsersModule`).

## ✅ Checkpoint da API

Logado como Master no hub, no console do navegador:

```js
const post = (body) =>
  fetch("/api/admin/apps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => [r.status, await r.json()]);

const base = {
  slug: "  Teste ", name: "App Teste", url: "http://localhost:5199/", iconUrl: "",
  levels: [{ level: 1, label: "Leitura" }, { level: 2, label: "Edição" }, { level: 3, label: "Admin" }],
  isActive: true,
};

await post(base);
```

1. Primeira vez → **201**, com `slug: "teste"`, `origin: "http://localhost:5199"` e `iconUrl: "http://localhost:5199/favicon.svg"`.
2. A mesma chamada de novo → **409** `{ field: "slug", … }`.
3. `{ ...base, slug: "outro" }` → **409** `{ field: "url", … }` (mesma origem).
4. `{ ...base, slug: "x2", url: "javascript:alert(1)" }` → **400**.
5. `{ ...base, slug: "x3", url: "http://localhost:5198", levels: [{ level: 1, label: "A" }, { level: 3, label: "B" }] }` → **400** "Os níveis precisam ser 1, 2, 3…".
6. Libere o app novo para um usuário no nível 3 (tela do usuário) e mande um `PUT /api/admin/apps/:id` com só 2 níveis → **409** `{ field: "levels", … }`.
7. `GET /api/admin/apps` → o app aparece com `userCount: 1`.
8. Logado como Admin ou User → **403**. Deslogado → **401**.

---

## Parte 2 — Hub

### 🎨 O desenho, antes do código

A tela segue o painel de usuários: mesmos tokens (`primary`, `section`, `line-subtle`, degradês `g-*`), mesma Plus Jakarta Sans, mesmos raios de 10 e 14px, mesmo cabeçalho e rodapé de formulário. Nada de cor ou fonte nova.

O que dá personalidade a esta tela é **uma coisa só**: a **prévia ao vivo**. Quem cadastra um app quer saber como ele vai aparecer para as pessoas, e a resposta está em duas telas que já existem: o card do launcher e o seletor de permissão do cadastro de usuário. A prévia mostra **os dois de verdade**, atualizando a cada tecla. O `AppAccessCard` da prévia é o mesmo componente da tela de usuário, não uma cópia.

O segundo detalhe é o editor de níveis como **escada**: cada nível tem o número numa pastilha cuja cor fica mais forte conforme sobe (`primary-soft` → `g-azure` → `g-royal` → `g-deep`). A numeração aqui é informação, não enfeite: é o número que vai no token.

```
┌ Sidebar ┐  ‹ Catálogo
│         │  Novo aplicativo
│ Catálogo│  Cadastre o endereço e os níveis…
│ (ativo) │
│         │  ┌─ formulário ─────────────────────┐  ┌─ Como as pessoas vão ver ─┐
│         │  │ Dados        [Nome] [Identific.] │  │ No launcher               │
│         │  │ Endereço     [URL do app]        │  │ ┌──────────────────────┐ │
│         │  │              [URL do ícone]      │  │ │ ▣  App Teste          │ │
│         │  │ Níveis   (1) [Leitura]           │  │ │    localhost:5199     │ │
│         │  │          (2) [Edição]            │  │ └──────────────────────┘ │
│         │  │          (3) [Admin]        [×]  │  │ No cadastro de usuário    │
│         │  │          + Adicionar nível 4     │  │ ┌──────────────────────┐ │
│         │  │ Status   Disponível      [●══]   │  │ │ ▣ App Teste     [●═] │ │
│         │  └──────────────────────────────────┘  │ │ Leitura|Edição|Admin  │ │
│         │  ─────────────────── [Cancelar] [Criar] └──────────────────────────┘
└─────────┘                                         (sticky no desktop; no celular desce para baixo do form)
```

Texto da tela no vocabulário de quem usa: "Identificador" e não "slug", "Disponível para as pessoas" e não "is_active", "pessoas" e não "registros".

### 🛠️ Passo 6 — Chamadas (`lib/api.ts`)

O `ApiError` passa a carregar o corpo da resposta, para a tela ler o `{ field, message }` do 409:

```ts
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`A API respondeu ${status}`);
    this.status = status;
    this.body = body;
  }
}
```

```ts
  // Corpo de erro é opcional: um 502 do proxy pode nem ser JSON.
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
```

Importe `AdminApp`, `CreateAppInput` e `UpdateAppInput` do `contracts` e acrescente ao `hubApi`:

```ts
  adminApps: () => request<AdminApp[]>("/admin/apps"),
  adminApp: (id: string) => request<AdminApp>(`/admin/apps/${id}`),
  createAdminApp: (input: CreateAppInput) =>
    request<AdminApp>("/admin/apps", { method: "POST", body: JSON.stringify(input) }),
  updateAdminApp: (id: string, input: UpdateAppInput) =>
    request<AdminApp>(`/admin/apps/${id}`, { method: "PUT", body: JSON.stringify(input) }),
```

O `body` é `unknown` de propósito: quem lê precisa dizer o formato que espera (Passo 7). Nada muda para quem já usa `ApiError` só pelo `status`.

### 🛠️ Passo 7 — Regras do formulário (`features/admin/app-form.ts`, novo)

Tudo que é regra e não é desenho fica fora dos componentes:

```ts
import { DEFAULT_APP_LEVELS, defaultIconUrl, type AdminApp, type CreateAppInput } from "@sondohub/contracts";
import { ApiError } from "@/lib/api.ts";

/** Um app novo: ativo e com os três níveis padrão. */
export const NEW_APP: CreateAppInput = {
  slug: "",
  name: "",
  url: "",
  iconUrl: "",
  levels: DEFAULT_APP_LEVELS,
  isActive: true,
};

/** O app no formato do formulário. Ícone padrão vira campo vazio: se a URL mudar, o ícone acompanha. */
export function toFormValues({ slug, name, url, iconUrl, levels, isActive }: AdminApp): CreateAppInput {
  return { slug, name, url, levels, isActive, iconUrl: iconUrl === defaultIconUrl(url) ? "" : iconUrl };
}

/** O ícone que a prévia mostra. Enquanto a URL não é uma URL, nenhum (sem pedir imagem a cada tecla). */
export function previewIconUrl(url: string, iconUrl: string) {
  if (iconUrl.trim()) return iconUrl.trim();
  return URL.canParse(url) ? defaultIconUrl(url) : "";
}

type FieldConflict = { field: keyof CreateAppInput; message: string };

/** O campo que bateu num 409 da API, ou null se o erro foi outro. */
export function conflictOf(error: unknown): FieldConflict | null {
  return error instanceof ApiError && error.status === 409 ? (error.body as FieldConflict) : null;
}
```

**O detalhe do `toFormValues`:** a API grava o ícone padrão por extenso (`https://x.com/favicon.svg`). Se o formulário de edição mostrasse esse valor, a pessoa trocaria a URL do app e o ícone continuaria apontando para o endereço antigo. Mostrando o campo vazio quando o ícone é o padrão, ao salvar a API recalcula a partir da URL nova.

### 🛠️ Passo 8 — Componentes pequenos

**`components/BackLink.tsx` (novo).** O "‹ Usuários" já está copiado em duas telas e as de apps seriam mais duas. Na quarta vez, vira componente:

```tsx
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";

export default function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 self-start rounded-[10px] py-2 pr-3 pl-2 text-sm font-semibold text-ink-nav no-underline transition-colors hover:bg-secondary hover:text-foreground"
    >
      <ChevronLeft className="size-[18px]" aria-hidden />
      {label}
    </Link>
  );
}
```

> As telas de usuário podem passar a usar o `BackLink` quando você mexer nelas. Não é obrigatório para esta aula.

**`features/admin/components/AppIcon.tsx` (novo).** O ícone do app com plano B: se a imagem não existir, mostra a inicial sobre o degradê.

```tsx
import { useState } from "react";
import { cn } from "../../../lib/utils.ts";

type AppIconProps = { name: string; src: string; className?: string };

/** O ícone do app; se não carregar (ou não houver), a inicial sobre o degradê. */
export default function AppIcon({ name, src, className }: AppIconProps) {
  // Guarda QUAL src falhou: quando o src muda, a imagem nova ganha outra chance, sem useEffect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src)
    return (
      <span
        aria-hidden
        className={cn("flex shrink-0 items-center justify-center bg-g-royal font-extrabold text-white", className)}
      >
        {name.trim()[0]?.toUpperCase() ?? "?"}
      </span>
    );

  return <img src={src} alt="" onError={() => setFailedSrc(src)} className={cn("shrink-0 object-cover", className)} />;
}
```

**Por que `failedSrc` e não `failed: boolean`:** com um booleano, depois que uma URL falha, a pessoa corrige o endereço e a imagem nunca mais é tentada (o `true` ficou preso). Guardando qual endereço falhou, a comparação `failedSrc === src` "reseta" sozinha quando o `src` muda.

**`AppAccessList.tsx`: exporte o card.** Troque `function AppAccessCard` por `export function AppAccessCard`. É só isso: a prévia passa a usar o card de verdade.

### 🛠️ Passo 9 — Editor de níveis (`features/admin/components/LevelsEditor.tsx`, novo)

```tsx
import type { CreateAppInput } from "@sondohub/contracts";
import { Plus, X } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "../../../components/ui/field.tsx";
import { Input } from "../../../components/ui/input.tsx";
import { cn } from "../../../lib/utils.ts";

/** Mesmo limite do schema: mais que isso não cabe no seletor do cadastro de usuário. */
const MAX_LEVELS = 5;

/** Mais permissão, cor mais forte. Do 4 em diante, a mais forte. */
const LEVEL_TONES = [
  "bg-primary-soft text-link",
  "bg-g-azure text-white",
  "bg-g-royal text-white",
  "bg-g-deep text-white",
];

export default function LevelsEditor({ form }: { form: UseFormReturn<CreateAppInput> }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "levels" });
  const errors = form.formState.errors.levels;
  const lastIndex = fields.length - 1;

  return (
    <section aria-labelledby="levels-title" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h2 id="levels-title" className="text-lg font-bold">
          Níveis de permissão
        </h2>
        <p className="text-sm text-muted-foreground">
          Número maior, mais permissão. O que cada nível libera, o próprio aplicativo decide.
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {fields.map((field, index) => (
          <li key={field.id} className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-[10px] text-sm font-extrabold",
                LEVEL_TONES[Math.min(index, LEVEL_TONES.length - 1)],
              )}
            >
              {index + 1}
            </span>
            <Field data-invalid={!!errors?.[index]?.label} className="flex-1">
              <FieldLabel htmlFor={`level-${index}`} className="sr-only">
                Nome do nível {index + 1}
              </FieldLabel>
              <Input
                id={`level-${index}`}
                aria-invalid={!!errors?.[index]?.label}
                className="h-11 rounded-[10px] bg-background"
                {...form.register(`levels.${index}.label`)}
              />
              <FieldError errors={[errors?.[index]?.label]} />
            </Field>
            {/* Só o último sai: tirar um do meio renumeraria os de cima. */}
            {index === lastIndex && index > 0 ? (
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remover o nível ${index + 1}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-ink-placeholder transition-colors hover:bg-danger-hover hover:text-danger-text"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            ) : (
              <span className="size-11 shrink-0" aria-hidden />
            )}
          </li>
        ))}
      </ol>

      <FieldError errors={[errors?.root ?? errors]} />

      {fields.length < MAX_LEVELS && (
        <button
          type="button"
          onClick={() => append({ level: fields.length + 1, label: "" })}
          className="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-dashed border-line-dashed text-sm font-semibold text-ink-nav transition-colors hover:border-line-hover hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden />
          Adicionar nível {fields.length + 1}
        </button>
      )}
    </section>
  );
}
```

- **`useFieldArray`:** é o jeito do `react-hook-form` de editar uma lista. O `field.id` é uma chave estável que ele gera (não use o `index` como `key`: ao remover, o React reaproveitaria o input errado).
- **O `level` nunca é digitado:** quem adiciona grava `fields.length + 1`, e só o último sai. A lista é sempre `1, 2, 3…` sem nenhuma lógica de renumerar.
- **`<FieldError errors={[errors?.root ?? errors]} />`:** erros da lista inteira (o 409 "Há pessoas no nível 3", o "no máximo 5") podem chegar em `errors.levels.root` ou direto em `errors.levels`, conforme quem os gerou (o `setError` ou o Zod). Passando um só, o `FieldError` mostra a mensagem sem virar lista. Quando o erro é só de um rótulo, `errors.levels` não tem `message` e nada aparece aqui (aparece embaixo do rótulo).
- **O espaço vazio no lugar do ×:** mantém os inputs alinhados nas linhas que não têm botão.

### 🛠️ Passo 10 — Prévia (`features/admin/components/AppPreview.tsx`, novo)

```tsx
import type { CreateAppInput } from "@sondohub/contracts";
import { useState } from "react";
import { useWatch, type Control } from "react-hook-form";
import { previewIconUrl } from "../app-form.ts";
import { AppAccessCard } from "./AppAccessList.tsx";
import AppIcon from "./AppIcon.tsx";

export default function AppPreview({ control }: { control: Control<CreateAppInput> }) {
  const [slug, name, url, iconUrl, levels] = useWatch({
    control,
    name: ["slug", "name", "url", "iconUrl", "levels"],
  });
  // Estado só da prévia: dá para clicar no seletor e ver como fica, sem tocar no formulário.
  const [level, setLevel] = useState<number | null>(1);
  const displayName = name.trim() || "Nome do aplicativo";

  return (
    <aside aria-labelledby="preview-title" className="flex flex-col gap-5 rounded-[14px] bg-sunken p-5 lg:sticky lg:top-10 lg:self-start">
      <h2 id="preview-title" className="text-base font-bold">
        Como as pessoas vão ver
      </h2>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-label">No launcher</span>
        <div className="flex items-center gap-3.5 border border-border bg-sidebar p-5">
          <AppIcon name={displayName} src={previewIconUrl(url, iconUrl)} className="size-13 rounded-[14px] text-xl" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-[17px] font-bold">{displayName}</span>
            <span className="truncate text-xs font-semibold text-muted-foreground">{url || "Endereço do aplicativo"}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-label">No cadastro de usuário</span>
        <AppAccessCard
          app={{ slug: slug || "preview", name: displayName, levels }}
          colorClassName="bg-g-sky"
          level={level}
          onLevelChange={setLevel}
        />
      </div>
    </aside>
  );
}
```

- **`useWatch` com `name: [...]`:** a prévia redesenha só quando esses campos mudam, e o formulário em volta não redesenha a cada tecla por causa dela.
- **O card do launcher é uma réplica pequena do `AppCard`**, não o componente: o `AppCard` do launcher pede favorito, categoria e link, coisas que não existem aqui. Se o card do launcher mudar de visual, atualize a prévia junto.

### 🛠️ Passo 11 — O formulário (`features/admin/components/AppForm.tsx`, novo)

Um componente para criar **e** editar: os campos, as validações e a prévia são os mesmos. Só mudam os valores iniciais, o texto do botão e o slug travado.

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { createAppSchema, type CreateAppInput } from "@sondohub/contracts";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router";
import Switch from "../../../components/Switch.tsx";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field.tsx";
import { Input } from "../../../components/ui/input.tsx";
import { cn } from "../../../lib/utils.ts";
import { conflictOf } from "../app-form.ts";
import AppPreview from "./AppPreview.tsx";
import LevelsEditor from "./LevelsEditor.tsx";

type AppFormProps = {
  defaultValues: CreateAppInput;
  isEditing: boolean;
  submitLabel: string;
  /** Grava. Se lançar erro, o formulário mostra a mensagem e continua preenchido. */
  onSubmit: (input: CreateAppInput) => Promise<void>;
};

const INPUT_CLASS = "h-11 rounded-[10px] bg-background";

export default function AppForm({ defaultValues, isEditing, submitLabel, onSubmit }: AppFormProps) {
  const form = useForm({ resolver: zodResolver(createAppSchema), defaultValues });
  const { errors, isSubmitting } = form.formState;

  async function submit(input: CreateAppInput) {
    try {
      await onSubmit(input);
    } catch (error) {
      const conflict = conflictOf(error);
      if (conflict) return form.setError(conflict.field, { message: conflict.message });
      form.setError("root", { message: "Não deu para salvar o aplicativo. Tente de novo." });
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(submit)}
      noValidate
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="flex flex-col gap-8">
        <section aria-labelledby="data-title" className="flex flex-col gap-3.5">
          <h2 id="data-title" className="text-lg font-bold">
            Dados
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Nome</FieldLabel>
              <Input id="name" placeholder="Ex.: Gêmeo Digital" aria-invalid={!!errors.name} className={INPUT_CLASS} {...form.register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.slug}>
              <FieldLabel htmlFor="slug">Identificador</FieldLabel>
              {/* readOnly, não disabled: input disabled sai do submit como undefined e o schema recusa. */}
              <Input
                id="slug"
                placeholder="Ex.: gemeo-digital"
                readOnly={isEditing}
                aria-invalid={!!errors.slug}
                className={cn(INPUT_CLASS, isEditing && "bg-field-readonly text-muted-foreground")}
                {...form.register("slug")}
              />
              <FieldDescription>
                {isEditing ? "Não muda depois de criado." : "Letras minúsculas, números e hífen. Não muda depois."}
              </FieldDescription>
              <FieldError errors={[errors.slug]} />
            </Field>
          </div>
        </section>

        <section aria-labelledby="address-title" className="flex flex-col gap-3.5">
          <h2 id="address-title" className="text-lg font-bold">
            Endereço
          </h2>
          <Field data-invalid={!!errors.url}>
            <FieldLabel htmlFor="url">URL do aplicativo</FieldLabel>
            <Input id="url" type="url" placeholder="https://gemeo.sondotecnica.com.br" aria-invalid={!!errors.url} className={INPUT_CLASS} {...form.register("url")} />
            <FieldDescription>O login pelo SondoHub fica liberado só para este endereço.</FieldDescription>
            <FieldError errors={[errors.url]} />
          </Field>
          <Field data-invalid={!!errors.iconUrl}>
            <FieldLabel htmlFor="iconUrl">URL do ícone</FieldLabel>
            <Input id="iconUrl" type="url" placeholder="Vazio usa o favicon.svg do aplicativo" aria-invalid={!!errors.iconUrl} className={INPUT_CLASS} {...form.register("iconUrl")} />
            <FieldError errors={[errors.iconUrl]} />
          </Field>
        </section>

        <LevelsEditor form={form} />

        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <section className="flex items-center justify-between gap-4 rounded-[14px] border border-line-subtle p-5">
              <div className="flex flex-col gap-1">
                <span className="text-base font-bold">Disponível para as pessoas</span>
                <span className="text-[13px] text-muted-foreground">
                  Desligado, o app some do launcher e o SondoHub para de fazer login nele.
                </span>
              </div>
              <Switch checked={field.value} onCheckedChange={field.onChange} label="Disponível para as pessoas" />
            </section>
          )}
        />
      </div>

      <AppPreview control={form.control} />

      <footer className="flex flex-wrap justify-end gap-2.5 border-t border-line-subtle pt-6 lg:col-span-2">
        {errors.root && (
          <p role="alert" className="mr-auto self-center text-sm font-semibold text-danger-text">
            {errors.root.message}
          </p>
        )}
        <Link
          to="/admin/aplicativos"
          className="flex h-11 items-center rounded-[10px] border border-input px-5 text-sm font-semibold text-foreground no-underline transition-colors hover:bg-secondary"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-11 rounded-[10px] bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </footer>
    </form>
  );
}
```

- **O erro da API é tratado aqui, não na página:** "enviar e mostrar o que deu errado" é trabalho do formulário, e só ele tem o `setError`. As páginas só dizem **o que** gravar e para onde ir depois.
- **409 no campo, o resto no `root`:** é a mesma decisão da aula 11, agora com o campo vindo da API (`field`).
- **Um schema só (`createAppSchema`) nas duas telas:** na edição o slug vai junto no submit, e a API descarta (Passo 4).
- **A prévia vem no DOM depois do formulário:** no celular ela desce para baixo dos campos (a grade vira uma coluna). No desktop, fica fixa ao lado (`lg:sticky`).

### 🛠️ Passo 12 — As três telas

**`features/admin/admin-apps-page.tsx` (lista):**

```tsx
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router";
import AdminShell from "./components/AdminShell.tsx";
import AppsTable from "./components/AppsTable.tsx";
import { hubApi } from "@/lib/api.ts";

export function AdminAppsPage() {
  const { data: apps = [] } = useQuery({ queryKey: ["admin", "apps"], queryFn: hubApi.adminApps });
  const activeCount = apps.filter((app) => app.isActive).length;

  return (
    <AdminShell>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-7">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-extrabold tracking-tight">Catálogo de aplicativos</h1>
            <p className="text-[15px] text-muted-foreground">
              {activeCount} de {apps.length} disponíveis para as pessoas
            </p>
          </div>
          <Link
            to="/admin/aplicativos/novo"
            className="flex h-11 items-center gap-2 rounded-[10px] bg-primary px-[18px] text-sm font-bold text-primary-foreground no-underline transition hover:brightness-110"
          >
            <Plus className="size-[18px]" strokeWidth={2.2} aria-hidden />
            Novo aplicativo
          </Link>
        </header>

        <AppsTable apps={apps} />
      </div>
    </AdminShell>
  );
}
```

**Sem filtros nem busca, de propósito:** o catálogo tem poucos apps, e a tabela inteira cabe na tela. A lista de usuários precisa de filtro porque cresce com a empresa; o catálogo cresce com os sistemas.

**`features/admin/components/AppsTable.tsx`:** a mesma moldura do `UsersTable`, com as colunas do app:

```tsx
import type { AdminApp, AppLevel } from "@sondohub/contracts";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { cn } from "../../../lib/utils.ts";
import AppIcon from "./AppIcon.tsx";

export default function AppsTable({ apps }: { apps: AdminApp[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line-subtle bg-sidebar">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line-divider text-xs font-bold tracking-wider text-ink-label uppercase">
            <th className="px-5 py-3.5 font-bold">Aplicativo</th>
            <th className="px-5 py-3.5 font-bold">Níveis</th>
            <th className="px-5 py-3.5 font-bold">Pessoas</th>
            <th className="px-5 py-3.5 font-bold">Status</th>
            <th className="w-12 px-5 py-3.5">
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <AppRow key={app.id} app={app} />
          ))}
        </tbody>
      </table>

      {apps.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          Nenhum aplicativo ainda. Cadastre o primeiro em “Novo aplicativo”.
        </p>
      )}
    </div>
  );
}

function AppRow({ app }: { app: AdminApp }) {
  return (
    <tr className="relative border-b border-line-divider/60 transition-colors last:border-b-0 hover:bg-card">
      <td className="px-5 py-3.5">
        <div className={cn("flex items-center gap-3", !app.isActive && "opacity-60")}>
          <AppIcon name={app.name} src={app.iconUrl} className="size-9 rounded-[10px] text-[13px]" />
          <div className="flex min-w-0 flex-col gap-0.5">
            {/* O ::after estica o link pela linha inteira: clicar em qualquer ponto abre o app. */}
            <Link
              to={`/admin/aplicativos/${app.id}`}
              className="text-sm font-semibold text-foreground no-underline outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
            >
              {app.name}
            </Link>
            <span className="truncate text-[13px] text-muted-foreground">{app.url}</span>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <LevelsSummary levels={app.levels} />
      </td>
      <td className="px-5 py-3.5 text-[13px] text-ink-body">
        {app.userCount === 1 ? "1 pessoa" : `${app.userCount} pessoas`}
      </td>
      <td className="px-5 py-3.5">
        <span className="flex items-center gap-2 text-[13px] text-ink-body">
          <span className={cn("size-2 rounded-full", app.isActive ? "bg-online" : "bg-ink-placeholder")} aria-hidden />
          {app.isActive ? "Ativo" : "Inativo"}
        </span>
      </td>
      <td className="px-5 py-3.5 text-ink-placeholder">
        <ChevronRight className="size-[18px]" aria-hidden />
      </td>
    </tr>
  );
}

/** Os rótulos do menor para o maior nível: lê como a escada que são. */
function LevelsSummary({ levels }: { levels: AppLevel[] }) {
  return (
    <ol className="flex flex-wrap gap-1">
      {levels.map((option) => (
        <li key={option.level} className="rounded-md border border-line-subtle px-2 py-0.5 text-xs font-semibold text-ink-body">
          {option.label}
        </li>
      ))}
    </ol>
  );
}
```

As pílulas de nível são só borda, sem fundo: o `hover:bg-card` da linha pintaria por baixo de um fundo `bg-card` e elas sumiriam.

**`features/admin/new-app-page.tsx`:**

```tsx
import type { CreateAppInput } from "@sondohub/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import BackLink from "../../components/BackLink.tsx";
import { NEW_APP } from "./app-form.ts";
import AdminShell from "./components/AdminShell.tsx";
import AppForm from "./components/AppForm.tsx";
import { hubApi } from "@/lib/api.ts";

export function NewAppPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function create(input: CreateAppInput) {
    await hubApi.createAdminApp(input);
    await queryClient.invalidateQueries({ queryKey: ["admin", "apps"] }); // a lista volta com ele.
    navigate("/admin/aplicativos");
  }

  return (
    <AdminShell>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8">
        <header className="flex flex-col gap-6">
          <BackLink to="/admin/aplicativos" label="Catálogo" />
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Novo aplicativo</h1>
            <p className="text-[15px] text-muted-foreground">
              Cadastre o endereço e os níveis. Depois, libere o acesso na tela de cada pessoa.
            </p>
          </div>
        </header>
        <AppForm defaultValues={NEW_APP} isEditing={false} submitLabel="Criar aplicativo" onSubmit={create} />
      </div>
    </AdminShell>
  );
}
```

**`features/admin/admin-app-page.tsx`:**

```tsx
import type { CreateAppInput } from "@sondohub/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import BackLink from "../../components/BackLink.tsx";
import { toFormValues } from "./app-form.ts";
import AdminShell from "./components/AdminShell.tsx";
import AppForm from "./components/AppForm.tsx";
import AppIcon from "./components/AppIcon.tsx";
import { hubApi } from "@/lib/api.ts";

export function AdminAppPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: app, isPending } = useQuery({
    queryKey: ["admin", "apps", id],
    queryFn: () => hubApi.adminApp(id),
    retry: false, // 404 é resposta, não falha de rede.
  });

  if (isPending)
    return (
      <AdminShell>
        <p className="text-muted-foreground">Carregando…</p>
      </AdminShell>
    );

  if (!app)
    return (
      <AdminShell>
        <div className="mx-auto flex max-w-[1240px] flex-col items-start gap-3">
          <h1 className="text-2xl font-bold">Aplicativo não encontrado</h1>
          <Link to="/admin/aplicativos">Voltar para o catálogo</Link>
        </div>
      </AdminShell>
    );

  async function save(input: CreateAppInput) {
    await hubApi.updateAdminApp(id, input);
    // Nome, ícone e níveis aparecem no catálogo, nas telas de usuário e no launcher: tudo busca de novo.
    await queryClient.invalidateQueries();
    navigate("/admin/aplicativos");
  }

  return (
    <AdminShell>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8">
        <header className="flex flex-col gap-6">
          <BackLink to="/admin/aplicativos" label="Catálogo" />
          <div className="flex flex-wrap items-center gap-5">
            <AppIcon name={app.name} src={app.iconUrl} className="size-[72px] rounded-[18px] text-2xl" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="text-3xl font-extrabold tracking-tight">{app.name}</h1>
              <span className="text-[15px] text-muted-foreground">
                {app.origin} · {app.userCount === 1 ? "1 pessoa com acesso" : `${app.userCount} pessoas com acesso`}
              </span>
            </div>
          </div>
        </header>
        <AppForm key={app.id} defaultValues={toFormValues(app)} isEditing submitLabel="Salvar alterações" onSubmit={save} />
      </div>
    </AdminShell>
  );
}
```

- **O formulário só nasce depois do `useQuery`:** assim os `defaultValues` já chegam certos. Não precisa de `form.reset` num `useEffect`. Se o React Query buscar de novo em segundo plano (foco na janela), o `useForm` ignora os `defaultValues` novos e não apaga o que a pessoa está digitando.
- **`invalidateQueries()` sem filtro:** um app editado aparece em quase toda tela do hub. Marcar tudo como velho é a forma mais simples de não esquecer nenhuma. Só as consultas que estão na tela buscam de novo na hora; as outras, quando forem abertas.
- **Aqui não é otimista** (como a aula 10): é um formulário com botão, e o erro precisa voltar para o campo com tudo preenchido. É a mesma decisão da aula 11.

### 🛠️ Passo 13 — Rotas e menu

`main.tsx`, junto das rotas de usuário:

```tsx
  { path: "/admin/aplicativos", element: <AdminAppsPage /> },
  { path: "/admin/aplicativos/novo", element: <NewAppPage /> },
  { path: "/admin/aplicativos/:id", element: <AdminAppPage /> },
```

`launcher/components/Sidebar.tsx` (importe `Blocks` do `lucide-react`):

```ts
const ADMIN_ITEMS: NavItem[] = [
  { to: "/admin/usuarios", label: "Usuários", icon: Users },
  { to: "/admin/aplicativos", label: "Catálogo", icon: Blocks },
];
```

**Por que "Catálogo" e não "Aplicativos":** o menu "Principal" já tem "Aplicativos" (o launcher). Dois itens com o mesmo nome levando a lugares diferentes confundem.

### 🛠️ Passo 14 — Adeus `FAKE_APPS` (`new-user-page.tsx`)

A tela de novo usuário passa a usar o catálogo de verdade:

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
```

```tsx
  const { data: apps = [] } = useQuery({
    queryKey: ["admin", "apps"],
    queryFn: hubApi.adminApps,
    select: (all) => all.filter((app) => app.isActive), // app inativo não se libera para ninguém.
  });
```

Apague o `import { FAKE_APPS }` e, em `fake-users.ts`, o `FAKE_APPS` inteiro. O `AdminApp` tem `slug`, `name` e `levels`, então o `AppAccessList` aceita como está.

**Por que a mesma `queryKey` da lista do catálogo:** é o mesmo dado. Quem abriu o catálogo antes já tem a resposta em cache, e o `select` filtra sem buscar de novo.

## ✅ Checkpoint da tela

1. **Catálogo** aparece no menu de administração. A lista mostra o demo e o gêmeo com níveis, pessoas e status.
2. **Novo aplicativo:** digite o nome e a URL; a prévia muda a cada tecla. Uma URL sem `favicon.svg` mostra a inicial no degradê, não uma imagem quebrada.
3. Clique no seletor da prévia: os níveis trocam, e nada muda no formulário.
4. Adicione o nível 4, renomeie, remova. O × só aparece no último, e o botão de adicionar some no quinto.
5. Crie com o slug `demo`: a mensagem aparece **embaixo do Identificador**. Com a URL do demo: **embaixo da URL**.
6. Crie um app válido: volta para o catálogo com ele na lista e com o ícone padrão gravado.
7. Abra o app: o Identificador está travado, e a URL do ícone está vazia (porque é o padrão). Troque a URL e salve: o ícone acompanha.
8. Libere o app para alguém no nível 3, volte, remova o nível 3 e salve: a mensagem "Há pessoas no nível 3…" aparece embaixo dos níveis, e o formulário continua preenchido.
9. Desligue **Disponível para as pessoas** e salve: o app some do launcher de quem tinha acesso e da tela **Novo usuário**.
10. Modo escuro e celular (375px): a prévia desce para baixo do formulário e nada vaza para o lado.

---

## ⚠️ Ficou simples de propósito

- **O CORS só lê a lista de origens quando a API sobe** (`main.ts`). Um app recém-cadastrado só consegue chamar o `POST /api/sso/token` do navegador **depois de reiniciar a API**. O SSO em si já é dinâmico (`findActiveByOrigin` consulta o banco a cada pedido), por isso desativar um app corta o login na hora. Quando reiniciar virar incômodo, o `origin` do `enableCors` vira uma função que chama `isActiveOrigin`.
- **Sem remover app.** Desativar resolve o "tirar do ar" e preserva os acessos para quando ele voltar. Se um dia precisar apagar, entra um `DELETE` com confirmação, como o de usuário.
- **Sem upload de ícone.** É uma URL, e vazio usa o `favicon.svg` que todo app Vite já tem em `public/`.
- **O ícone não é conferido pela API.** Se a URL do ícone não existir, o hub mostra a inicial (o `AppIcon`). O launcher (`MainContent`) ainda usa `<img>` direto e mostraria a imagem quebrada; trocar por `AppIcon` lá é uma linha.
- **Conflito simultâneo vira 500.** Dois Masters cadastrando o mesmo slug no mesmo segundo: o segundo passa pela checagem e bate no índice único. Os dados ficam certos; a mensagem é que fica pior. Mesmo raciocínio da aula 11.
- **A prévia do launcher é uma réplica.** Se o `AppCard` mudar, a prévia muda junto, na mão.
