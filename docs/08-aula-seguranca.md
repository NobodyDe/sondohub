# Aula 08 — Fechando as portas

> 🎯 **Objetivo:** com tudo funcionando, resolver **cada item "cru"** das aulas anteriores, sem mudar o comportamento para quem usa direito.
>
> **Pré-requisito:** [aula 07](07-aula-app-consumindo-o-hub.md) funcionando no navegador.

---

## 🧠 Conceito: cada camada fecha um buraco

```
requisição → helmet → cookie-parser → CORS → ThrottlerGuard → OriginGuard → SessionGuard → ZodValidationPipe → controller
                                      (quem    (força bruta)   (CSRF)        (deny-by-       (o body é
                                      lê a                                    default)        válido?)
                                      resposta)
```

| Cru (aulas 03–07) | Camada que resolve | Passo |
|---|---|---|
| `@UseGuards` à mão: esqueceu, a rota fica aberta | `SessionGuard` **global** + `@Public()` | 1 |
| Body sem validação; `Admin@…` não entra; body vazio = 500 | `ZodValidationPipe` com o `loginSchema` | 2 |
| Tentativas ilimitadas | Rate limit por IP + bloqueio da conta | 3 |
| Email inexistente responde mais rápido | Hash falso (tempo igual) | 3 |
| Qualquer origem chama o login (CSRF) | `OriginGuard` | 4 |
| CORS em todas as rotas e lido só no boot | CORS dinâmico, só nas rotas dos apps | 4 |
| Cookie de dev | Cookie de produção (`__Host-`, `Secure`) | 6 |

---

## 🛠️ Passo 1 — Guard global (*deny-by-default*)

Hoje cada rota protegida tem `@UseGuards(SessionGuard)`. Se você criar uma rota e esquecer, ela fica **aberta**. A inversão: **toda rota nasce protegida**, e você marca as exceções com `@Public()`, o decorator que já existe em `common/auth/public.decorator.ts`. Uma rota pública passa a ser uma decisão visível no code review.

**`common/auth/session.guard.ts`** ganha o `Reflector`, que lê o `@Public()`:

```ts
import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { SessionsService } from '../../modules/sessions/sessions.service.js';
import type { AuthContext } from './auth-context.js';
import { IS_PUBLIC } from './public.decorator.js';

/** Lê o cookie, valida a sessão no banco e pendura o usuário na requisição (req.auth). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const auth = await this.sessions.validate(request.cookies[env.SESSION_COOKIE_NAME]);
    if (!auth) throw new UnauthorizedException();

    request.auth = auth;
    return true;
  }
}
```

Depois:

- **Remova** `@UseGuards(SessionGuard)` (e os imports) do `MeController`, do `SsoController` e do `logout`.
- **Acrescente `@Public()`** no `login` (passo 2) e no `JwksController`:

```ts
import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/public.decorator.js';
import { TokenService } from './token.service.js';

@Public()
@Controller('.well-known')
export class JwksController {
  constructor(private readonly tokens: TokenService) {}

  @Get('jwks.json')
  getJwks() {
    return this.tokens.getJwks();
  }
}
```

O registro global fica no `AppModule` (passo 5).

## 🛠️ Passo 2 — Validação do body (`common/zod-validation.pipe.ts`)

É o padrão da documentação do Nest para validar com schema. O schema é o `loginSchema` do `contracts`, que você já tem.

```ts
import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // Só campo e mensagem: o resto do erro do zod (regex, tipos internos) não interessa ao cliente.
      throw new BadRequestException(result.error.issues.map(({ path, message }) => ({ path, message })));
    }
    return result.data;
  }
}
```

O pipe **devolve o dado já transformado**. O `loginSchema` faz `trim` e `toLowerCase` no email, então `"  Admin@Sondotecnica.com.BR "` chega ao service como `admin@sondotecnica.com.br` e o login funciona (testado).

## 🛠️ Passo 3 — Força bruta

**Rate limit:** o `@nestjs/throttler` já está instalado. Ele conta requisições por IP: 100/min no geral (passo 5) e 10/min no login.

