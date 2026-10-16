# Aula 03 — Rota 1: login (cru)

> 🎯 **Objetivo:** `POST /api/auth/login` recebe email e senha, cria uma **sessão** no banco, devolve um cookie e responde com os **dados do usuário**.
>
> **Do jeito cru, de propósito:** primeiro funcionar, uma rota de cada vez. As proteções (validação, limite de tentativas, CSRF…) entram juntas na [aula 08](08-aula-seguranca.md), quando tudo já estiver de pé.

---

## 📍 Onde você está

| Já feito | Falta nesta aula |
|---|---|
| Setup do monorepo, Docker e `.env` | `SessionsModule` |
| Banco migrado (`init`) e seed (admin + leitor + app demo) | `AuthService` e `AuthController` |
| `PrismaService`, `UsersRepository`, `AppsRepository` | `AuthModule` e montar o `AppModule` |
| `SessionsService` + `session-cookie.ts` + decorators | |

> A referência do banco (o porquê de cada coluna, o SQL e as consultas) está no [apêndice](apendice-banco-de-dados.md).

## 🔧 Antes de começar: ajustes no que você já tem

Testei o seu código num clone. Estes pontos quebram ou vão quebrar o build:

1. **Import errado** em `apps/api/src/modules/users/users.repository.ts`. Hoje o `nest build` falha com `TS2307`:

   ```ts
   import { PrismaService } from '../../prisma/prisma.service.js'; // eram '../', são '../../'
   ```

2. **Arquivo com nome trocado:** `modules/apps/users.module.ts` exporta o `AppsModule`. Renomeie:

   ```powershell
   git mv apps/api/src/modules/apps/users.module.ts apps/api/src/modules/apps/apps.module.ts
   ```

3. **Falta o `SessionsModule`.** Crie `apps/api/src/modules/sessions/sessions.module.ts`:

   ```ts
   import { Module } from '@nestjs/common';
   import { SessionsService } from './sessions.service.js';

   @Module({ providers: [SessionsService], exports: [SessionsService] })
   export class SessionsModule {}
   ```

4. **Arquivo de build no git:** o `apps/api/tsconfig.build.tsbuildinfo` foi commitado. É cache do compilador e muda a cada build. Acrescente `*.tsbuildinfo` ao `.gitignore` da raiz e tire do índice:

   ```powershell
   git rm --cached apps/api/tsconfig.build.tsbuildinfo
   ```

---

## 🧠 Conceito: o que é a "sessão crua"

```
POST /api/auth/login { email, senha }
  1. busca o usuário pelo email           (UsersRepository.findForLogin — você já tem)
  2. confere a senha com o hash (argon2)
  3. cria a sessão: 32 bytes aleatórios → grava o HASH no banco, devolve o valor
  4. manda o valor no cookie HttpOnly    (setSessionCookie — você já tem)
  5. responde com o usuário, SEM o hash
```

O cookie **é** o "refresh token": opaco, 30 dias, revogável no banco. O navegador o envia sozinho nas próximas requisições, e é isso que a aula 04 vai usar.

---

## 🛠️ Passo 1 — `AuthService` (`modules/auth/auth.service.ts`)

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginInput } from '@sondohub/contracts';
import argon2 from 'argon2';
import { SessionsService, type SessionMeta } from '../sessions/sessions.service.js';
import { UsersRepository, type SafeUser } from '../users/users.repository.js';

