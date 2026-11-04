# 14 — SDK publicado e as portas do Gêmeo fechadas

> 🎯 **Objetivo:**
> - Os três pacotes (`@sondohub/contracts`, `@sondohub/client` e `@sondohub/server`) publicados no **GitHub Packages**, na org `sondohub`.
> - O Gêmeo instalando o SDK **por versão**, e não mais por `link:`. Com isso, o CI do back consegue instalar.
> - O back do Gêmeo **sem nenhuma rota aberta**:
>   - **pessoas** entram pelo hub ou pelo login próprio do Gêmeo;
>   - **máquinas** (sensores, gateway, Tandem) entram com uma chave;
>   - o `POST /createTokenAPI` deixa de existir.
>
> | Hoje | Depois desta aula |
> |---|---|
> | `curl https://gds-techlab.sondotecnica.com/sensors` → **200**, sem login nenhum | **401** |
> | Qualquer um cria e altera sensores (`POST`/`PATCH /sensors`) | Só quem é **Gestor** no hub, ou quem usa o login próprio |
> | `POST /createToken` entrega o token do Autodesk a quem pedir | **401** sem a chave das máquinas |
> | `"@sondohub/client": "link:..\\monorepo\\..."` (só compila no seu Windows) | `"@sondohub/client": "^0.1.0"` (compila em qualquer máquina e no CI) |

---

## 🧠 Conceito 1: por que um registry, e por que o escopo importa