**Bloqueio da conta e tempo igual:** dois comportamentos novos no login. Como agora existem duas operações de senha (conferir e "fingir que confere"), elas ganham uma classe própria.

**`modules/auth/password.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

@Injectable()
export class PasswordService {
  // Hash de uma senha qualquer, usado quando o email não existe: a resposta
  // demora o mesmo tempo e não denuncia quais emails estão cadastrados.
  private readonly dummyHash = argon2.hash('senha-que-ninguem-usa');

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  async verifyDummy(password: string): Promise<void> {
    await argon2.verify(await this.dummyHash, password);
  }
}
```

**`modules/auth/auth.service.ts`**: o `if` único da aula 03 vira três casos.

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginInput } from '@sondohub/contracts';
import { SessionsService, type SessionMeta } from '../sessions/sessions.service.js';
import { UsersRepository, type SafeUser } from '../users/users.repository.js';
import { PasswordService } from './password.service.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const INVALID_CREDENTIALS = 'Email ou senha inválidos';

export type LoginResult = { token: string; user: SafeUser };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsService,
    private readonly passwords: PasswordService,
  ) {}

  /** Confere email e senha, cria a sessão e devolve o token dela junto com o usuário. */
  async login({ email, password }: LoginInput, meta: SessionMeta): Promise<LoginResult> {
    const user = await this.users.findForLogin(email);

    if (!user?.passwordHash || !user.isActive) {
      await this.passwords.verifyDummy(password);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      await this.registerFailure(user.id, user.failedLoginCount);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.users.saveLoginAttempts(user.id, 0, null);
    const { passwordHash, failedLoginCount, lockedUntil, ...safeUser } = user;
    return { token: await this.sessions.create(user.id, meta), user: safeUser };
  }

  private registerFailure(userId: string, previousFailures: number): Promise<void> {
    const failures = previousFailures + 1;
    if (failures < MAX_FAILED_LOGINS) return this.users.saveLoginAttempts(userId, failures, null);
    return this.users.saveLoginAttempts(userId, 0, new Date(Date.now() + LOCK_DURATION_MS));
  }
}
```

> Os campos `failedLoginCount` e `lockedUntil` e o método `saveLoginAttempts` **já existiam** no seu `UsersRepository`, esperando por esta aula.

**`modules/auth/auth.controller.ts`**: o login fica `@Public()`, com rate limit próprio e o pipe. O logout perde o `@UseGuards`.

```ts
import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loginSchema, type LoginInput } from '@sondohub/contracts';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { clearSessionCookie, setSessionCookie } from '../sessions/session-cookie.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { AuthService } from './auth.service.js';

const LOGIN_RATE_LIMIT = { default: { limit: 10, ttl: 60_000 } }; // 10 tentativas por minuto, por IP

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @Throttle(LOGIN_RATE_LIMIT)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
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
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
    clearSessionCookie(res);
  }
}
```

No `AuthModule`, acrescente o `PasswordService` aos `providers`.

## 🛠️ Passo 4 — CSRF e CORS dinâmico (`common/security/`)

**O buraco:** o `SameSite=Strict` impede que **outros sites** façam o navegador enviar o cookie. Só que para o navegador, qualquer `*.sondotecnica.com.br` é "o mesmo site". Um subdomínio esquecido e invadido conseguiria fazer POST no hub com o cookie da vítima. Quem diz o subdomínio exato é o header **`Origin`**, que o JavaScript não consegue falsificar.

A regra fica **num lugar só** e é usada por dois consumidores: o `OriginGuard` (bloqueia) e o CORS (decide quem lê a resposta).

**`origin-policy.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { env } from '../../config/env.js';
import { AppsRepository } from '../../modules/apps/apps.repository.js';

// Rotas que os apps (outros origins) chamam com o cookie do hub. O resto é só do próprio hub.
const APP_FACING_PATHS = new Set(['/api/sso/token', '/api/me/apps', '/api/auth/logout']);

/** Regra única de "quem pode chamar o quê", usada pelo CORS e pelo OriginGuard. */
@Injectable()
export class OriginPolicy {
  private readonly hubOrigin = new URL(env.HUB_URL).origin;

