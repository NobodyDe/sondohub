# Aula 05 — SSO: token por app, JWKS e CORS

> **Objetivo:** um app cadastrado chama `POST /api/sso/token` e recebe um **access token de 10 min, só para ele**, com o nível do usuário naquele app. Os backends dos apps validam esse token com a **chave pública** que o hub publica.
>
> **Pré-requisito:** [aula 04](04-aula-api-login-e-sessao.md) concluída (login e sessão funcionando).

---

## 🧠 Conceito

### Dois tokens, dois papéis

| | Sessão (aula 04) | Access token (esta aula) |
|---|---|---|
| Formato | Opaco (32 bytes aleatórios) | JWT assinado (RS256) |
| Onde fica | Cookie `HttpOnly` do hub | Memória do app (JavaScript) |
| Quem lê | Só a API do hub | O backend do app |
| Validade | 30 dias | 10 min |
| Como revoga | `revoked_at` no banco | Expira sozinho |
| Para que serve | Provar que é um usuário válido | Entrar **num** app específico |

O access token é um JWT porque o **backend do app** precisa validá-lo **sem perguntar ao hub** a cada requisição. Ele confere a assinatura com a chave pública, tudo local e rápido.

### Por que RS256 (chave assimétrica)

```
Hub:  chave PRIVADA  ──assina──▶  token  ──▶  App: chave PÚBLICA ──confere──▶ ✔/✘
```

- **Com HS256** (segredo compartilhado), cada app teria o segredo e **poderia emitir tokens**: o app A forjaria um token de admin do app B.
- **Com RS256**, a chave pública só serve para conferir. Ela pode até ser publicada, e é: em `/api/.well-known/jwks.json`.
- **O `kid`** (key id) no cabeçalho diz qual chave assinou o token. Quando você trocar a chave, publica as duas por 10 min, e os apps continuam funcionando sem deploy.

### Como o hub sabe qual app pediu

Pelo header **`Origin`**, que o navegador preenche e o JavaScript **não consegue falsificar**. O hub procura o origin em `applications.origin`:

- se não achar, responde `403`;
- se achar, mas o usuário não tiver acesso ao app, também `403`;
- senão, assina o token com `aud` = slug **desse** app.

Por isso um XSS no app A não consegue um token para o app B.

### O que vai no token

```json
{
  "alg": "RS256", "kid": "2026-10-15"                 ← cabeçalho
}
{
  "iss": "http://localhost:5180",                       ← quem emitiu (o hub)
  "sub": "7b0c6a1e-…",                                  ← id do usuário
  "aud": "demo",                                        ← para qual app
  "iat": 1760550000, "exp": 1760550600,                 ← validade: 10 min
  "name": "Administrador", "email": "admin@…", "picture": null,
  "level": 3                                            ← nível NESTE app
}
```

> O payload de um JWT é **base64, não criptografia**: qualquer um lê. Por isso só vão dados não sensíveis, e a foto vai como **URL**, nunca como imagem.

---

## 🛠️ Passo 1 — Gerar o par de chaves

Crie `apps/api/scripts/generate-jwt-key.ts`. Ele usa só o `node:crypto`, sem dependência:

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

Copie as duas linhas da saída para o seu `.env`, substituindo as vazias.

- **Por que base64:** a chave PEM tem várias linhas. Em base64 vira **uma linha só**, que funciona em qualquer `.env` e em qualquer painel de variáveis de ambiente.
- **Só existe a chave privada:** a pública é derivada dela no boot (passo 3).

## 🛠️ Passo 2 — Configuração

Acrescente ao `envSchema` em `src/config/env.ts`:

```ts
  JWT_KEY_ID: z.string().min(1),
  JWT_PRIVATE_KEY: z.string().min(1),
```

## 🛠️ Passo 3 — `TokenService` (`modules/sso/token.service.ts`)

Ele assina e publica a chave, e mais nada. Também não sabe nada de usuários nem de apps.

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

```powershell
pnpm --filter api add jose
```

> **Divisão de trabalho:** o `node:crypto` lê a chave e deriva a pública (`createPublicKey`), e o `jose` só monta e assina o JWT. Cada um faz o que faz melhor, e nada é reimplementado à mão.

## 🛠️ Passo 4 — `SsoService` (`modules/sso/sso.service.ts`)

