# 11 — Criar usuário: `POST /api/admin/users`

> 🎯 **Objetivo:** a tela `/admin/usuarios/novo` (`new-user-page.tsx`) para de fazer `console.info` e cria o usuário de verdade, com cargo e apps liberados, numa chamada só. **Só o Master** consegue.
>
> | Rota | Body | Resposta |
> |---|---|---|
> | `POST /api/admin/users` | `{ name, email, role, apps: [{ slug, level }] }` | **201** com o `AdminUserDetail` do usuário criado |
> | | e-mail já cadastrado | **409** |
> | | app inexistente / nível que o app não tem | **404** / **400** |
> | | quem chama não é Master | **403** |

---

## 🧠 Conceito 1: o Guard "só Master" já existe

Você já escreveu esse Guard: é o `MasterGuard` (`common/auth/master.guard.ts`), e ele **já protege a rota nova**.

```ts
@Controller('admin/users')
@UseGuards(SessionGuard, MasterGuard) // ← vale para TODAS as rotas desta classe
export class AdminUsersController {
```

**Como um Guard funciona:** antes de chamar o método do controller, o Nest roda cada Guard da lista, **em ordem**. Se um deles lançar uma exceção (ou devolver `false`), o método nem chega a rodar.

| Ordem | Guard | Pergunta | Se falhar |
|---|---|---|---|
| 1 | `SessionGuard` | "Tem sessão válida?" Lê o cookie e preenche `req.auth` | **401** |
| 2 | `MasterGuard` | "O `req.auth.user.role` é `MASTER`?" | **403** |

A **ordem importa**: o `MasterGuard` lê o `req.auth` que o `SessionGuard` preencheu. Invertidos, o `req.auth` estaria vazio e todo mundo levaria 403.

**Por que não criar um Guard novo (ex.: `@Roles('MASTER')`):** hoje só existe uma regra ("é Master?"), e ela vale para o painel inteiro. Um `RolesGuard` genérico com decorator e metadata é útil quando **rotas diferentes** pedem **cargos diferentes** (ex.: o Admin passa a poder listar, mas não criar). Quando isso aparecer, o `MasterGuard` vira um `RolesGuard`. Antes disso, seria código para um caso que não existe.

**O que basta fazer:** colocar o `@Post()` **dentro** do `AdminUsersController`. A proteção vem junto.

## 🧠 Conceito 2: usuário novo nasce sem senha

A tela não tem campo de senha, e isso está certo. Pelo [desenho da arquitetura](01-arquitetura.md), o usuário é criado **com `password_hash = null`**. Ele define a senha pelo **link de convite** enviado por e-mail (Fase 2).

Até o convite existir, o usuário criado aqui **aparece no admin, mas não consegue logar**: o `AuthService.login` recusa hash `null`. Isso é o comportamento esperado agora, não um bug. Para testar o login de alguém criado por esta rota antes da Fase 2, defina a senha pelo seed.

**Por que o Master não digita uma senha provisória:** ele passaria a conhecer a senha de outra pessoa, e a senha teria de ser enviada por algum canal (chat, papel). O convite resolve isso, e é para lá que o desenho já aponta.

---

## 🛠️ Passo 1 — O schema sobe para o `contracts`

Hoje o `newUserSchema` mora no hub (`features/admin/new-user-schema.ts`), com o comentário "provisório". A API precisa validar **com o mesmo schema**, então ele sobe para o `packages/contracts/src/index.ts`, perto do `appAccessSchema`:

```ts
/** Um app liberado no cadastro: qual app e em que nível. */
export const appGrantSchema = appAccessSchema.extend({ slug: z.string().min(1) });

/** Body de POST /api/admin/users. */
export const createUserSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome completo.").max(120, "Use no máximo 120 caracteres."),
  email: emailSchema,
  role: userRoleSchema,
  apps: z
    .array(appGrantSchema)
    .refine((apps) => new Set(apps.map((app) => app.slug)).size === apps.length, "App repetido."),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
```

> `appGrantSchema` precisa vir **depois** do `appAccessSchema` no arquivo. E depois: `pnpm --filter @sondohub/contracts build`.

- **`appAccessSchema.extend(...)`:** o nível tem a mesma regra do `PUT …/apps/:slug` (inteiro positivo). Estendendo, a regra fica escrita num lugar só.
- **O `refine` de app repetido:** a tela nunca manda repetido (o `withGrant` troca, não duplica). Mas a API não confia na tela: dois `{ slug: "demo" }` bateriam na chave `(user_id, application_id)` e virariam **500**. Com o `refine`, viram **400** com mensagem.

No hub, **apague** `features/admin/new-user-schema.ts`. A tela passa a importar do `contracts` (Passo 6).

## 🛠️ Passo 2 — Repositório (`users.repository.ts`)

