# Aula 04 — API: login, sessão e guards

> **Objetivo:** a API faz login com email e senha, cria uma sessão de 30 dias num cookie `HttpOnly` e protege **todas** as rotas por padrão. Também se defende de força bruta e de CSRF.
>
> **Pré-requisito:** [aula 03](03-aula-banco-de-dados.md) concluída (banco migrado e com seed).

---

## 🧠 Conceito

### A sessão é o seu "refresh token"

No login, a API gera **32 bytes aleatórios**, grava o **hash** deles na tabela `sessions` e entrega o valor original num cookie:

```
__Host-sondohub_session=<valor>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=30 dias
```

| Flag | Protege contra |
|---|---|
| `HttpOnly` | XSS roubando a sessão: o JavaScript da página não consegue ler o cookie |
| `Secure` | Captura na rede: só trafega em HTTPS |
| `SameSite=Strict` | CSRF vindo de **outros sites**: o navegador não envia o cookie |
| `__Host-` | Outro subdomínio sobrescrevendo o cookie (*cookie tossing*) |

Em cada requisição, a API faz o hash do cookie e procura no banco. Revogar é só preencher `revoked_at`. **Por isso não usamos JWT aqui:** já é preciso consultar o banco, e o JWT não acrescentaria nada.

### O pipeline do Nest: *deny-by-default*

Toda requisição passa por estas etapas, nesta ordem:

```
helmet → cookie-parser → ThrottlerGuard → OriginGuard → SessionGuard → ZodValidationPipe → Controller → Service → Repository
(headers)  (lê o cookie)   (rate limit)    (CSRF)        (quem é você?)  (o body é válido?)
```

O `SessionGuard` é **global**: toda rota nova já nasce protegida. Para liberar uma rota, você precisa escrever `@Public()`, e isso aparece no code review.

### Camadas: cada arquivo tem um motivo para mudar

```
apps/api/src/
├─ config/env.ts                    configuração validada no boot
├─ prisma/                          infra: conexão com o banco
├─ common/
│  ├─ zod-validation.pipe.ts        valida o body com o schema do contracts
│  ├─ auth/                         SessionGuard, @Public, @CurrentAuth, AuthContext
│  └─ security/                     OriginPolicy + OriginGuard (CSRF)
└─ modules/
   ├─ users/    UsersRepository     domínio: dados do usuário (sem hash!)
   ├─ apps/     AppsRepository      domínio: registro de apps e acessos
   ├─ sessions/ SessionsService     domínio: criar, validar e revogar sessão + cookie
   ├─ auth/     AuthController, AuthService, PasswordService   caso de uso: login
   └─ account/  MeController        caso de uso: "minha conta" (cresce na Fase 2)
```

---

## 🛠️ Passo 1 — Limpar o scaffold e instalar o que falta

Apague o exemplo do Nest, que não será usado (e o `GET /` dele viraria rota protegida):

```powershell
Remove-Item apps/api/src/app.controller.ts, apps/api/src/app.service.ts, apps/api/src/app.controller.spec.ts, apps/api/test/app.e2e-spec.ts
```

```powershell
pnpm --filter api add @nestjs/throttler
```

> O `app.module.ts` ainda importa os arquivos apagados. Ele é reescrito no passo 11; até lá, o watch do Nest vai acusar erro, e isso é esperado.

## 🛠️ Passo 2 — O contrato da API (`packages/contracts/src/index.ts`)

**Contract-first:** antes de implementar, definimos o que entra e o que sai da API. Este arquivo é a fonte única:

- o **mesmo schema** valida o formulário do hub (aula 06) e o body da API;
- os **mesmos tipos** são usados pela API, pelo hub e pelos SDKs (aula 07).

```ts
import { z } from 'zod';

// trim/toLowerCase ANTES do .pipe(z.email()): no zod 4 a checagem de formato roda antes
// das transformações encadeadas depois dela, e "  Ana@X.com " seria rejeitado.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** O usuário dentro de um app: é o que vai no access token. */
export type SondoUser = {
  id: string;
  name: string;
  email: string;
  picture: string | null;
  level: number;
};

/** Um app no launcher. */
export type LauncherApp = {
  slug: string;
  name: string;
  iconUrl: string;
  url: string;
};

/** Resposta de POST /api/sso/token. */
export type TokenResponse = {
  accessToken: string;
  expiresIn: number;
  user: SondoUser;
};

/** Resposta de GET /api/me (perfil no hub). */
export type HubProfile = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
};
```