Aqui ficam as regras: qual app pediu, se o usuário tem acesso e com qual nível.

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { LauncherApp, SondoUser, TokenResponse } from '@sondohub/contracts';
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

  listApps(userId: string): Promise<LauncherApp[]> {
    return this.apps.listForUser(userId);
  }
}
```

> **Por que devolver `user` junto com o token?** Assim o front **nunca decodifica o JWT**. Para o front o token é opaco: ele só o repassa ao backend. Se um dia o formato do token mudar, nenhum front quebra.

## 🛠️ Passo 5 — Controllers e módulo (`modules/sso/`)

**`sso.controller.ts`**: as três rotas que os apps chamam.

```ts
import { Controller, Get, Headers, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { clearSessionCookie } from '../sessions/session-cookie.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { SsoService } from './sso.service.js';

@Controller('sso')
export class SsoController {
  constructor(
    private readonly sso: SsoService,
    private readonly sessions: SessionsService,
  ) {}

  @Post('token')
  @HttpCode(200)
  issueToken(@CurrentAuth() auth: AuthContext, @Headers('origin') origin?: string) {
    return this.sso.issueToken(auth.user, origin);
  }

  @Get('apps')
  listApps(@CurrentAuth() auth: AuthContext) {
    return this.sso.listApps(auth.user.id);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentAuth() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
    clearSessionCookie(res);
  }
}
```

**`jwks.controller.ts`**: é a única rota pública além do login.

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

Registre o `SsoModule` nos `imports` do `AppModule`.

> **O logout está no SSO, e não no `auth`, de propósito:** os apps precisam chamá-lo, e só `/api/sso/*` aceita outros origins. Assim, sair em qualquer app encerra a sessão do hub inteiro (**logout único**).

## 🛠️ Passo 6 — CORS dinâmico (`common/security/cors.ts`)

```ts
import type { Request } from 'express';
import type { OriginPolicy } from './origin-policy.js';

type CorsCallback = (error: Error | null, options: { origin: boolean; credentials?: boolean }) => void;

/** CORS dinâmico com a mesma regra do OriginGuard: só apps cadastrados, só em /api/sso/*. */
export function corsFor(originPolicy: OriginPolicy) {
  return (req: Request, callback: CorsCallback) => {
    originPolicy
      .isAllowed(req.get('origin'), req.path)
      .then((allowed) => callback(null, { origin: allowed, credentials: true }))
      .catch((error: Error) => callback(error, { origin: false }));
  };
}
```

**`main.ts`** completo:

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

**Por que assim:**

- **Origin dinâmico:** a lista de origins vem **do banco**, então um app cadastrado no admin já funciona, sem reiniciar a API.
- **`credentials: true`:** sem ele, o navegador não manda o cookie da sessão nas chamadas do app.
- **O `CorsCallback` é tipado à mão:** no Nest 12, `enableCors` recebe `any`, e o TypeScript não teria como inferir o tipo (testado: dá TS7006 sem a tipagem).

> **CORS não é autenticação.** O CORS só decide se o **navegador** deixa o JavaScript **ler** a resposta. Quem barra de verdade são o `OriginGuard` e o `SessionGuard`. Por isso a regra é uma só (`OriginPolicy`) e é aplicada nos dois lugares.

---

## ✅ Checkpoint

Reinicie o `pnpm dev`, porque o `.env` mudou.

**1. JWKS público, só com a chave pública:**

```powershell
Invoke-RestMethod http://localhost:5180/api/.well-known/jwks.json | ConvertTo-Json -Depth 5
```

Esperado: `kty: RSA`, `alg: RS256`, o seu `kid`, os campos `n` e `e`, e **nenhum campo `d`** (que seria a parte privada).

**2. Token pedido "como se fosse" o app demo** (login da aula 04 na variável `$s`):

```powershell
$token = Invoke-RestMethod http://localhost:5180/api/sso/token -Method Post -Headers @{ Origin = 'http://localhost:5181' } -WebSession $s
$token.user
node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1], 'base64url')))" $token.accessToken
```

Esperado: `user` com `level 3`, e o payload decodificado com `aud: 'demo'`, `iss: 'http://localhost:5180'` e `exp - iat = 600`.

> 🔒 **Nunca cole tokens reais no jwt.io** nem em sites do tipo. Um token válido é uma credencial. Decodifique sempre localmente, como acima.

**3. O que precisa falhar:**

| Teste | Esperado |
|---|---|
| `/sso/token` com `Origin = 'https://evil.example'` | **403** (`OriginGuard`: não é um app cadastrado) |
| `/sso/token` com `Origin` do demo, logado como `leitor@…` sem acesso | Antes, remova o acesso dele no Studio → **403** "Sem acesso a este app" |
| `POST /api/sso/logout` com `-WebSession $s`, depois `/sso/token` de novo | **204**, depois **401** (sessão revogada) |

**Testado:** um token assinado por este `TokenService` foi aceito por um backend usando o JWKS (`aud` certo, níveis 2 e 3). Também foi recusado quando o `aud` era de outro app ou a assinatura tinha sido alterada.

---

## ⚠️ Atenção

- **`iss` precisa bater exatamente:** o `HUB_URL` do hub e o `hubUrl` que os apps usam têm de ser **idênticos**, sem barra no final num e sem no outro. Senão, todo token é recusado com erro de `iss`.
- **A chave privada é o bem mais valioso do sistema.** Com ela, alguém emite token de qualquer usuário para qualquer app. Ela fica só no `.env` do hub (em produção, num cofre de segredos), nunca no git, nunca com prefixo `VITE_`.
- **Rotação (Fase futura):**
  1. gere uma chave nova;
  2. publique as duas no JWKS;
  3. passe a assinar com a nova;
  4. depois de 10 min (o TTL do token), remova a antiga.

## 🏋️ Exercícios

1. Por que o `SsoController.issueToken` **não** recebe o slug do app no body, se seria mais simples?
2. O que acontece com um usuário que está com o app aberto quando o admin remove o acesso dele?

<details>
<summary>Respostas</summary>

1. Porque o cliente poderia mentir: um XSS no app A mandaria `{"app": "B"}`. O `Origin` é preenchido pelo navegador e o JavaScript não consegue alterá-lo.
2. O token atual continua válido até expirar (no máximo 10 min). Na renovação, o `/sso/token` responde 403, e o SDK (aula 07) mostra a tela "sem acesso". O "até 10 min" é a troca consciente que fizemos para os apps não consultarem o hub a cada requisição.

</details>

➡️ Próximo: [06 — Hub: login e launcher](06-aula-hub-front.md)
