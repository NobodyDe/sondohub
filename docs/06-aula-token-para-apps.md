# Aula 06 — Rotas 5 e 6: token para os apps e JWKS

> 🎯 **Objetivo:** um app cadastrado (o demo, depois os reais) chama `POST /api/sso/token` e recebe um **access token de 10 min só para ele**, com o **nível do usuário naquele app**. O backend do app valida esse token com a chave pública em `GET /api/.well-known/jwks.json`.
>
> **Pré-requisito:** [aula 05](05-aula-hub-front.md).

---

## 🧠 Conceito: por que aqui é JWT (e na sessão não)

Pense na **ficha na portaria** e no **crachá assinado**:

- **A sessão (aulas 03 e 04) é a ficha.** Quem confere é a própria API do hub, que tem a tabela `sessions` e pode cancelar a ficha na hora.
- **O access token é um crachá assinado.** O backend do app (gemeo e os outros) **não tem acesso ao banco do hub**. Ele confere a **assinatura** com a chave pública, localmente, sem perguntar nada ao hub. Em troca, o crachá não pode ser cancelado antes de vencer, e por isso vale só 10 min.

```
Hub:  chave PRIVADA ──assina──▶ token (aud=demo, level=3, 10 min) ──▶ App: chave PÚBLICA ──confere──▶ ✔/✘
```

Três decisões, cada uma contra um ataque:

| Decisão | Evita |
|---|---|
| **RS256** (par de chaves), e não HS256 (segredo compartilhado) | Que um app forje tokens de admin para outro app: com HS256, todo app teria o segredo |
| **`aud` = slug do app** | Que o token do app A abra o app B |
| **App identificado pelo `Origin`**, e não por parâmetro | Que um XSS no app A peça um token do app B: o JavaScript não consegue falsificar o `Origin` |

---

## 🛠️ Passo 1 — Par de chaves

Crie `apps/api/scripts/generate-jwt-key.ts`. Ele usa só o `node:crypto`, e o Node 24 roda `.ts` direto:

```ts
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const keyId = new Date().toISOString().slice(0, 10);

console.log(`JWT_KEY_ID=${keyId}`);
console.log(`JWT_PRIVATE_KEY=${Buffer.from(pem).toString('base64')}`);
```

```powershell
pnpm --filter api exec node scripts/generate-jwt-key.ts
```

Cole as duas linhas no seu `.env`, no lugar das que estão vazias. A chave PEM tem várias linhas; em base64 ela vira **uma linha só**, que funciona em qualquer `.env` e painel de hospedagem.

## 🛠️ Passo 2 — Configuração e dependência

No `envSchema` de `apps/api/src/config/env.ts`, acrescente:

```ts
  JWT_KEY_ID: z.string().min(1),
  JWT_PRIVATE_KEY: z.string().min(1),
```

```powershell
pnpm --filter api add jose
```

## 🛠️ Passo 3 — `TokenService` (`modules/sso/token.service.ts`)

Ele assina e publica a chave, e só isso.

```ts
import { Injectable } from '@nestjs/common';
import type { SondoUser } from '@sondohub/contracts';
import { SignJWT } from 'jose';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { env } from '../../config/env.js';

const ALGORITHM = 'RS256';
export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;

@Injectable()
export class TokenService {
  // A chave chega em base64 no .env (uma linha só) e é decodificada uma vez, no boot.
  private readonly privateKey = createPrivateKey(Buffer.from(env.JWT_PRIVATE_KEY, 'base64').toString('utf8'));

  sign(audience: string, { id, ...claims }: SondoUser): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: ALGORITHM, kid: env.JWT_KEY_ID })
      .setIssuer(env.HUB_URL)
      .setSubject(id)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.privateKey);
  }

  /** Só a chave PÚBLICA: é o que os backends dos apps usam para conferir a assinatura. */
  getJwks() {
    const publicJwk = createPublicKey(this.privateKey).export({ format: 'jwk' });
    return { keys: [{ ...publicJwk, kid: env.JWT_KEY_ID, alg: ALGORITHM, use: 'sig' }] };
  }
}
```

**Por que assim:**

- **O `node:crypto` lê a chave e deriva a pública; o `jose` monta e assina o JWT.** Cada lib faz o que faz melhor, e nada é reimplementado.
- **O `kid` no cabeçalho** diz qual chave assinou. No dia em que você trocar a chave, publica as duas por 10 min e os apps nem percebem.

## 🛠️ Passo 4 — `SsoService` (`modules/sso/sso.service.ts`)

Aqui ficam as regras: qual app pediu, se o usuário tem acesso e com qual nível.

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { SondoUser, TokenResponse } from '@sondohub/contracts';
import { AppsRepository } from '../apps/apps.repository.js';
import type { SafeUser } from '../users/users.repository.js';
import { ACCESS_TOKEN_TTL_SECONDS, TokenService } from './token.service.js';

@Injectable()
export class SsoService {
  constructor(
    private readonly apps: AppsRepository,
    private readonly tokens: TokenService,
  ) {}

