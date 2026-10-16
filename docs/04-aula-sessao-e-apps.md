# Aula 04 — Rotas 2, 3 e 4: quem sou eu, meus apps e sair

> 🎯 **Objetivo:** usar a sessão criada na aula 03 em três rotas, testando **uma de cada vez**:
>
> | Rota | Devolve |
> |---|---|
> | `GET /api/me` | O usuário da sessão |
> | `GET /api/me/apps` | Os apps que ele pode acessar, **com o nível em cada um** |
> | `POST /api/auth/logout` | Encerra a sessão |
>
> **Pré-requisito:** [aula 03](03-aula-login.md) com o `cookies.txt` do checkpoint.

---

## 🧠 Conceito: um guard que lê o cookie

Toda rota desta aula precisa responder à mesma pergunta: **de quem é esta requisição?** Em vez de repetir a resposta em cada controller, ela vai para um **guard**, a peça do Nest que roda antes do controller e decide se a requisição passa:

```
requisição (cookie vai junto) → SessionGuard → controller
                                  │
                                  ├─ sem cookie / sessão inválida → 401
                                  └─ ok → pendura { sessionId, user } em req.auth
```

O guard usa o `SessionsService.validate` que você já tem. Esse método faz o hash do cookie, busca a sessão e confere se ela não foi revogada nem expirou e se o usuário está ativo. O controller recebe o resultado pelo `@CurrentAuth()`, que você também já tem.

> **Nesta aula o guard é colocado à mão** (`@UseGuards`) em cada rota protegida. Fica explícito e fácil de seguir. Na aula 08 ele vira **global**: toda rota nasce protegida, e você libera as públicas com `@Public()`.

---

## 🛠️ Passo 1 — `SessionGuard` (`common/auth/session.guard.ts`)

```ts
import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { SessionsService } from '../../modules/sessions/sessions.service.js';
import type { AuthContext } from './auth-context.js';

/** Lê o cookie, valida a sessão no banco e pendura o usuário na requisição (req.auth). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const auth = await this.sessions.validate(request.cookies[env.SESSION_COOKIE_NAME]);
    if (!auth) throw new UnauthorizedException();

    request.auth = auth;
    return true;
  }
}
```

> **Regra do Nest:** um guard usado com `@UseGuards` é criado **dentro do módulo do controller**. Por isso todo módulo cujas rotas usam o `SessionGuard` precisa importar o `SessionsModule`, que é quem fornece o `SessionsService`.

## 🛠️ Passo 2 — `GET /api/me`

**`modules/account/me.controller.ts`** (por enquanto, só a rota `me`):

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { SessionGuard } from '../../common/auth/session.guard.js';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  /** Quem é o usuário desta sessão. */
  @Get()
  me(@CurrentAuth() auth: AuthContext) {
    return auth.user;
  }
}
```

**`modules/account/account.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module.js';
import { MeController } from './me.controller.js';

@Module({
  imports: [SessionsModule],
  controllers: [MeController],
})
export class AccountModule {}
```

No `app.module.ts`, acrescente o `AccountModule` aos `imports`: `[PrismaModule, AuthModule, AccountModule]`.

**Teste agora**, antes de seguir:

```powershell
curl.exe -b cookies.txt http://localhost:3100/api/me
curl.exe -i http://localhost:3100/api/me
```

Esperado: com o cookie, o JSON do admin. Sem o cookie, `HTTP/1.1 401 Unauthorized`.

## 🛠️ Passo 3 — `GET /api/me/apps` (com o nível)

O nível está na tabela **`user_app_access`**, e não em `applications`. Então a consulta parte dos acessos do usuário e traz o app junto.

**1. Contrato.** Em `packages/contracts/src/index.ts`, o `LauncherApp` ganha o nível:

```ts
/** Um app no launcher. */
export type LauncherApp = {
  slug: string;
  name: string;
  iconUrl: string;
  url: string;
  /** Nível do usuário neste app (1 = leitura, 2 = edição, 3 = admin...). */
  level: number;
};
```

```powershell
pnpm --filter "@sondohub/contracts" build
```

**2. Repositório.** Em `modules/apps/apps.repository.ts`, troque o `listForUser`:

```ts
  /** Parte da tabela de acessos, porque é nela que está o nível do usuário em cada app. */
  async listForUser(userId: string): Promise<LauncherApp[]> {
    const accesses = await this.prisma.userAppAccess.findMany({
      where: { userId, application: { isActive: true } },
      select: {
        level: true,
        application: { select: { slug: true, name: true, iconUrl: true, url: true } },
      },
      orderBy: { application: { name: 'asc' } },
    });
    return accesses.map(({ level, application }) => ({ ...application, level }));
  }