Depois de editar, compile o package. Os apps usam o `dist`:

```powershell
pnpm --filter "@sondohub/contracts" build
```

> **Por que `max(128)` na senha?** O Argon2 é lento de propósito. Sem limite, alguém manda senhas de 1 MB e ocupa a CPU do servidor (DoS barato).
>
> **Pegadinha testada:** `z.email().trim()` **rejeita** `" ana@x.com "`. A ordem certa é `z.string().trim().toLowerCase().pipe(z.email())`.

## 🛠️ Passo 3 — Configuração (`src/config/env.ts`)

```ts
import { z } from 'zod';

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive(),
  HUB_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1),
  COOKIE_SECURE: z.stringbool(),
});

export const env = envSchema.parse(process.env);
```

O `z.stringbool()` converte `"true"`/`"false"` do `.env` em boolean. Sem ele, a string `"false"` seria *truthy*.

## 🛠️ Passo 4 — Prisma no Nest (`src/prisma/`)

**`prisma.service.ts`**

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

**`prisma.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

**Por que assim:**

- **`$connect` no boot:** se o banco estiver fora do ar, a API **nem sobe** (*fail fast*) em vez de falhar na primeira requisição.
- **`@Global()`:** todo repositório precisa do Prisma, então não faz sentido importar o módulo em cada um.

## 🛠️ Passo 5 — Domínio: usuários e apps

**`modules/users/users.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Campos que podem sair do repositório. password_hash nunca entra aqui. */
export const safeUserSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  isAdmin: true,
  isActive: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof safeUserSelect }>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A única consulta que traz o hash da senha: só o login precisa dele. */
  findForLogin(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { ...safeUserSelect, passwordHash: true, failedLoginCount: true, lockedUntil: true },
    });
  }

  async saveLoginAttempts(id: string, failedLoginCount: number, lockedUntil: Date | null): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { failedLoginCount, lockedUntil } });
  }
}
```

> **O ponto principal da aula está aqui:** o `safeUserSelect` é o **único** formato de usuário que circula pela API. Ninguém precisa lembrar de "não devolver o hash", porque o repositório nem traz o hash. O `satisfies` checa os campos contra o schema, e o `UserGetPayload` gera o tipo sozinho.

**`modules/users/users.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository.js';

@Module({ providers: [UsersRepository], exports: [UsersRepository] })
export class UsersModule {}
```

**`modules/apps/apps.repository.ts`**. Esta aula usa os dois primeiros métodos; a aula 05 usa os outros dois.

```ts
import { Injectable } from '@nestjs/common';
import type { LauncherApp } from '@sondohub/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AppsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByOrigin(origin: string) {
    return this.prisma.application.findFirst({ where: { origin, isActive: true } });
  }

  async isActiveOrigin(origin: string): Promise<boolean> {
    return (await this.findActiveByOrigin(origin)) !== null;
  }

  findAccessLevel(userId: string, applicationId: string) {
    return this.prisma.userAppAccess.findUnique({
      where: { userId_applicationId: { userId, applicationId } },
      select: { level: true },
    });
  }

  listForUser(userId: string): Promise<LauncherApp[]> {
    return this.prisma.application.findMany({
      where: { isActive: true, access: { some: { userId } } },
      select: { slug: true, name: true, iconUrl: true, url: true },
      orderBy: { name: 'asc' },
    });
  }
}
```

**`modules/apps/apps.module.ts`** segue o mesmo molde do `UsersModule`, com `AppsRepository`.

## 🛠️ Passo 6 — Domínio: sessões (`modules/sessions/`)

**`sessions.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { safeUserSelect } from '../users/users.repository.js';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias, contados do login
const TOKEN_BYTES = 32;

export type SessionMeta = { userAgent?: string; ip?: string };