  constructor(private readonly apps: AppsRepository) {}

  async isAllowed(origin: string | undefined, path: string): Promise<boolean> {
    if (!origin) return false;
    if (origin === this.hubOrigin) return true;
    return APP_FACING_PATHS.has(path) && (await this.apps.isActiveOrigin(origin));
  }
}
```

**`origin.guard.ts`**

```ts
import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { OriginPolicy } from './origin-policy.js';

// Métodos que não alteram estado não precisam da checagem de CSRF.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly originPolicy: OriginPolicy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    if (await this.originPolicy.isAllowed(request.get('origin'), request.path)) return true;
    throw new ForbiddenException('Origem não permitida');
  }
}
```

**`cors.ts`**

```ts
import type { Request } from 'express';
import type { OriginPolicy } from './origin-policy.js';

type CorsCallback = (error: Error | null, options: { origin: boolean; credentials?: boolean }) => void;

/** CORS dinâmico com a mesma regra do OriginGuard: só apps cadastrados, só nas rotas deles. */
export function corsFor(originPolicy: OriginPolicy) {
  return (req: Request, callback: CorsCallback) => {
    originPolicy
      .isAllowed(req.get('origin'), req.path)
      .then((allowed) => callback(null, { origin: allowed, credentials: true }))
      .catch((error: Error) => callback(error, { origin: false }));
  };
}
```

> **O `CorsCallback` é tipado à mão** porque, no Nest 12, `enableCors` recebe `any`, e sem a tipagem o build dá TS7006 (testado).
>
> **CORS não é autenticação.** Ele só decide se o navegador deixa o JavaScript **ler** a resposta. Quem barra de verdade são o `OriginGuard` e o `SessionGuard`, e por isso a regra é uma só, aplicada nos dois.

**`main.ts`**: o CORS do boot (aula 06) sai, e entra o dinâmico. Um app cadastrado passa a funcionar **sem reiniciar a API**.

```ts
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { corsFor } from './common/security/cors.js';
import { OriginPolicy } from './common/security/origin-policy.js';
import { env } from './config/env.js';

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api');
app.use(helmet());
app.use(cookieParser());
app.enableCors(corsFor(app.get(OriginPolicy)));
app.enableShutdownHooks();
await app.listen(env.API_PORT);
```

O `listOrigins` do `AppsRepository` ficou sem uso: **apague**. Código morto confunde quem lê depois.

## 🛠️ Passo 5 — Montar tudo (`app.module.ts`)

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SessionGuard } from './common/auth/session.guard.js';
import { OriginPolicy } from './common/security/origin-policy.js';
import { OriginGuard } from './common/security/origin.guard.js';
import { AccountModule } from './modules/account/account.module.js';
import { AppsModule } from './modules/apps/apps.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { SessionsModule } from './modules/sessions/sessions.module.js';
import { SsoModule } from './modules/sso/sso.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // limite geral: 100 req/min por IP
    PrismaModule,
    SessionsModule,
    AppsModule,
    AuthModule,
    AccountModule,
    SsoModule,
  ],
  providers: [
    OriginPolicy,
    // Guards globais, nesta ordem: rate limit → origem (CSRF) → sessão.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
```

**Por que o `AppModule` importa o `SessionsModule` e o `AppsModule`:** os guards globais são criados aqui, e o `SessionGuard` precisa do `SessionsService`, enquanto o `OriginPolicy` precisa do `AppsRepository`.

## 🛠️ Passo 6 — Testes das regras

Três funções valem um teste: o login (regras de segurança), o `safeReturnTo` (open redirect) e o SDK (single-flight). Todas rodam sem banco e sem navegador.

**Preparação:**

```powershell
pnpm --filter ./packages/client add -D vitest
pnpm --filter hub add -D vitest
```

- **Scripts:** em `packages/client/package.json` e `apps/hub/package.json`, acrescente `"test": "vitest run"`. A API já tem o script.
- **Build do `client`:** em `packages/client/tsconfig.json`, acrescente `"exclude": ["src/**/*.test.ts"]` para os testes não irem para o `dist`.