  /** O app é descoberto pelo Origin da requisição, nunca por um parâmetro que o cliente escolhe. */
  async issueToken(user: SafeUser, origin: string | undefined): Promise<TokenResponse> {
    const app = origin ? await this.apps.findActiveByOrigin(origin) : null;
    if (!app) throw new ForbiddenException('App não cadastrado');

    const access = await this.apps.findAccessLevel(user.id, app.id);
    if (!access) throw new ForbiddenException('Sem acesso a este app');

    const sondoUser: SondoUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.avatarUrl,
      level: access.level,
    };
    return {
      accessToken: await this.tokens.sign(app.slug, sondoUser),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: sondoUser,
    };
  }
}
```

> **Por que devolver `user` junto com o token?** Para o front **nunca precisar decodificar o JWT**. Para o front, o token é uma caixa fechada que ele só repassa ao backend do app.

`findActiveByOrigin` e `findAccessLevel` já estão no seu `AppsRepository`.

## 🛠️ Passo 5 — Rotas e módulo (`modules/sso/`)

**`sso.controller.ts`**

```ts
import { Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { SsoService } from './sso.service.js';

@Controller('sso')
@UseGuards(SessionGuard)
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  @Post('token')
  @HttpCode(200)
  issueToken(@CurrentAuth() auth: AuthContext, @Headers('origin') origin?: string) {
    return this.sso.issueToken(auth.user, origin);
  }
}
```

**`jwks.controller.ts`**: público, sem guard, porque é só a chave pública.

```ts
import { Controller, Get } from '@nestjs/common';
import { TokenService } from './token.service.js';

@Controller('.well-known')
export class JwksController {
  constructor(private readonly tokens: TokenService) {}

  @Get('jwks.json')
  getJwks() {
    return this.tokens.getJwks();
  }
}
```

**`sso.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppsModule } from '../apps/apps.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { JwksController } from './jwks.controller.js';
import { SsoController } from './sso.controller.js';
import { SsoService } from './sso.service.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [AppsModule, SessionsModule],
  controllers: [SsoController, JwksController],
  providers: [SsoService, TokenService],
})
export class SsoModule {}
```

No `app.module.ts`: `imports: [PrismaModule, AuthModule, AccountModule, SsoModule]`.

## 🛠️ Passo 6 — CORS simples

O demo (5181) é **outro origin**. Para o navegador deixar o JavaScript dele chamar o hub mandando o cookie, a API precisa autorizar esse origin. Nesta versão simples, a lista vem do banco **no boot**.

No `AppsRepository`, acrescente:

```ts
  async listOrigins(): Promise<string[]> {
    const apps = await this.prisma.application.findMany({ where: { isActive: true }, select: { origin: true } });
    return apps.map((app) => app.origin);
  }
```

**`main.ts`**

```ts
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';
import { AppsRepository } from './modules/apps/apps.repository.js';

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api');
app.use(helmet());
app.use(cookieParser());

// Os apps cadastrados (outros origins) podem chamar a API mandando o cookie do hub.
// A lista é lida no boot: cadastrou um app novo, reinicie a API (a aula 08 deixa isso dinâmico).
app.enableCors({ origin: await app.get(AppsRepository).listOrigins(), credentials: true });

app.enableShutdownHooks();
await app.listen(env.API_PORT);
```

**Por que assim:**

- **`credentials: true`:** sem ele, o navegador não envia o cookie nas chamadas do app.
- **Uma lista explícita, e não `origin: true`:** com `origin: true`, **qualquer site** poderia ler as respostas como se fosse um app seu.

---

## ✅ Checkpoint

Reinicie o `pnpm dev`, porque o `.env` mudou. Faça login como admin (aula 03) para ter o `cookies.txt`.

**1. JWKS público:**

```powershell
curl.exe http://localhost:3100/api/.well-known/jwks.json
```

Esperado: `kty: "RSA"`, `alg: "RS256"`, o seu `kid`, e **nenhum campo `d`** (que seria a parte privada).

**2. Token pedido "como se fosse" o demo:**

```powershell
$r = curl.exe -s -b cookies.txt -X POST http://localhost:3100/api/sso/token -H "Origin: http://localhost:5181" | ConvertFrom-Json
$r.user
node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1], 'base64url')))" $r.accessToken
```

Esperado (testado): `user` com `level 3`, e o payload com `aud: 'demo'`, `iss: 'http://localhost:5180'` e `exp - iat = 600`.

> 🔒 **Nunca cole um token real no jwt.io** ou em sites parecidos. Um token válido é uma credencial; decodifique sempre localmente, como acima.

**3. O que precisa falhar:**

| Teste | Esperado |
|---|---|
| `Origin: https://evil.example` | 403 `App não cadastrado` |
| Sem o `-b cookies.txt` | 401 |
| Leitor sem acesso ao demo (apague o acesso no Studio, depois rode `pnpm db:seed` para restaurar) | 403 `Sem acesso a este app` |
| Preflight `OPTIONS` com `Origin: http://localhost:5181` | `Access-Control-Allow-Origin: http://localhost:5181` |
| Preflight com origin estranho | Nenhum `Access-Control-Allow-Origin` |

## ⏳ O que ficou para depois

- **O CORS vale para todas as rotas e só é lido no boot.** Na aula 08 ele fica dinâmico e restrito às rotas que os apps realmente usam.
- **O `HUB_URL` precisa bater exatamente** com o `hubUrl` que os apps usam (aula 07), sem barra no final num e não no outro. Senão o `iss` não confere e todo token é recusado.

➡️ Próximo: [07 — Um app consumindo o login do hub](07-aula-app-consumindo-o-hub.md)