// O banco guarda só o hash: se vazar, ninguém consegue usar as sessões.
// SHA-256 (rápido) basta porque o token tem 256 bits aleatórios: não há o que adivinhar.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, meta: SessionMeta): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return token;
  }

  async validate(token: string | undefined): Promise<AuthContext | null> {
    if (!token) return null;

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, expiresAt: true, revokedAt: true, user: { select: safeUserSelect } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) return null;

    return { sessionId: session.id, user: session.user };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }
}
```

> **Pergunta clássica: por que SHA-256 aqui e Argon2 na senha?** A senha tem pouca entropia (pessoas escolhem senhas previsíveis), então o hash **precisa** ser lento para tornar o chute caro. O token de sessão tem 256 bits aleatórios: ninguém adivinha isso. Aqui o hash só precisa ser rápido, porque roda a **cada requisição**.

**`session-cookie.ts`**: o formato do cookie fica num lugar só.

```ts
import type { Response } from 'express';
import { env } from '../../config/env.js';
import { SESSION_TTL_MS } from './sessions.service.js';

const cookieOptions = {
  httpOnly: true, // o JavaScript da página não lê o cookie: um XSS não consegue roubar a sessão
  secure: env.COOKIE_SECURE, // só trafega em HTTPS (no dev, http://localhost, fica false)
  sameSite: 'strict', // outros sites não conseguem fazer o navegador enviar o cookie
  path: '/',
} as const;

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(env.SESSION_COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, cookieOptions);
}
```

**`sessions.module.ts`** segue o mesmo molde, com `SessionsService`.

## 🛠️ Passo 7 — O guard global e seus ajudantes (`common/auth/`)

**`auth-context.ts`**: o que o guard anexa à requisição.

```ts
import type { SafeUser } from '../../modules/users/users.repository.js';

export type AuthContext = { sessionId: string; user: SafeUser };
```

**`public.decorator.ts`**

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Libera a rota do SessionGuard global. Use só onde ainda não há usuário logado. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
```

**`current-auth.decorator.ts`**: no controller, `@CurrentAuth() auth` entrega a sessão já validada.

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from './auth-context.js';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext =>
    context.switchToHttp().getRequest<Request & { auth: AuthContext }>().auth,
);
```

**`session.guard.ts`**

```ts
import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { SessionsService } from '../../modules/sessions/sessions.service.js';
import type { AuthContext } from './auth-context.js';
import { IS_PUBLIC } from './public.decorator.js';

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

**`common/zod-validation.pipe.ts`** segue o padrão da documentação do Nest para validação com schema:

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

## 🛠️ Passo 8 — CSRF: a regra de origem (`common/security/`)

**`origin-policy.ts`**: é a **única** regra de "quem pode chamar o quê". O CORS (aula 05) usa a mesma.

```ts
import { Injectable } from '@nestjs/common';
import { env } from '../../config/env.js';
import { AppsRepository } from '../../modules/apps/apps.repository.js';

const SSO_PATH_PREFIX = '/api/sso/';

/**
 * Regra única de "quem pode chamar o quê", usada pelo CORS e pelo OriginGuard:
 * o próprio hub pode tudo; apps cadastrados só podem as rotas /api/sso/*.
 */
@Injectable()
export class OriginPolicy {
  private readonly hubOrigin = new URL(env.HUB_URL).origin;

  constructor(private readonly apps: AppsRepository) {}

  async isAllowed(origin: string | undefined, path: string): Promise<boolean> {
    if (!origin) return false;
    if (origin === this.hubOrigin) return true;
    return path.startsWith(SSO_PATH_PREFIX) && (await this.apps.isActiveOrigin(origin));
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

> **Por que precisamos disso se já temos `SameSite=Strict`?** O `SameSite` olha o **site** (`sondotecnica.com.br`), não o subdomínio. Para o navegador, um `blog.sondotecnica.com.br` invadido é "o mesmo site" e enviaria o cookie. O `Origin` diz o subdomínio exato, e o navegador não deixa o JavaScript falsificá-lo. São duas camadas que cobrem buracos diferentes.

## 🛠️ Passo 9 — O caso de uso: login (`modules/auth/`)

**`password.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