O `link:` aponta para uma pasta **da sua máquina**. No runner do GitHub, que roda o deploy do back, essa pasta não existe e o `pnpm install` falha. Os `link:` do front usam `\`, então ele só compila no Windows. Um registry resolve os dois casos: qualquer máquina instala a mesma versão, pelo número.

**O escopo é o nome do dono.** No GitHub Packages, `@sondohub/client` só pode ser publicado por uma conta ou org chamada `sondohub`. Por isso criamos a org: nenhum `import` muda.

**O `.npmrc` de cada app diz onde procurar:**

```
@sondohub:registry=https://npm.pkg.github.com
```

Sem essa linha, o pnpm procura `@sondohub/client` no **npm público** (`registry.npmjs.org`). No teste desta aula, foi exatamente isso que aconteceu. Hoje esse nome não existe lá. Mas, se alguém registrar o escopo `@sondohub` no npm público, todo projeto que esquecer o `.npmrc` vai instalar o código **dessa pessoa** no lugar do seu. Esse ataque se chama *dependency confusion*. Por isso o `.npmrc` vai para o git em todo app que usa o SDK.

## 🧠 Conceito 2: o token mora na máquina, nunca no repositório

O GitHub Packages exige token **até para ler**. É preciso um token *classic*, porque os *fine-grained* não funcionam com o registry npm do GitHub.

| Onde | Para quê | Escopo do token | Como entra |
|---|---|---|---|
| Seu PC | Publicar o SDK e instalar no Gêmeo | `write:packages` | `pnpm config set` (Passo 1.2) |
| GitHub Actions do back | `pnpm install` do CI | `read:packages` | Secret `SONDOHUB_PACKAGES_TOKEN` (Passo 2.8) |
| VM do back | `pnpm install --prod` depois do deploy | o mesmo do CI | O workflow repassa a cada deploy (Passo 2.8) |

**Por que não um `${NODE_AUTH_TOKEN}` no `.npmrc` do projeto**, como a maioria dos tutoriais mostra: o pnpm 11 e o 12 **ignoram** variável de ambiente em credencial que vem de um `.npmrc` de projeto. Testado: o pnpm avisa e não manda o token. O motivo é que esse arquivo vai para o git, e um `.npmrc` malicioso poderia apontar o registry para um servidor de outra pessoa e receber o seu token.

Então a divisão fica assim: o `.npmrc` do projeto diz **onde**, e a configuração do usuário guarda **com qual token**. O `pnpm config set` grava em `%LOCALAPPDATA%\pnpm\config\auth.ini` no Windows e em `~/.config/pnpm/auth.ini` no Linux.

## 🧠 Conceito 3: as portas do Gêmeo

O back do Gêmeo atende três tipos de cliente. Hoje quase tudo está aberto:

| Rota | Quem chama | Hoje | Depois |
|---|---|---|---|
| `GET /sensors`, `GET /bimModels`, `GET /monitor/series` e `/monitor/series/:hardware` | o front | **aberta** | hub **ou** login próprio |
| `POST /sensors`, `PATCH /sensors/:id` | o front | **aberta** | idem, e **Gestor** se for pelo hub |
| `POST /monitor/online`, `/monitor-connections-change/:id`, `/send` | sensores, gateway | **aberta** | chave das máquinas |
| `POST /createToken`, `/getModel` | integração com o Tandem | **aberta**, e entrega o token do Autodesk | chave das máquinas |
| `POST /monitor-connections`, `/monitor-connections/:id`, `/dataLog`, `/debug` | sensores | token do login próprio, que **expira** e nenhum sensor tem | chave das máquinas |
| `POST /createTokenAPI` | ninguém | **aberta**: gera um JWT sem login, que nunca expira | **apagada** |
| `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/session` | o front (login próprio) | pública | pública: é a porta de entrada do login |
| `GET /` | navegador | pública | pública (página de informação) |

**Por que uma chave para as máquinas, e não o hub:** sensor não faz login. O hub emite token **para pessoas**, com nome, e-mail e nível. Uma máquina só precisa provar que é nossa.

**Por que uma chave fixa, e não um JWT:** o JWT resolveria um problema que as máquinas não têm, que é carregar dados e expirar sozinho. Com a chave não há validade para controlar. Para revogar, você troca o valor no `.env` e no gateway.

**Por que o header `X-Api-Key`, separado do `Authorization`:** uma credencial de máquina nunca se confunde com a de uma pessoa. Testado: um token válido do hub numa rota de máquina leva **401**.

**Por que as portas ficam em duas listas no `server.ts`:** é um lugar só para ler e revisar quem protege o quê. O `app.use(lista, guarda)` casa pelo **prefixo**, então `"/monitor-connections"` cobre também `/monitor-connections/:id`.

E há uma armadilha que essa forma evita: as rotas de máquina moram no `routes.ts`, que é montado em `/`. Um `router.use(requireDeviceKey)` dentro dele valeria para **todas** as requisições do back, inclusive `/sensors`, e derrubaria o front.

**Os dois logins continuam.** O front marca o método usado: com o hub, ele manda o token no header `Authorization`; com o login próprio, o navegador manda o cookie `accessToken`. O `requireUser` olha **qual dos dois chegou** e chama o verificador certo.

---

## Parte 1 — Publicar o SDK

### 🛠️ Passo 1.1 — A org `sondohub`

No GitHub: **+** (canto superior direito) → **New organization** → plano **Free**.
- Nome: `sondohub`.
- Pertence a: **My personal account**.

O repositório do hub continua no seu usuário. O pacote não precisa morar na mesma conta do código.

### 🛠️ Passo 1.2 — O token do seu PC

GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**. Marque `write:packages`, que já inclui a leitura, e escolha uma validade.

No PowerShell, de qualquer pasta:

```powershell
$token = Read-Host "Token do GitHub (classic)" -MaskInput
pnpm config set "//npm.pkg.github.com/:_authToken" $token
Remove-Variable token
```

O `Read-Host -MaskInput` evita que o token apareça na tela e no histórico do PowerShell. É feito **uma vez por máquina**: o mesmo token serve para publicar o SDK e para instalar o pacote no Gêmeo.

### 🛠️ Passo 1.3 — Os pacotes deixam de ser privados (`packages/*/package.json`)

Nos três (`contracts`, `client` e `server`):

- **apague** a linha `"private": true`;
- **acrescente** no fim:

```json
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
```

O `"private": true` existe justamente para impedir a publicação, e o `publishConfig` diz **para onde** publicar. Os apps (`api`, `hub` e `demo`) continuam com `"private": true` e nunca são publicados.

Só no `packages/client/package.json`, afrouxe também o peer do React:

```json
  "peerDependencies": {
    "react": "^19.0.0"
  }
```

O SDK só usa recursos do React 19.0 (`use`, `<Context value>`, `<style precedence>`). O Gêmeo está no **19.2.8**, e com `^19.3.1` o pnpm avisaria de peer não atendido (aula 07b).

No `package.json` da **raiz**, um script ao lado dos `db:*`:

```json
    "sdk:publish": "pnpm --filter \"@sondohub/*\" build && pnpm --filter \"@sondohub/*\" publish"
```

Ele compila **antes** de publicar, então não tem como sair uma `dist` velha.

### 🛠️ Passo 1.4 — Publicar

Commite, faça o merge na `main` e, no PC:

```powershell
git switch main
git pull
pnpm sdk:publish
```

O que o pnpm faz:

- **Troca o `workspace:*` pela versão real.** No pacote publicado, o client depende de `"@sondohub/contracts": "0.1.0"`. O link do monorepo nunca sai daqui.
- **Leva só a `dist` e o `package.json`**, por causa do `"files": ["dist"]` que os pacotes já têm.
- **Recusa publicar** fora da `main`, com alteração não commitada ou com a branch atrás do GitHub. É a mesma disciplina do deploy (`deploy/README.md`): o que está publicado sempre corresponde a um commit que existe.

### ✅ Checkpoint 1

| Teste | Esperado |
|---|---|
| `github.com/orgs/sondohub/packages` | Os três pacotes, versão `0.1.0`, **privados** |
| `pnpm sdk:publish` de novo, sem mudar a versão | Nada é publicado: o pnpm pula a versão que já está no registry, porque uma versão publicada nunca é sobrescrita |

**Outra pessoa vai instalar**, por exemplo quem também mexe no Gêmeo? Convide essa pessoa para a org e dê **Read** em cada pacote (página do pacote → **Package settings** → **Manage access**). Depois ela faz o Passo 1.2 com um token dela.

### 🛠️ Passo 1.5 — Versões novas, depois

**Regra simples: os três pacotes andam juntos, sempre na mesma versão.** Mudou qualquer um? Suba o `"version"` dos três, commite e rode o `pnpm sdk:publish`. Assim não existe client `0.2.0` com contracts `0.1.0` e tipo desencontrado.

- `0.1.0` → `0.1.1`: correção.
- `0.1.0` → `0.2.0`: mudou algo que o app usa. Enquanto a versão começa com `0.`, qualquer mudança no segundo número pode quebrar quem usa.

Nos apps, o `^0.1.0` aceita só `0.1.x`. Para pegar uma `0.2.0`:

```powershell
pnpm add @sondohub/server@latest
```

---

## Parte 2 — O back do Gêmeo (`gemeo-digital`)

### 🛠️ Passo 2.1 — Instalar o `@sondohub/server`

Crie o `.npmrc` na raiz do repositório (ele **vai** para o git):

```
@sondohub:registry=https://npm.pkg.github.com
```

```powershell
pnpm add @sondohub/server
```

### 🛠️ Passo 2.2 — As duas variáveis novas

Gere a chave das máquinas:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

No `.env` local:

```
#SONDOHUB (igual, caractere por caractere, ao HUB_URL do hub: é o "iss" do token)
HUB_URL=http://localhost:5180
# Chave dos sensores e integrações: vai no header X-Api-Key
DEVICE_API_KEY=<a chave gerada>
```

No `.env.dev`, que é o modelo commitado, só os nomes, **sem a chave**: `HUB_URL=` e `DEVICE_API_KEY=`.

### 🛠️ Passo 2.3 — As portas (`src/server.ts`)

Três mudanças. **Primeira:** o `.env` passa a carregar **antes de qualquer outro módulo**. A primeira linha depois do comentário do topo fica assim:

```ts
import "dotenv/config"; // primeiro de todos: carrega o .env antes de qualquer módulo ler o process.env
import express from "express";
```

E saem o `import dotenv from "dotenv";` e o `dotenv.config();`.

> **Por que isso muda o que a aula 07b fez:** num módulo ESM, todos os `import` rodam **antes** do corpo do arquivo. O `dotenv.config()` no corpo do `server.ts` rodava **depois** de as rotas carregarem. Por isso, na 07b, o `requireUser` tinha que ser criado dentro do `server.ts`.
>
> O `import "dotenv/config"` é um import, e o **primeiro**, então roda antes de todos os outros. Agora qualquer módulo pode ler o `process.env` ao carregar, e os middlewares podem morar em `middlewares/`. De brinde, o `monitor.ts` deixa de depender da sorte de o `routes.ts` chamar o `dotenv.config()` antes dele.

**Segunda**, nos imports das rotas:

```ts
import { requireUser } from "./middlewares/requireUser.js";
import { requireDeviceKey } from "./middlewares/requireDeviceKey.js";
```

**Terceira**, logo depois do `app.use(cookieParser());` e **antes** do `//routes`:

```ts
// ── As portas ──
// Pessoas: o front, com o login do hub ou com o login próprio do Gêmeo.
const PEOPLE_ROUTES = ["/sensors", "/bimModels", "/monitor/series"];

// Máquinas: sensores, gateway e integrações com o Tandem.
// "/monitor-connections" também cobre "/monitor-connections/:id": o app.use casa pelo prefixo.
const DEVICE_ROUTES = [
  "/monitor/online",
  "/monitor-connections",
  "/monitor-connections-change",
  "/dataLog",
  "/send",
  "/createToken",
  "/getModel",
  "/debug",
];

// Antes das rotas: o Express roda tudo na ordem em que foi registrado.
app.use(PEOPLE_ROUTES, requireUser);
app.use(DEVICE_ROUTES, requireDeviceKey);
```

O bloco `//routes` continua **igual**. As rotas não sabem que estão protegidas: a porta fica na entrada, não dentro de cada sala.

- **Por que antes do `//routes`:** se o `app.use(routes)` viesse antes, a rota já teria respondido quando a porta fosse conferida.
- **E depois do `cookieParser()`:** o login próprio lê o cookie, e o cookie só existe em `req.cookies` depois dele.
- **O preflight do CORS** (`OPTIONS`) continua funcionando: o `app.use(cors(...))` vem antes e responde sozinho. Testado: 200.

### 🛠️ Passo 2.4 — Pessoas (`src/middlewares/requireUser.ts`, novo)

```ts
import type { RequestHandler } from "express";
import { sondoAuth } from "@sondohub/server";
import ownLogin from "./auth.js";

// "gemeo" é o slug do app no hub: um token emitido para outro app é recusado.
const hubLogin = sondoAuth({ hubUrl: process.env.HUB_URL!, audience: "gemeo" });

/**
 * Rotas de pessoas. O Gêmeo aceita dois logins, e cada um chega de um jeito:
 * - pelo hub: o front manda o token do hub no header Authorization;
 * - pelo login próprio: o navegador manda o cookie accessToken.
 */