export type LoginResult = { token: string; user: SafeUser };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsService,
  ) {}

  /** Confere email e senha, cria a sessão e devolve o token dela junto com o usuário. */
  async login({ email, password }: LoginInput, meta: SessionMeta): Promise<LoginResult> {
    const user = await this.users.findForLogin(email);
    if (!user?.passwordHash || !user.isActive || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Tira do objeto os campos que só o login usa: o resto é o SafeUser.
    const { passwordHash, failedLoginCount, lockedUntil, ...safeUser } = user;
    return { token: await this.sessions.create(user.id, meta), user: safeUser };
  }
}
```

**Por que assim:**

- **Um `if` só para as três falhas** (usuário não existe, inativo ou senha errada): todas respondem a mesma coisa. Repare no `?.`: se `user` for `null`, a primeira condição já é verdadeira e o resto nem roda.
- **`argon2.verify` direto, sem classe extra.** Hoje há só uma chamada. O `PasswordService` nasce na aula 08, quando aparecer a segunda responsabilidade (o "hash falso" que iguala o tempo de resposta).
- **A desestruturação com `...safeUser`** é o jeito idiomático de "copiar o objeto sem alguns campos". Assim o hash nunca chega à resposta.

O Oxlint reclama das três variáveis desestruturadas que não são usadas. Isso é um falso positivo para esse idioma, e o ESLint tem uma opção exatamente para ele. Em `apps/api/.oxlintrc.json`, acrescente em `rules`:

```json
"no-unused-vars": ["warn", { "ignoreRestSiblings": true }]
```

## 🛠️ Passo 2 — `AuthController` (`modules/auth/auth.controller.ts`)

O controller só traduz HTTP: lê a requisição, chama o service, grava o cookie e responde.

```ts
import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { LoginInput } from '@sondohub/contracts';
import type { Request, Response } from 'express';
import { setSessionCookie } from '../sessions/session-cookie.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
}
```

**Detalhes que importam:**

- **`@Res({ passthrough: true })`:** você mexe no `res` (o cookie) e mesmo assim deixa o Nest serializar o `return user`. Sem o `passthrough`, você teria de chamar `res.json()` na mão.
- **`import type`** para `Request`, `Response` e `LoginInput`: com `isolatedModules` e `emitDecoratorMetadata`, o TypeScript exige isso para tipos usados em parâmetros decorados. Sem o `type`, o build quebra com TS1272.
- **`@Body() body: LoginInput` não valida nada.** O tipo existe só em tempo de compilação. É o "cru" desta aula; a validação de verdade entra na aula 08.

## 🛠️ Passo 3 — Ligar tudo

**`modules/auth/auth.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [UsersModule, SessionsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
```

**`app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, AuthModule],
})
export class AppModule {}
```

Só entra o que esta rota precisa. Cada aula acrescenta o seu módulo.

---

## ✅ Checkpoint

Com `pnpm db:up` e `pnpm dev` rodando, use o PowerShell 7. Use `curl.exe`, não o alias `curl`. As chamadas vão direto na API (3100):

**1. Login certo:**

```powershell
curl.exe -i -c cookies.txt -X POST http://localhost:3100/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@sondotecnica.com.br","password":"troque-esta-senha"}'
```

Esperado (testado):

```
HTTP/1.1 200 OK
Set-Cookie: sondohub_session=…; Max-Age=2592000; Path=/; Expires=…; HttpOnly; SameSite=Strict
{"id":"…","email":"admin@sondotecnica.com.br","name":"Administrador","avatarUrl":null,"isAdmin":true,"isActive":true}
```

Repare: **não tem `passwordHash`** na resposta, e o cookie é `HttpOnly`.

**2. Senha errada e email inexistente:** os dois respondem `401 {"message":"Email ou senha inválidos"…}`.

**3. A sessão no banco** (só o hash, nunca o valor do cookie):

```powershell
docker compose exec postgres psql -U sondohub -d sondohub -c "SELECT u.email, left(s.token_hash, 12) AS hash, s.expires_at::date FROM sessions s JOIN users u ON u.id = s.user_id;"
```

Guarde o `cookies.txt`: a aula 04 continua com ele.

---

## ⏳ O que ficou cru de propósito (e quando se resolve)

| Hoje | Risco | Resolve em |
|---|---|---|
| O body não é validado | `" Admin@…"` não encontra o usuário; um body vazio vira erro 500 | aula 08 (zod) |
| Tentativas ilimitadas | Força bruta na senha | aula 08 (rate limit + bloqueio) |
| Email inexistente responde mais rápido | Dá para descobrir quais emails existem pelo tempo | aula 08 (hash falso) |
| Qualquer origem pode chamar o login | CSRF de login | aula 08 (`OriginGuard`) |
| O cookie é `sondohub_session`, sem `Secure` | Só serve para http://localhost | aula 08 (cookie de produção) |

➡️ Próximo: [04 — Quem sou eu, meus apps e sair](04-aula-sessao-e-apps.md)