@Injectable()
export class PasswordService {
  // Hash de uma senha qualquer, usado quando o email não existe: a resposta
  // demora o mesmo tempo e não denuncia quais emails estão cadastrados.
  private readonly dummyHash = argon2.hash('senha-que-ninguem-usa');

  hash(password: string): Promise<string> {
    return argon2.hash(password); // Argon2id com os parâmetros padrão da lib
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  async verifyDummy(password: string): Promise<void> {
    await argon2.verify(await this.dummyHash, password);
  }
}
```

**`auth.service.ts`**: as regras de negócio do login.

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginInput } from '@sondohub/contracts';
import { SessionsService, type SessionMeta } from '../sessions/sessions.service.js';
import { UsersRepository } from '../users/users.repository.js';
import { PasswordService } from './password.service.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const INVALID_CREDENTIALS = 'Email ou senha inválidos';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsService,
    private readonly passwords: PasswordService,
  ) {}

  /** Valida as credenciais e devolve o token da nova sessão. */
  async login({ email, password }: LoginInput, meta: SessionMeta): Promise<string> {
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
    return this.sessions.create(user.id, meta);
  }

  private registerFailure(userId: string, previousFailures: number): Promise<void> {
    const failures = previousFailures + 1;
    if (failures < MAX_FAILED_LOGINS) return this.users.saveLoginAttempts(userId, failures, null);
    return this.users.saveLoginAttempts(userId, 0, new Date(Date.now() + LOCK_DURATION_MS));
  }
}
```

**`auth.controller.ts`**: o controller só traduz HTTP. Ele não sabe nada de senha nem de banco.

```ts
import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loginSchema, type LoginInput } from '@sondohub/contracts';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { setSessionCookie } from '../sessions/session-cookie.js';
import { AuthService } from './auth.service.js';

const LOGIN_RATE_LIMIT = { default: { limit: 10, ttl: 60_000 } }; // 10 tentativas por minuto, por IP

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(LOGIN_RATE_LIMIT)
  @Post('login')
  @HttpCode(204)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = await this.auth.login(body, { userAgent: req.get('user-agent'), ip: req.ip });
    setSessionCookie(res, token);
  }
}
```

> **`import type` nos parâmetros decorados.** Com `isolatedModules` e `emitDecoratorMetadata`, o TypeScript exige `import type` para tipos usados em assinaturas decoradas (`Request`, `LoginInput`). Se você importar sem `type`, o build quebra com TS1272.

**`auth.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';

@Module({
  imports: [UsersModule, SessionsModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
})
export class AuthModule {}
```

## 🛠️ Passo 10 — Uma rota protegida: `GET /api/me` (`modules/account/`)

```ts
// me.controller.ts
import { Controller, Get } from '@nestjs/common';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';

@Controller('me')
export class MeController {
  @Get()
  me(@CurrentAuth() auth: AuthContext) {
    return auth.user;
  }
}
```

```ts
// account.module.ts
import { Module } from '@nestjs/common';
import { MeController } from './me.controller.js';

@Module({ controllers: [MeController] })
export class AccountModule {}
```

Repare: **nenhum decorator de proteção aqui**. A rota é protegida porque o guard é global.

## 🛠️ Passo 11 — Montar tudo (`app.module.ts`)

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
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // limite geral: 100 req/min por IP
    PrismaModule,
    UsersModule,
    AppsModule,
    SessionsModule,
    AuthModule,
    AccountModule,
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

O `main.ts` continua o do guia 02. Ele ganha CORS na aula 05.

## 🛠️ Passo 12 — Teste unitário das regras (`modules/auth/auth.service.spec.ts`)

Aqui o **D do SOLID** fica concreto. O `AuthService` só conhece o que recebe no construtor, então o teste entrega fakes, sem banco nem Nest:

```ts
import { UnauthorizedException } from '@nestjs/common';
import type { SessionsService } from '../sessions/sessions.service.js';
import type { UsersRepository } from '../users/users.repository.js';
import { AuthService } from './auth.service.js';
import type { PasswordService } from './password.service.js';

const activeUser = { id: 'u1', passwordHash: 'hash', isActive: true, failedLoginCount: 4, lockedUntil: null as Date | null };
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

  it('senha certa zera as tentativas e cria a sessão', async () => {
    const { service, users, passwords } = setup(activeUser);
    passwords.verify.mockResolvedValue(true);
    await expect(service.login(credentials, {})).resolves.toBe('token-da-sessao');
    expect(users.saveLoginAttempts).toHaveBeenCalledWith('u1', 0, null);
  });
});
```

```powershell
pnpm --filter api test
```

Esperado: `Tests  3 passed (3)`.

---

## ✅ Checkpoint

Com `pnpm dev` rodando, use o PowerShell. As chamadas passam pelo **proxy do hub** (5180), como vai ser em produção.

**Login correto e rota protegida:**

```powershell
$body = @{ email = 'admin@sondotecnica.com.br'; password = 'troque-esta-senha' } | ConvertTo-Json
Invoke-WebRequest http://localhost:5180/api/auth/login -Method Post -ContentType 'application/json' -Headers @{ Origin = 'http://localhost:5180' } -Body $body -SessionVariable s -UseBasicParsing | Select-Object StatusCode
Invoke-RestMethod http://localhost:5180/api/me -WebSession $s
```

Esperado: `StatusCode 204` e depois os dados do admin, **sem `passwordHash`**.

**O que precisa falhar** (o PowerShell mostra o código de erro):

| Teste | Esperado |
|---|---|
| Mesmo login com `Origin = 'https://evil.example'` | **403** Origem não permitida |
| Mesmo login **sem** o header `Origin` | **403** |
| `Invoke-RestMethod http://localhost:5180/api/me` (sem `-WebSession`) | **401** |
| Body `@{ email = 'nao-e-email'; password = '' }` | **400** com `path` e `message` de cada campo |
| 11 tentativas de login no mesmo minuto | a partir da 11ª: **429** |
| 5 senhas erradas seguidas, depois a senha **certa** | **401** por 15 min (conta bloqueada) |

Para desbloquear o admin durante os testes:

```powershell
docker compose exec postgres psql -U sondohub -d sondohub -c "UPDATE users SET failed_login_count = 0, locked_until = NULL;"
```

> Todos os testes de segurança desta tabela foram executados contra este código antes de escrever a aula.

---

## ⚠️ Atenção

- **Produção atrás de proxy reverso:** use `app.set('trust proxy', 1)` (com `NestFactory.create<NestExpressApplication>`). Sem isso, `req.ip` é o IP do proxy, e o rate limit bloqueia **todo mundo de uma vez**.
- **Bloqueio por conta:** um atacante pode travar a conta de alguém errando a senha de propósito, mas só por 15 min. É uma troca consciente; o rate limit por IP reduz o estrago.
- **Corrida no contador:** duas tentativas simultâneas podem contar como uma. É aceitável aqui, porque o throttler limita o volume. Não vale a pena uma transação para isso.
- **Mensagem sempre genérica:** email inexistente, senha errada, conta bloqueada e usuário inativo respondem **a mesma coisa**. Isso evita que alguém descubra quais emails existem.

## 🏋️ Exercícios

1. Adicione um teste: "conta bloqueada recusa até a senha certa". Dica: `lockedUntil` no futuro e `passwords.verify` resolvendo `true`.
2. Por que o `SessionsService.validate` também checa `session.user.isActive`, se o login já checa?

<details>
<summary>Respostas</summary>

1. ```ts
   it('conta bloqueada recusa até a senha certa', async () => {
     const { service, passwords } = setup({ ...activeUser, lockedUntil: new Date(Date.now() + 60_000) });
     passwords.verify.mockResolvedValue(true);
     await expect(service.login(credentials, {})).rejects.toThrow(UnauthorizedException);
     expect(passwords.verify).not.toHaveBeenCalled();
   });
   ```
2. Porque o usuário pode ser **desativado depois** do login. Sem essa checagem, a sessão de 30 dias continuaria valendo. Com ela, desativar no admin corta o acesso na próxima requisição.

</details>

➡️ Próximo: [05 — SSO: token por app, JWKS e CORS](05-aula-sso-e-tokens.md)