export const requireUser: RequestHandler = (req, res, next) =>
  req.get("authorization")
    ? hubLogin(req, res, next)
    : ownLogin(req, res, next);
```

- **Uma função, uma decisão:** qual verificador usar. A conferência do token é dos dois middlewares que já existiam: o `sondoAuth` do SDK e o `middlewares/auth.ts` do Gêmeo. Nenhum dos dois foi reescrito.
- **Com header, só o hub vale.** Um JWT do login próprio mandado no header leva **401** (testado). Nas rotas de pessoas, o login próprio entra só pelo cookie, que é como o front já faz.

### 🛠️ Passo 2.5 — Máquinas (`src/middlewares/requireDeviceKey.ts`, novo)

```ts
import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * Rotas de máquina (sensores, gateway, Tandem). Máquina não faz login no hub,
 * então prova que é nossa com a chave do .env, enviada no header X-Api-Key.
 */
export const requireDeviceKey: RequestHandler = (req, res, next) => {
  if (!isDeviceKey(req.get("x-api-key"))) {
    res.sendStatus(401);
    return;
  }
  next();
};

// Sem DEVICE_API_KEY no .env ninguém passa: na dúvida, a porta fica fechada.
// O timingSafeEqual não deixa o tempo de resposta revelar quantos caracteres bateram.
function isDeviceKey(received = ""): boolean {
  const expected = Buffer.from(process.env.DEVICE_API_KEY ?? "");
  const actual = Buffer.from(received);
  return (
    expected.length > 0 &&
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}
```

- **`requireDeviceKey` responde; `isDeviceKey` só compara.** Separadas, a regra de comparação se lê sozinha, sem `req` e `res` no meio.
- **Por que não `received === process.env.DEVICE_API_KEY`:** o `===` para no primeiro caractere diferente, então quem mede o tempo de resposta consegue, em tese, descobrir a chave caractere por caractere. O `timingSafeEqual` sempre compara tudo. Ele exige tamanhos iguais, e é por isso que o tamanho é conferido antes.
- **Falha fechada:** se esquecer o `DEVICE_API_KEY` no `.env`, as máquinas tomam 401. Elas nunca passam sem chave.

### 🛠️ Passo 2.6 — Fechar e limpar (`src/routes/routes.ts`)

- **Apague** o bloco inteiro do `createTokenAPI`: do comentário `Criar token jwt` até o fim da rota `router.post('/createTokenAPI', ...)`. Isso inclui o `import jwt` e a `interface TokenParams`, que só ele usava.
- **Tire o `auth,`** das quatro rotas que o usavam. Agora quem guarda essas rotas é o `DEVICE_ROUTES` do `server.ts`:

```ts
router.post('/monitor-connections', async (req: Request, res: Response) => {
router.post('/monitor-connections/:id', async (req: Request, res: Response) => {
router.post('/debug', async (req: Request, res: Response) => {
router.post('/dataLog', async (req: Request, res: Response) => {
```

- **Apague** o `import auth from '../middlewares/auth.js'`, que ficou sem uso.

**Por que tirar o `auth` dessas rotas:** com as duas guardas juntas, a máquina precisaria da chave **e** de um token de usuário do login próprio. Esse token expira e nenhum sensor tem, então as rotas seguiriam fechadas também para quem deveria entrar.

### 🛠️ Passo 2.7 — O nível (`src/routes/sensors.ts`)

É o mesmo `requireLevel` da aula 07b, com uma diferença: o login próprio não tem nível.

```ts
import { Router, Request, Response, RequestHandler } from "express";
// ...os outros imports continuam iguais

const router: Router = Router();

// Os mesmos níveis cadastrados no hub para o app "gemeo".
const Level = { READ: 1, MANAGER: 2 } as const;

/**
 * Só deixa passar quem tem, NESTE app, pelo menos o nível pedido.
 * Só o token do hub traz nível: quem entrou pelo login próprio do Gêmeo
 * (sem req.sondoUser) continua com acesso total, como era antes do hub.
 */
function requireLevel(minLevel: number): RequestHandler {
  return (req, res, next) => {
    if (req.sondoUser && req.sondoUser.level < minLevel) {
      res.sendStatus(403);
      return;
    }
    next();
  };
}

router.post(
  "/",
  requireLevel(Level.MANAGER),
  async (req: Request, res: Response): Promise<void> => {
    // ...corpo igual
  },
);

router.patch(
  "/:id",
  requireLevel(Level.MANAGER),
  async (req: Request, res: Response): Promise<void> => {
    // ...corpo igual
  },
);
```

- **Por que fica no `sensors.ts`:** é o único lugar que usa. O `requireLevel` só vai para um arquivo próprio, ou para o `@sondohub/server`, quando outro router ou outro app precisar (aula 07b).
- **401 ou 403?** 401 é "não sei quem você é". 403 é "sei quem você é, e você não pode fazer isso".

### ✅ Checkpoint 2 (local, antes do deploy)

Com o hub local no ar e o `cookies.txt` do admin (aula 03), na pasta do sondohub:

```powershell
$r = curl.exe -s -b cookies.txt -X POST http://localhost:3100/api/sso/token -H "Origin: http://localhost:5173" | ConvertFrom-Json
curl.exe -i http://localhost:<PORT>/sensors -H "Authorization: Bearer $($r.accessToken)"
curl.exe -i http://localhost:<PORT>/sensors
curl.exe -i -X POST http://localhost:<PORT>/monitor/online
curl.exe -i -X POST http://localhost:<PORT>/monitor-connections -H "X-Api-Key: <a chave do .env>" -H "Content-Type: application/json" -d '{"id":7}'
curl.exe -i -X POST http://localhost:<PORT>/createTokenAPI
```

| Teste | Esperado |
|---|---|
| `/sensors` com o token do hub | 200 |
| `/sensors` sem nada | 401 |
| `/sensors` logado pelo login próprio, no navegador | Os sensores aparecem, como antes |
| Criar sensor com um usuário **Leitura** do hub | 403 |
| `POST /monitor/online` sem chave | 401 |
| `POST /monitor-connections` com a chave | 200 `{"id":7}` |
| `POST /createTokenAPI` | 404 |

### 🛠️ Passo 2.8 — O CI (`.github/workflows/deploy.yml`)

**O secret:** crie um token *classic* só com `read:packages` (o do Passo 1.2 tem escrita, e o CI não precisa de escrita). No repositório `gemeo-digital`: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, com o nome `SONDOHUB_PACKAGES_TOKEN`.

**No runner**, antes do `Instalar dependências`:

```yaml
      # O @sondohub/server vem do GitHub Packages, que exige token até para ler.
      - name: Token do GitHub Packages
        run: pnpm config set "//npm.pkg.github.com/:_authToken" "$NODE_AUTH_TOKEN"
        env:
          NODE_AUTH_TOKEN: ${{ secrets.SONDOHUB_PACKAGES_TOKEN }}
```

**O `.npmrc` vai junto para a VM**, porque sem ele o `pnpm install` da VM procuraria no npm público:

```yaml
          source: "dist,package.json,pnpm-lock.yaml,pnpm-workspace.yaml,.npmrc"
```

**Na VM**, o mesmo token. O `envs` do `ssh-action` repassa a variável para o script:

```yaml
      - name: Instalar dependências e reiniciar no PM2
        uses: appleboy/ssh-action@v1
        env:
          NODE_AUTH_TOKEN: ${{ secrets.SONDOHUB_PACKAGES_TOKEN }}
        with:
          envs: NODE_AUTH_TOKEN # repassa a variável para o script que roda na VM
          # ...host, username, key e port continuam iguais
          script: |
            set -e
            cd ${{ env.VM_DEPLOY_PATH }}
            pnpm config set "//npm.pkg.github.com/:_authToken" "$NODE_AUTH_TOKEN"
            pnpm install --prod --frozen-lockfile
            pm2 restart ${{ env.PM2_APP_NAME }} || pm2 start dist/server.js --name ${{ env.PM2_APP_NAME }}
```

**Por que gravar o token a cada deploy, e não uma vez à mão na VM:** assim o token fica em **um lugar só**, o secret. Quando ele vencer, você troca no GitHub e o próximo deploy leva o novo.

### 🛠️ Passo 2.9 — A ordem do deploy (sem derrubar os sensores)

Faça nesta ordem:

1. **No `.env` do back na VM** (na pasta do deploy, ao lado da `dist`), acrescente:
   - `HUB_URL=https://hub.sondotecnica.com`, sem barra no fim;
   - `DEVICE_API_KEY=<uma chave nova>`. Gere outra, diferente da de dev.

   Sem o `HUB_URL`, o back novo cai no boot com `Invalid URL`, e o PM2 fica reiniciando.
2. **No gateway dos sensores**, e em tudo o que chama as rotas de máquina, acrescente o header `X-Api-Key: <a chave da VM>`. Onde estiver configurada a URL do `gds-techlab`: Home Assistant (`rest_command`), Node-RED, script.

   O back atual ignora headers que não conhece, então dá para fazer isso **antes** sem quebrar nada.
3. **Merge na `main`.** O workflow publica e reinicia o back.
4. Confira o checkpoint final.

---

## Parte 3 — O front do Gêmeo (`app-gemeo-digital-hotel-fairmont`)

### 🛠️ Passo 3.1 — Trocar o `link:` pela versão publicada

Crie o mesmo `.npmrc` do back na raiz:

```
@sondohub:registry=https://npm.pkg.github.com
```

```powershell
pnpm remove @sondohub/client @sondohub/contracts
pnpm add @sondohub/client
```

**Por que o `contracts` sai:** nenhum arquivo do front importa dele. Ele só estava ali porque um pacote via `link:` não traz as próprias dependências. Instalado do registry, o client já traz o contracts junto.

O `dedupe: ["react", "react-dom"]` do `vite.config.ts` também era para o `link:`, que via o React do monorepo. Agora o client usa o React do próprio app. O `dedupe` pode ficar sem prejuízo, ou sair.

### 🛠️ Passo 3.2 — O endereço do hub no build (`.env.production`)

```
VITE_HUB_URL=https://hub.sondotecnica.com
VITE_API_URL=https://gds-techlab.sondotecnica.com/
```

Sem o `VITE_HUB_URL`, o `hubEnabled` vira `false` e o clique no launcher do hub cai na tela de login do Gêmeo. Esse era o bug de produção. Commite o arquivo: ele só tem endereços públicos. Toda variável `VITE_*` acaba no JavaScript que o navegador baixa, então nunca ponha segredo nelas.

### 🛠️ Passo 3.3 — Build e deploy

`pnpm build` e suba a `dist` como você já faz.

---

## ✅ Checkpoint final (produção)

| # | Teste | Esperado |
|---|---|---|
| 1 | `curl.exe -i https://gds-techlab.sondotecnica.com/sensors` | **401** (antes: 200) |
| 2 | `curl.exe -i -X POST https://gds-techlab.sondotecnica.com/createTokenAPI` | **404** |
| 3 | `curl.exe -i -X POST https://gds-techlab.sondotecnica.com/createToken` | **401** |
| 4 | Hub → clicar no Gêmeo | Abre o dashboard, sem pedir login |
| 5 | Login próprio do Gêmeo | Continua funcionando |
| 6 | Usuário **Leitura** do hub tenta criar um sensor | Erro 403, e o sensor não é criado |
| 7 | Gráficos do dashboard | Continuam recebendo dados novos: o gateway manda a chave |
| 8 | Último deploy no Actions do `gemeo-digital` | Verde, com o `pnpm install` baixando o `@sondohub/server` |

---

## 🧯 Erros comuns

| Sintoma | Causa | Solução |
|---|---|---|
| `GET https://registry.npmjs.org/@sondohub%2F...: Not Found - 404` | Falta o `.npmrc`, ou ele não foi para a VM | Passo 2.1 / 3.1. Na VM, confira o `source` do `scp` (2.8) |
| `401` ou `403` vindo de `npm.pkg.github.com` | Sem token, token vencido ou sem `read:packages` | Passo 1.2 no PC; no CI, o secret (2.8) |
| `404` vindo de `npm.pkg.github.com` | O pacote não foi publicado, ou essa conta não tem acesso a ele | Checkpoint 1; **Manage access** do pacote |
| `[WARN] Ignored project-level auth setting` | Token num `.npmrc` de projeto | Tire de lá e use o `pnpm config set` (Conceito 2) |
| `ERR_PNPM_GIT_...` no `sdk:publish` | Fora da `main`, com alteração sem commit ou atrás do GitHub | `git switch main`, `git pull` e o `git status` limpo |
| Back reiniciando no PM2 com `Invalid URL` | Falta o `HUB_URL` no `.env` da VM | Passo 2.9 |
| Todos os sensores tomando 401 | Falta o `DEVICE_API_KEY` na VM, ou o gateway sem o header | Passo 2.9; compare as duas chaves |
| Front com "Não foi possível falar com o SondoHub" | `VITE_HUB_URL` errado, ou o Gêmeo não está cadastrado com o origin `https://app-gds.sondotecnica.com` | Passo 3.2; o cadastro no admin do hub |

---

## ⏳ O que ficou para depois (de propósito)

| Hoje | Por quê | Quando mexer |
|---|---|---|
| O login próprio **não tem nível**: quem entra por ele cria e altera sensores | Foi a sua escolha manter os dois logins, e o login próprio nunca teve nível | Quando todo mundo tiver conta no hub, o login próprio sai (lista de limpeza da 07b), e com ele o `jsonwebtoken`, o `bcryptjs` e os cookies |
| **Rota nova nasce aberta** até entrar numa das listas do `server.ts` | Proteger tudo por padrão exigiria reorganizar as rotas de máquina sob um prefixo, e mudar a URL que os sensores já usam | Regra: criou rota, ela entra em `PEOPLE_ROUTES` ou em `DEVICE_ROUTES` no mesmo commit |
| **Uma chave** para todas as máquinas | Hoje é um gateway só | Uma chave por dispositivo, quando houver vários e for preciso cortar um sem mexer nos outros |
| O token do CI é **seu** (conta pessoal) | É o mais simples para começar | Se você sair da org, o deploy do back para. Troque por uma conta de serviço da empresa |
| O back **cai no boot** se o Autodesk recusar o token: o construtor do `TandemAutoDesk` chama o `CreateToken()` sem `catch` | Já era assim antes desta aula | Um `.catch` com log no construtor |

> **Como esta aula foi testada (30/10/2026), em clones descartáveis, sem publicar nada:**
> - **Pacotes:** as mudanças do Passo 1.3 foram aplicadas num clone do monorepo e empacotadas com `pnpm pack`. Os três tarballs saíram só com `dist` e `package.json`, o `workspace:*` virou `0.1.0`, e o `pnpm publish --dry-run` mostrou os três indo para `npm.pkg.github.com`.
> - **Back do Gêmeo:** o pacote foi instalado a partir do tarball, as mudanças da Parte 2 foram aplicadas, e o `tsc --noEmit` e o `pnpm build` passaram (TypeScript 5.9). O servidor subiu com um hub falso (JWKS e tokens RS256 com a mesma regra do hub real). Das 31 checagens, todas deram o esperado: hub gestor, leitor e de outro app; token adulterado; login próprio por cookie e por header; chave certa, errada e ausente; preflight do CORS; `createTokenAPI` 404.
> - **Front do Gêmeo:** o `pnpm remove`/`pnpm add` do Passo 3.1 rodou contra o tarball, e o `tsc -b` e o `vite build` passaram, sem aviso de peer com React 19.2.8.
> - **Token:** o `pnpm config set` foi testado num perfil descartável, com o pnpm 11.25 (o do Gêmeo) e o 12.11 (o do monorepo), contra um registry falso. Os dois mandaram o `Bearer`. O token num `.npmrc` de projeto foi ignorado, com aviso.
> - **Workflow:** o YAML do Passo 2.8 foi validado com o parser.
> - **Não testado:** a publicação real no GitHub (a org ainda não existe), uma execução real do Actions e a VM.