```

O Prisma devolve `{ level, application: {…} }`, e o `map` "achata" isso no formato do contrato.

**3. Controller.** O `MeController` ganha a rota e passa a receber o `AppsRepository`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { AppsRepository } from '../apps/apps.repository.js';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly apps: AppsRepository) {}

  /** Quem é o usuário desta sessão. */
  @Get()
  me(@CurrentAuth() auth: AuthContext) {
    return auth.user;
  }

  /** Apps que ele pode acessar, com o nível em cada um. */
  @Get('apps')
  myApps(@CurrentAuth() auth: AuthContext) {
    return this.apps.listForUser(auth.user.id);
  }
}
```

E o `AccountModule` importa o `AppsModule`: `imports: [SessionsModule, AppsModule]`.

**Teste agora:**

```powershell
curl.exe -b cookies.txt http://localhost:3100/api/me/apps
```

Esperado (testado):

```json
[{"slug":"demo","name":"App Demo","iconUrl":"http://localhost:5181/favicon.svg","url":"http://localhost:5181","level":3}]
```

Agora entre como o leitor e repita. O mesmo app aparece com **`"level":1`**: é o nível **por app** funcionando.

```powershell
curl.exe -s -o NUL -c cookies.txt -X POST http://localhost:3100/api/auth/login -H "Content-Type: application/json" -d '{"email":"leitor@sondotecnica.com.br","password":"troque-esta-senha"}'
curl.exe -b cookies.txt http://localhost:3100/api/me/apps
```

## 🛠️ Passo 4 — `POST /api/auth/logout`

Sair é revogar a sessão no banco e apagar o cookie. O `AuthController` completo fica assim:

```ts
import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { LoginInput } from '@sondohub/contracts';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { clearSessionCookie, setSessionCookie } from '../sessions/session-cookie.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.auth.login(body, {
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    setSessionCookie(res, token);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
    clearSessionCookie(res);
  }
}
```

> **Por que revogar no banco, e não só apagar o cookie?** Apagar o cookie só limpa **este** navegador. Se alguém tiver copiado o token, ele continuaria valendo por 30 dias. Com o `revoked_at` preenchido, o `validate` recusa o token em qualquer lugar.

**Teste agora**, provando que o **mesmo token** deixa de valer:

```powershell
$token = (Select-String 'sondohub_session\s+(\S+)' cookies.txt).Matches.Groups[1].Value
curl.exe -s -o NUL -w "antes: %{http_code}`n" -b "sondohub_session=$token" http://localhost:3100/api/me
curl.exe -s -o NUL -w "logout: %{http_code}`n" -b cookies.txt -c cookies.txt -X POST http://localhost:3100/api/auth/logout
curl.exe -s -o NUL -w "depois: %{http_code}`n" -b "sondohub_session=$token" http://localhost:3100/api/me
```

Esperado (testado): `antes: 200`, `logout: 204`, `depois: 401`.

---

## ✅ Checkpoint

| Teste | Esperado |
|---|---|
| `GET /api/me` com cookie | JSON do usuário, sem hash |
| `GET /api/me` sem cookie | 401 |
| `GET /api/me/apps` como admin | `demo` com `level: 3` |
| `GET /api/me/apps` como leitor | `demo` com `level: 1` |
| Logout, depois o mesmo token | 204, depois 401; `revoked_at` preenchido no banco |

## ⏳ O que ficou para depois

- **`@UseGuards` em cada lugar:** se você esquecer numa rota nova, ela fica aberta. Na aula 08 o guard vira global.
- **O logout só aceita a chamada do próprio hub (ainda):** na aula 07, os apps também vão chamá-lo, e para isso entra o CORS da aula 06.

## 🏋️ Exercício

Por que o `listForUser` filtra `application: { isActive: true }`, se o acesso do usuário existe?

<details>
<summary>Resposta</summary>

Porque desativar um app no hub precisa tirá-lo do launcher de **todo mundo** de uma vez, sem apagar os acessos. Assim, reativar o app devolve os mesmos níveis de antes.

</details>

➡️ Próximo: [05 — Hub: tela de login e launcher](05-aula-hub-front.md)