```ts
import type { AdminUser, AdminUserDetail, AppLevel, CreateUserInput, UpdateUserInput } from '@sondohub/contracts';
```

```ts
  async existsByEmail(email: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    return user !== null;
  }

  /** Cria o usuário (sem senha: ela vem pelo convite) e os acessos de uma vez. Devolve o id. */
  async create(
    { name, email, role }: Omit<CreateUserInput, 'apps'>,
    access: { applicationId: string; level: number }[],
  ): Promise<string> {
    const user = await this.prisma.user.create({
      data: { name, email, role, access: { create: access } },
      select: { id: true },
    });
    return user.id;
  }
```

**Por que `access: { create: access }` (create aninhado):** o Prisma grava o usuário e os acessos **na mesma transação**. Se um acesso falhar, o usuário também não é criado. Com dois comandos separados (`user.create` e depois `userAppAccess.createMany`), uma falha no segundo deixaria um usuário "pela metade" no banco.

**Por que `create` recebe `applicationId` e não `slug`:** o repositório só grava o que o banco entende. Transformar slug em id (e validar o nível) é regra, e fica no service.

## 🛠️ Passo 3 — Service (`admin-users.service.ts`)

A regra "o nível existe neste app?" já existe no `setAppLevel` e agora vai ser usada também na criação. Ela sai para uma função, assim a regra fica num lugar só:

```ts
/** O nível precisa ser um dos que o app oferece (coluna applications.levels). */
function assertLevelExists(levels: AppLevel[], level: number) {
  if (!levels.some((option) => option.level === level))
    throw new BadRequestException('Este app não tem esse nível.');
}
```

Coloque-a no fim do arquivo, ao lado do `assertNotSelf`. O `setAppLevel` fica assim:

```ts
  async setAppLevel(id: string, slug: string, level: number): Promise<AdminUserDetail> {
    await this.getDetail(id); // sem isso, um id inexistente estoura a chave estrangeira (500).
    const app = await this.findApp(slug);
    assertLevelExists(app.levels as AppLevel[], level);

    await this.users.upsertAccess(id, app.id, level);
    return this.getDetail(id);
  }
```

E entram os dois métodos novos (importe `ConflictException` do `@nestjs/common` e `CreateUserInput` do `contracts`):

```ts
  async create({ apps, ...data }: CreateUserInput): Promise<AdminUserDetail> {
    if (await this.users.existsByEmail(data.email))
      throw new ConflictException('Já existe um usuário com esse e-mail.');

    const access = await this.resolveAccess(apps);
    const id = await this.users.create(data, access);
    return this.getDetail(id);
  }

  /** Troca o slug pelo id do app, conferindo se o app existe e se tem o nível pedido. */
  private resolveAccess(apps: CreateUserInput['apps']) {
    return Promise.all(
      apps.map(async ({ slug, level }) => {
        const app = await this.findApp(slug);
        assertLevelExists(app.levels as AppLevel[], level);
        return { applicationId: app.id, level };
      }),
    );
  }
```

**A ordem do `create` é proposital:** primeiro tudo que pode recusar (e-mail repetido, app ou nível inválido), **depois** a gravação. Assim, um pedido inválido nunca toca no banco para escrever.

**Por que conferir o e-mail antes, se a coluna já é `@unique`:** o índice único é a **garantia** (nunca existirão dois). O `existsByEmail` é a **mensagem**: sem ele, o Prisma lança `P2002` e a API responde 500. Em dois cadastros simultâneos do mesmo e-mail, o segundo ainda pode passar pela checagem e bater no índice. Isso dá 500 em vez de 409, mas os dados continuam certos. Para um painel com um punhado de Masters, não vale tratar.

**Por que `resolveAccess` é separado:** o `create` lê como uma lista de passos ("e-mail livre? acessos válidos? grava"). Os detalhes de slug → id ficam num método com nome, que é reaproveitado por quem precisar.

**Por que devolver `getDetail(id)`:** é a mesma resposta das rotas de edição da aula 10. Quem chamou recebe o usuário completo, já no formato que a tela de detalhe usa.

## 🛠️ Passo 4 — A rota (`admin-users.controller.ts`)

Importe `Post` do `@nestjs/common` e `createUserSchema` / `CreateUserInput` do `contracts`. Coloque logo depois do `list()`:

```ts
  /** Cria o usuário com cargo e apps. Sem senha: ela é definida pelo convite. */
  @Post()
  create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput) {
    return this.admin.create(body);
  }
```

**O que acontece numa chamada, em ordem:**

```
SessionGuard (401?) → MasterGuard (403?) → ZodValidationPipe (400?) → create() → service (409/404/400?) → 201
```