**`apps/api/src/modules/auth/auth.service.spec.ts`**: aqui o D do SOLID fica concreto. O `AuthService` só conhece o que recebe no construtor, então o teste entrega fakes.

```ts
import { UnauthorizedException } from '@nestjs/common';
import type { SessionsService } from '../sessions/sessions.service.js';
import type { UsersRepository } from '../users/users.repository.js';
import { AuthService } from './auth.service.js';
import type { PasswordService } from './password.service.js';

const activeUser = {
  id: 'u1',
  email: 'ana@sondotecnica.com.br',
  name: 'Ana',
  avatarUrl: null,
  isAdmin: false,
  isActive: true,
  passwordHash: 'hash',
  failedLoginCount: 4,
  lockedUntil: null as Date | null,
};
const credentials = { email: 'ana@sondotecnica.com.br', password: 'errada' };

// DI na prática: o AuthService só conhece o que recebe no construtor, então o teste entrega fakes.
function setup(user: typeof activeUser | null) {
  const users = { findForLogin: vi.fn().mockResolvedValue(user), saveLoginAttempts: vi.fn() };
  const sessions = { create: vi.fn().mockResolvedValue('token-da-sessao') };
  const passwords = { verify: vi.fn().mockResolvedValue(false), verifyDummy: vi.fn() };
  const service = new AuthService(
    users as unknown as UsersRepository,
    sessions as unknown as SessionsService,
    passwords as unknown as PasswordService,
  );
  return { service, users, passwords };
}

describe('AuthService.login', () => {
  it('bloqueia a conta na 5ª senha errada', async () => {
    const { service, users } = setup(activeUser);
    await expect(service.login(credentials, {})).rejects.toThrow(UnauthorizedException);
    expect(users.saveLoginAttempts).toHaveBeenCalledWith('u1', 0, expect.any(Date));
  });

  it('email inexistente responde igual a senha errada e gasta o mesmo tempo', async () => {
    const { service, passwords } = setup(null);
    await expect(service.login(credentials, {})).rejects.toThrow('Email ou senha inválidos');
    expect(passwords.verifyDummy).toHaveBeenCalled();
  });

  it('conta bloqueada recusa até a senha certa', async () => {
    const { service, passwords } = setup({ ...activeUser, lockedUntil: new Date(Date.now() + 60_000) });
    passwords.verify.mockResolvedValue(true);
    await expect(service.login(credentials, {})).rejects.toThrow(UnauthorizedException);
    expect(passwords.verify).not.toHaveBeenCalled();
  });

  it('senha certa zera as tentativas, cria a sessão e não devolve o hash', async () => {
    const { service, users, passwords } = setup(activeUser);
    passwords.verify.mockResolvedValue(true);

    const result = await service.login(credentials, {});

    expect(result.token).toBe('token-da-sessao');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(users.saveLoginAttempts).toHaveBeenCalledWith('u1', 0, null);
  });
});
```

**`apps/hub/src/features/auth/safe-return-to.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./safe-return-to.ts";

const apps = [{ slug: "demo", name: "Demo", iconUrl: "", url: "http://localhost:5181", level: 1 }];

describe("safeReturnTo", () => {
  it("aceita um endereço de app liberado", () => {
    expect(safeReturnTo("http://localhost:5181/relatorios?id=1", apps)).toBe("http://localhost:5181/relatorios?id=1");
  });

  it("recusa um site que não é app do usuário (open redirect)", () => {
    expect(safeReturnTo("https://site-falso.com/login", apps)).toBeNull();
  });

  it("recusa javascript: e lixo", () => {
    expect(safeReturnTo("javascript:alert(1)", apps)).toBeNull();
    expect(safeReturnTo("nao-e-url", apps)).toBeNull();
  });
});
```

**`packages/client/src/create-sondo-auth.test.ts`**