O `@Post()` responde **201 Created** sozinho (é o padrão do Nest para POST), então não precisa de `@HttpCode`.

## ✅ Checkpoint da API

Logado como Master no hub, rode no console do navegador (o cookie de sessão vai junto):

```js
await fetch("/api/admin/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Teste Silva", email: "  Teste@Sondotecnica.com.br ", role: "USER", apps: [{ slug: "demo", level: 1 }] }),
}).then((r) => r.status);
```

1. A primeira vez → **201**. No DBeaver: e-mail em minúsculo e sem espaços, `password_hash` nulo, uma linha em `user_app_access`.
2. A mesma chamada de novo → **409**.
3. `apps: [{ slug: "demo", level: 99 }]` com outro e-mail → **400**, e **nenhum** usuário criado.
4. `apps: [{ slug: "nao-existe", level: 1 }]` → **404**, e nenhum usuário criado.
5. `apps` com `demo` duas vezes → **400** "App repetido.".
6. Logado como Admin ou User → **403**. Deslogado → **401**.

---

## 🛠️ Passo 5 — Hub: a chamada (`lib/api.ts`)

Importe `CreateUserInput` do `contracts`:

```ts
  createAdminUser: (input: CreateUserInput) =>
    request<AdminUserDetail>("/admin/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),
```

## 🛠️ Passo 6 — Hub: a tela (`new-user-page.tsx`)

Só mudam os imports, o schema e o `onSubmit`, mais um aviso de erro no rodapé. O resto do JSX fica igual.

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema, type CreateUserInput } from "@sondohub/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { Field, FieldError, FieldLabel } from "../../components/ui/field.tsx";
import { Input } from "../../components/ui/input.tsx";
import AdminShell from "./components/AdminShell.tsx";
import AppAccessList from "./components/AppAccessList.tsx";
import RolePicker from "./components/RolePicker.tsx";
import { FAKE_APPS } from "./fake-users.ts";
import { withGrant } from "./user-access.ts";
import { ApiError, hubApi } from "@/lib/api.ts";

export function NewUserPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const apps = FAKE_APPS; // Próxima aula: useQuery(GET /api/admin/apps).
  const form = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", role: "USER", apps: [] },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(input: CreateUserInput) {
    try {
      await hubApi.createAdminUser(input);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409)
        return form.setError("email", { message: "Já existe um usuário com esse e-mail." });
      return form.setError("root", { message: "Não deu para criar o usuário. Tente de novo." });
    }

    await queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); // a lista volta com ele.
    navigate("/admin/usuarios");
  }
```

E no `<footer>`, antes do botão "Cancelar":

```tsx
          {errors.root && (
            <p role="alert" className="mr-auto self-center text-sm font-semibold text-danger-text">
              {errors.root.message}
            </p>
          )}
```

**Por que não usar `useMutation` aqui:** o `react-hook-form` já sabe que o envio está em andamento. Como o `onSubmit` é `async`, o `isSubmitting` fica `true` até ele terminar, e o botão já usa isso para ficar desabilitado. Um `useMutation` repetiria esse estado.

**Por que o 409 vai para o campo `email` e o resto para `root`:** o 409 tem um culpado claro (o e-mail), então a mensagem aparece **embaixo do campo**, como os erros de validação. Os outros erros (rede, 500) não são culpa de nenhum campo, e o `root` é o lugar do `react-hook-form` para erro do formulário inteiro.

**Por que aqui não é otimista** (como as edições da aula 10): criar é uma ação única, de um clique, que leva para outra tela. Se desse errado depois de já ter navegado, a pessoa perderia o que digitou. Aqui, esperar é o certo.

## ✅ Checkpoint da tela

1. Preencha, ligue um app, clique **Criar usuário**: volta para a lista, e a pessoa aparece com o app liberado.
2. Repita com o mesmo e-mail: a mensagem aparece **embaixo do campo de e-mail**, e você continua na tela com tudo preenchido.
3. Derrube a API e envie: aparece o aviso no rodapé, e o botão volta a ficar clicável.

---

## ⚠️ Ficou simples de propósito

- **O usuário criado não loga até existir o convite (Fase 2).** É o desenho: senha é de quem usa.
- **A tela ainda usa `FAKE_APPS`.** Os slugs dela (`demo`, `gemeo`) batem com o seed, então funciona. Mas um app novo cadastrado no banco não aparece na tela. O próximo passo é `GET /api/admin/apps` (o catálogo com os níveis), que também tira o `FAKE_APPS` da aula 10.
- **Um `findApp` por app liberado.** São poucos apps por cadastro. Se um dia forem dezenas, troca por um `findMany({ where: { slug: { in: slugs } } })`.
- **O `MasterGuard` não muda.** Se o Admin passar a poder fazer parte disso, aí sim ele vira um `RolesGuard`.