```ts
import { afterEach, expect, it, vi } from "vitest";
import { createSondoAuth, NoAccessError } from "./create-sondo-auth.js";

const tokenResponse = {
  accessToken: "token-1",
  expiresIn: 600,
  user: { id: "u1", name: "Ana", email: "ana@sondotecnica.com.br", picture: null, level: 2 },
};

// Cada chamada recebe um Response novo: o corpo de um Response só pode ser lido uma vez.
const respondWith = (body: unknown, status = 200) =>
  vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

it("várias chamadas ao mesmo tempo fazem UMA ida ao hub (single-flight)", async () => {
  const fetchMock = respondWith(tokenResponse);
  vi.stubGlobal("fetch", fetchMock);
  const auth = createSondoAuth({ hubUrl: "http://hub.test" });

  const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);

  expect(tokens).toEqual(["token-1", "token-1", "token-1"]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("token válido vem do cache; perto de expirar, renova", async () => {
  const fetchMock = respondWith({ ...tokenResponse, expiresIn: 30 }); // menos que a margem de 60 s
  vi.stubGlobal("fetch", fetchMock);
  const auth = createSondoAuth({ hubUrl: "http://hub.test" });

  await auth.getAccessToken();
  await auth.getAccessToken();

  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("403 do hub vira NoAccessError", async () => {
  vi.stubGlobal("fetch", respondWith(null, 403));
  const auth = createSondoAuth({ hubUrl: "http://hub.test" });

  await expect(auth.getSession()).rejects.toBeInstanceOf(NoAccessError);
});
```

```powershell
pnpm test
```

Esperado (testado): API `4 passed`, hub `3 passed` e client `3 passed`.

## 🛠️ Passo 7 — Produção

| O quê | Dev (`.env`) | Produção |
|---|---|---|
| `SESSION_COOKIE_NAME` | `sondohub_session` | `__Host-sondohub_session` (impede que outro subdomínio sobrescreva o cookie) |
| `COOKIE_SECURE` | `false` (http://localhost) | `true` (só HTTPS) |
| `HUB_URL` | `http://localhost:5180` | `https://hub.sondotecnica.com.br` (igual ao `hubUrl` dos apps) |
| Proxy reverso | Vite | `app.set('trust proxy', 1)` com `NestFactory.create<NestExpressApplication>`. Sem isso, o rate limit vê o IP do proxy e bloqueia **todo mundo de uma vez** |

---

## ✅ Checkpoint: os ataques precisam falhar

Agora toda chamada que altera estado precisa do `Origin` certo. Nos testes manuais, mande o do hub: `-H "Origin: http://localhost:5180"`.

| # | Ataque | Comando (resumo) | Esperado (testado) |
|---|---|---|---|
| 1 | Login vindo de outro site | `POST /api/auth/login` com `Origin: https://evil.example` | 403 Origem não permitida |
| 2 | Login sem `Origin` (script, curl) | sem o header | 403 |
| 3 | Body inválido | `{"email":"nao-e-email","password":""}` | 400 com `path` e `message` de cada campo |
| 4 | Email com espaço ou maiúscula | `"  Admin@Sondotecnica.com.BR "` | 200 (normalizado) |
| 5 | Rota sem sessão | `GET /api/me` | 401 |
| 6 | 5 senhas erradas seguidas | depois, a senha **certa** | 401 por 15 min (conta bloqueada) |
| 7 | 11 tentativas no mesmo minuto | qualquer email | da 11ª em diante: 429 |
| 8 | CORS de app numa rota que não é dele | preflight `OPTIONS /api/me` com `Origin: http://localhost:5181` | nenhum `Access-Control-Allow-Origin` |
| 9 | Fluxo normal | aula 07 inteira no navegador | igual a antes: SSO, widget, níveis e logout |

Exemplo do teste 1:

```powershell
curl.exe -i -X POST http://localhost:5180/api/auth/login -H "Origin: https://evil.example" -H "Content-Type: application/json" -d '{"email":"admin@sondotecnica.com.br","password":"troque-esta-senha"}'
```

Para desbloquear as contas durante os testes:

```powershell
docker compose exec postgres psql -U sondohub -d sondohub -c "UPDATE users SET failed_login_count = 0, locked_until = NULL;"
```

---

🎉 **Fase 1 concluída.** Próximo passo: a Fase 2 (minha conta: esqueci a senha, foto, troca de senha e de email, sessões ativas). O roteiro está em [01-arquitetura.md](01-arquitetura.md#7-roteiro-de-fases).
