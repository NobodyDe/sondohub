# Aula 07b — Plugando o Gêmeo Digital

> 🎯 **Objetivo:** o Gêmeo Digital deixa de ter login próprio e passa a usar o hub:
>
> - abre o gêmeo sem sessão → login do hub → volta logado no `/dashboard`;
> - o back do gêmeo confere o token e o **nível**;
> - o ▦ e o **Sair** ficam no cabeçalho.
>
> **Pré-requisito:** [aula 07](07-aula-app-consumindo-o-hub.md) funcionando com o demo. O gêmeo **já está cadastrado** no seu banco (`slug: gemeo`, origin `http://localhost:5173`, admin com nível 2).
>
> **Repositórios** (todos em `Desktop/projects`): front `app-gemeo-digital-hotel-fairmont`, back `gemeo-digital` (o `gemeo-digital-hotel-fairmont` no GitHub) e `monorepo/sondohub`.

---

## 🧠 Conceito: o cookie não viaja, quem viaja é o token

| Pergunta                          | Resposta                                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Como o app passa o cookie?        | **Não passa.** O cookie do hub é `HttpOnly`, então o JavaScript do gêmeo nem consegue lê-lo. Quem anexa o cookie é o **navegador**, sozinho, quando o SDK chama `hub/api/sso/token` com `credentials: "include"`. |
| Como o app recebe o usuário?      | Na resposta desse POST: `{ accessToken, expiresIn, user }`. O front usa o `user` pronto (`useSondoAuth().user`) e não decodifica o JWT.                                                                           |
| Como o back valida?               | O front manda `Authorization: Bearer <accessToken>`. O back confere a **assinatura** com a chave pública do hub (JWKS, em cache), o `iss`, o `aud = "gemeo"` e a validade. Não consulta banco.                    |
| O que é "efetuar o login" no app? | **Receber o 200.** O app não tem tela de login, sessão nem refresh. Se o usuário não tem sessão no hub, o SDK manda para o login do hub, e o hub devolve o usuário para o gêmeo.                                  |

```
navegador em :5173 (gêmeo)               hub :5180 (dono do cookie)           back do gêmeo
──────────────────────────               ──────────────────────────           ─────────────
1. <SondoAuthProvider>
     POST /api/sso/token ─────────────▶  sessão válida? acesso ao gemeo?
     (o navegador anexa o cookie)        assina o JWT: aud=gemeo, level=2, 10 min
     ◀──── 200 { accessToken, user } ──
     renderiza o app com o user
2. axios GET /sensors
     Authorization: Bearer eyJ… ─────────────────────────────────────────▶  sondoAuth: assinatura (JWKS),
                                                                             iss, aud e exp
                                                                             req.sondoUser = { id, name, email, level }
```

**O que muda no gêmeo:**

|                      | Hoje                                                                      | Com o hub                             |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| Tela de login        | `/login` do gêmeo                                                         | a do hub                              |
| Quem confere a senha | back do gêmeo (bcrypt, tabela `users`)                                    | o hub                                 |
| Token                | HS256 com o segredo do gêmeo, num cookie `accessToken` **legível por JS** | RS256 do hub, **só em memória**       |
| Renovação            | `/auth/refresh` + interceptor de 401 com fila                             | o SDK, sozinho, 1 min antes de vencer |
| Dados do usuário     | `jwtDecode` do cookie → zustand                                           | `useSondoAuth().user`                 |
| O back confere com   | `jwt.verify` + segredo                                                    | `sondoAuth` + chave pública           |

O código de autenticação do gêmeo **diminui**: saem a tela de login, o bcrypt, o refresh, os cookies, o interceptor de 401 e o store de auth.

---

## 🔧 Antes de começar: dois ajustes no seu repositório

### 1. Falta o `POST /api/auth/logout` (aula 04, passo 4)

O seu `auth.controller.ts` só tem o `login`, então hoje `POST /api/auth/logout` responde **404**. O "Sair" do hub e o `logout()` do SDK chamam essa rota: sem ela, o cookie continua valendo e ninguém sai de verdade. As peças (`SessionsService.revoke`, `clearSessionCookie`, `SessionGuard` e `@CurrentAuth`) já existem; falta só o método. Copie o `AuthController` completo da [aula 04, passo 4](04-aula-sessao-e-apps.md) e rode o teste "antes 200 / logout 204 / depois 401" de lá.

### 2. O React do SDK

O `packages/client/package.json` pede `react ^19.3.1` como peer, mas o gêmeo usa **19.2.8** (e o cco, 19.1.1), então o pnpm avisaria de peer não atendido. Como o SDK só usa recursos do React 19.0 (`use`, `<Context value>` e `<style precedence>`), afrouxe o peer:

```json
  "peerDependencies": {
    "react": "^19.0.0"
  }
```

```powershell
pnpm install
pnpm --filter "@sondohub/*" build
```

---

## 🛠️ Passo 1 — Back do gêmeo (`gemeo-digital`)

### 1.1 Instalar e configurar

Na pasta `gemeo-digital`:

```powershell
pnpm add link:../monorepo/sondohub/packages/server
```

No `.env` (e no `.env.dev`, que é o modelo):

```
#SONDOHUB (igual, caractere por caractere, ao HUB_URL do hub: é o "iss" do token)
HUB_URL=http://localhost:5180
```

### 1.2 Proteger as rotas de pessoas (`src/server.ts`)

O back do gêmeo atende **dois tipos de cliente**:

- **pessoas**, pelo front: `/sensors`, `/bimModels` e `/monitor/series`;
- **sensores e integrações**, máquina falando com máquina: `/monitor/online`, `/monitor-connections/:id`, `/dataLog`…

Só as rotas de pessoas passam a exigir o token do hub. Um sensor não faz login no hub, então as rotas de máquina continuam com o `middlewares/auth.ts` de hoje.

```ts
import { sondoAuth } from "@sondohub/server";
// ...os outros imports continuam iguais

dotenv.config();

const app = express();
// ...cors, express.json, urlencoded e cookieParser continuam iguais

// Rotas usadas pelo front: exigem o access token que o hub emitiu para o app "gemeo".
// Criado aqui, depois do dotenv.config(): dentro de um módulo importado, o HUB_URL ainda estaria vazio.
const requireUser = sondoAuth({
  hubUrl: process.env.HUB_URL!,
  audience: "gemeo",
});

//routes
app.use(auth);
app.use("/auth", auth);
app.use(routes);
app.use("/sensors", requireUser, sensors);
app.use("/bimModels", requireUser, bimModels);
app.use("/monitor/series", requireUser); // o resto de /monitor (POST /online) é dos sensores
app.use("/monitor", monitor);
```

**Por que assim:**

- `audience: "gemeo"` **é o** `slug` **cadastrado no hub.** Um token emitido para o demo é recusado aqui (testado: 401).
- **Por que no** `server.ts` **e não num arquivo em** `middlewares/`**?** Num módulo ESM, todos os `import` rodam **antes** do corpo do arquivo. O `dotenv.config()` do `server.ts` só roda depois que todos os imports carregaram, então um módulo que lesse `process.env.HUB_URL` ao ser importado receberia `undefined`, e o `sondoAuth` quebraria no boot. Hoje o `monitor.ts` lê o `CLIENTE_ID` desse jeito e só funciona porque o `routes.ts`, importado antes dele, chama `dotenv.config()` por conta própria.
- `app.use("/monitor/series", requireUser)` vale para `/monitor/series` e para `/monitor/series/:hardware`, porque o `app.use` casa pelo prefixo.
- **CORS:** o front passa a mandar o header `Authorization`, e por isso o navegador faz um preflight `OPTIONS` antes. O pacote `cors` já responde e libera o header pedido, então não há nada a mudar.

### 1.3 Usar o nível (`src/routes/sensors.ts`)

Qualquer nível pode ler (GET). Criar e editar sensor fica só para o **Gestor** (nível 2, como está cadastrado no hub).

```ts
import { Router, Request, Response, RequestHandler } from "express";
// ...

// Os mesmos níveis cadastrados no hub para o app "gemeo".
const Level = { READ: 1, MANAGER: 2 } as const;

/** Só deixa passar quem tem, NESTE app, pelo menos o nível pedido. */
function requireLevel(minLevel: number): RequestHandler {
  return (req, res, next) => {
    if (req.sondoUser!.level < minLevel) {
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

- **O** `!` **em** `req.sondoUser!` **é seguro** porque o router inteiro só é alcançado depois do `requireUser` (passo 1.2). O tipo de `sondoUser` vem do `@sondohub/server`.
- **401 ou 403?** 401 significa "não sei quem você é" (sem token ou token inválido). 403 significa "sei quem você é, mas você não pode fazer isso".

### ✅ Checkpoint do back (antes de mexer no front)

Na pasta do sondohub, com o `cookies.txt` do admin (aula 03), troque `<PORT>` pela porta do `.env` do gêmeo:

```powershell
$r = curl.exe -s -b cookies.txt -X POST http://localhost:3100/api/sso/token -H "Origin: http://localhost:5173" | ConvertFrom-Json
$r.user
curl.exe -i http://localhost:<PORT>/sensors -H "Authorization: Bearer $($r.accessToken)"
curl.exe -i http://localhost:<PORT>/sensors
```

| Teste                                                                | Esperado                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `$r.user`                                                            | Administrador, `level 2` (o nível **do gêmeo**, não o do demo) |
| `/sensors` com o token                                               | 200                                                            |
| `/sensors` sem token                                                 | 401                                                            |
| Token adulterado (troque o último caractere)                         | 401                                                            |
| Token pedido com `Origin: http://localhost:5181` (é o token do demo) | 401, porque o `aud` é outro                                    |
| `POST /monitor/online` sem token                                     | Continua funcionando (é rota dos sensores)                     |

> **Como isso foi testado (21/10/2026):** num Express **fora do monorepo** com a mesma configuração do back do gêmeo (TypeScript 5.8, `NodeNext`, `tsc` e depois `node dist`), `@sondohub/server` via `link:` e as mesmas montagens de rota do passo 1.2, contra o hub rodando com o gêmeo cadastrado. Compilou, e todos os casos da tabela deram o esperado.

## 🛠️ Passo 2 — Front do gêmeo (`app-gemeo-digital-hotel-fairmont`)

### 2.1 Instalar e configurar

```powershell
pnpm add link:../monorepo/sondohub/packages/client link:../monorepo/sondohub/packages/contracts
```

`vite.config.ts+`

```ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom"], // uma cópia só do React: o pacote linkado traz a dele
  },
  // O origin é a identidade do app no hub. Sem strictPort, com a 5173 ocupada o Vite
  // subiria na 5174 sem avisar, e o hub responderia 403 "App não cadastrado".
  server: { port: 5173, strictPort: true },
});
```

`.env.development` (arquivo novo; o Vite só o carrega no `pnpm dev`):

```
VITE_HUB_URL=http://localhost:5180
VITE_API_URL=http://localhost:<PORT do .env do back>
```

`.env.production`: o `VITE_API_URL` já existe, falta acrescentar o `VITE_HUB_URL` (veja a seção **Produção**, mais abaixo).

### 2.2 Uma instância do SDK (`src/lib/sondo.ts`)

```ts
import { createSondoAuth } from "@sondohub/client";

// Uma instância para o app inteiro: o access token fica guardado na memória dela.
export const sondo = createSondoAuth({ hubUrl: import.meta.env.VITE_HUB_URL });
```

### 2.3 O Provider (`src/main.tsx`)

```tsx
import { SondoAuthProvider } from "@sondohub/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Spinner } from "@/components/ui/spinner";
import { sondo } from "@/lib/sondo";
import "./index.css";
import App from "./App.tsx";

const loading = (
  <div className="grid min-h-svh place-items-center">
    <Spinner />
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SondoAuthProvider auth={sondo} loading={loading}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SondoAuthProvider>
  </StrictMode>,
);
```

O Provider só renderiza o `<App />` depois que o usuário chega. Por isso **todas** as rotas ficam protegidas, sem precisar de `ProtectedRoute`.

### 2.4 Rotas (`src/App.tsx`)

```tsx
import { Navigate, Route, Routes } from "react-router";
import SensorsPanel from "./components/layout/SensorsPanel";
import Dashboard from "./routes/dashboard/Dashboard";

function App() {
  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />}>
        <Route index element={<SensorsPanel />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
```

Saem o `AuthBootstrap`, o `ProtectedRoute` e a rota `/login`.

### 2.5 O token nas chamadas (`src/api/axios.ts`)

```ts
import axios from "axios";
import { sondo } from "@/lib/sondo";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Toda chamada ao back do gêmeo leva o access token do hub. O SDK devolve o token
// do cache e só vai ao hub quando falta menos de 1 min para ele vencer.
api.interceptors.request.use(async (config) => {
  config.headers.Authorization = `Bearer ${await sondo.getAccessToken()}`;
  return config;
});

export default api;
```

- **O interceptor de resposta (refresh com fila) sai inteiro.** Renovar antes de vencer e fazer várias chamadas esperarem a mesma ida ao hub (o _single-flight_) agora são trabalho do SDK.
- **O** `withCredentials` **sai.** O back do gêmeo não lê mais cookie, porque a credencial agora vai no header.

### 2.6 Usuário, widget e Sair

`src/routes/dashboard/Dashboard.tsx`: troque o store pelo hook.

```tsx
import { useSondoAuth } from "@sondohub/client";
// ...
const { user } = useSondoAuth(); // no lugar de useAppStore((s) => s.user)
```

`src/components/ui/SideBarProfile.tsx`: o tipo passa a ser o `SondoUser`, e `nome` vira `name`. O `?` também sai, porque dentro do Provider o usuário sempre existe.

```tsx
import type { SondoUser } from "@sondohub/contracts";
import { SidebarMenuButton, SidebarMenuItem } from "../layout/sidebar";

export function SidebarProfile({ user }: { user: SondoUser }) {
  // ...JSX igual, com:
  //   <span>{user.name}</span>
  //   <span>{user.email}</span>
}
```

`src/components/ui/SiteHeader.tsx`: o ▦ vai no começo do cabeçalho, como no Microsoft 365, e o Sair vai no espaço da direita, que hoje está vazio.

```tsx
import { AppLauncher, useSondoAuth } from "@sondohub/client";
import { Button } from "@/components/ui/button";
// ...

export function SiteHeader() {
  const breadcrumb = useBreadcrumb();
  const { logout } = useSondoAuth();

  return (
    <header className="…igual…">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <AppLauncher />
        <SidebarTrigger className="-ml-1" />
        {/* ...Separator e breadcrumb iguais */}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={logout}>
            Sair
          </Button>
        </div>
      </div>
    </header>
  );
}
```

- **Por que o ▦ à esquerda:** o painel do widget abre **para a direita** (`left: 0`, com 320 px de largura). No canto direito, ele sairia da tela.
- **O** `logout` **do SDK** revoga a sessão **do hub** (um Sair desloga de todos os apps) e leva para o login do hub.

### ✅ Checkpoint do front (no navegador)

Com o hub, o back e o front do gêmeo rodando:

| #   | Faça                                           | Esperado                                                                             |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Numa aba anônima, abra http://localhost:5173   | Vai para `localhost:5180/login?returnTo=http%3A%2F%2Flocalhost%3A5173%2F`            |
| 2   | Entre como **admin**                           | Volta para `/dashboard`, com Administrador e o email no rodapé da sidebar            |
| 3   | DevTools → Network → `sensors`                 | Header `Authorization: Bearer eyJ…` e status 200                                     |
| 4   | Network, filtro `sso`                          | **Um** `POST /api/sso/token`, mesmo com sensores, séries e modelos carregando juntos |
| 5   | Clique no ▦                                    | App Demo e Gêmeo Digital                                                             |
| 6   | DevTools → Application                         | Local Storage vazio; não existem mais `accessToken`/`refreshToken` do gêmeo          |
| 7   | Saia e entre como **leitor**                   | "Você não tem acesso a este aplicativo." (o seed só deu acesso ao demo)              |
| 8   | Dê nível 1 ao leitor (SQL abaixo) e recarregue | Entra, vê os sensores; criar sensor → 403                                            |
| 9   | Clique em **Sair** e abra o gêmeo de novo      | Pede login (só funciona com o logout do "Antes de começar")                          |

```powershell
docker compose exec postgres psql -U sondohub -d sondohub -c "INSERT INTO user_app_access (user_id, application_id, level) SELECT u.id, a.id, 1 FROM users u, applications a WHERE u.email = 'leitor@sondotecnica.com.br' AND a.slug = 'gemeo';"
```

> Em dev, o cookie `sondohub_session` aparece também em `localhost:5173` no DevTools: para o navegador, cookie é por **host**, não por porta. Continua `HttpOnly`, então o JavaScript do gêmeo não o lê. Em produção, com hosts diferentes, ele nem aparece.

## 🧹 Passo 3 — Tirar o login antigo (depois dos dois checkpoints)

**Back (**`gemeo-digital`**)**

- `server.ts`**:** remova o `import auth from "./routes/auth.js"`, o `app.use(auth)` e o `app.use("/auth", auth)`.
- **Apague** `routes/auth.ts`, `services/authService.ts`, `services/cookie.ts` e `models/auth.ts`.
- `services/token.ts`**:** fica só o `verifyAccess`, que o `middlewares/auth.ts` (rotas de máquina) ainda usa. Saem os `generate`\* e o `verifyRefresh`; no `.env`, sai o `REFRESH_TOKEN_SECRET`.
- `pnpm remove bcryptjs`.
- **Cookies:** nenhuma rota de pessoa lê cookie agora. O fallback `req.cookies?.accessToken` do `middlewares/auth.ts`, o `cookie-parser` e o `credentials: true` do CORS podem sair juntos. Antes, confirme que nenhum sensor autentica por cookie.

**Front (**`app-gemeo-digital-hotel-fairmont`**)**

- **Apague** `src/auth/`, `src/routes/auth/`, `src/api/services/auth.service.ts`, `src/api/services/cookie.service.ts`, `src/stores/index.ts`, `src/stores/slices/authSlice.ts` e `src/stores/slices/userSlice.ts`. O `sensorSlice` é independente e fica.
- `pnpm remove js-cookie @types/js-cookie jwt-decode`.
- `pnpm build`**:** o `tsc -b` aponta qualquer import que tenha sobrado.

> **A tabela** `gemeo_digital_hotel_fairmonte.users` **fica onde está.** Hoje nenhuma rota usa o `req.userID`. Se um dia o gêmeo guardar algo por usuário, o vínculo é o `sub` do token (o `id` do hub), na migração da Fase 4.

## 🚚 Produção: dois bloqueios antes do deploy

### 1. Domínio: decida antes de tudo

| Quem                       | Endereço                       |
| -------------------------- | ------------------------------ |
| Gêmeo (front)              | `app-gds.sondotecnica.com`     |
| Gêmeo (back)               | `gds-techlab.sondotecnica.com` |
| Hub (planejado na aula 01) | `hub.sondotecnica.com.br`      |

Para o navegador, `sondotecnica.com` e `sondotecnica.com.br` são **sites diferentes**. Por isso o cookie `SameSite=Strict` do hub não iria no `fetch` que sai do gêmeo, e a sequência seria esta:

1. O hub responde 401 e o SDK manda para o login.
2. O login vê a sessão (ali o cookie vai, porque é navegação no próprio hub) e devolve o usuário para o gêmeo.
3. O `fetch` sai sem cookie de novo, e volta o 401. **Loop infinito.**

**Saída:** hub e apps no mesmo domínio registrável. Ou o hub vai para `hub.sondotecnica.com`, ou os apps vão para `*.sondotecnica.com.br`.

`SameSite=None` não resolve: Safari e Firefox bloqueiam cookie de terceiros, e ele reabre o CSRF que o `Strict` fecha.

### 2. Distribuição dos pacotes

O `link:` aponta para uma pasta **da sua máquina**. O deploy do back (`.github/workflows/deploy.yml`) roda `pnpm install --frozen-lockfile` num runner do GitHub, onde `../monorepo/sondohub` não existe, e a instalação falha. Antes do deploy, os pacotes precisam estar publicados, que é o próximo passo (seção **Próximo: o SDK como pacote**).

### 3. Variáveis

- **Hub:** o `gemeo` cadastrado com `origin = https://app-gds.sondotecnica.com` e `url = https://app-gds.sondotecnica.com/dashboard`.
- **Back do gêmeo:** `HUB_URL` igual ao `HUB_URL` do hub, caractere por caractere.
- **Front:** `VITE_HUB_URL` no `.env.production`.

---

## 📋 Receita para os outros apps

Os apps atuais têm o mesmo formato do gêmeo: front em React + Vite + axios e back em Express + `jsonwebtoken`. A receita, portanto, é a mesma:

| Onde    | O quê                                                                                                                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hub     | Cadastrar o app (slug, origin exato, url e níveis) e dar acesso aos usuários. Reiniciar a API, porque o CORS só é lido no boot até a aula 08                                                                         |
| Back    | `link:` do `@sondohub/server`; `HUB_URL`; `sondoAuth({ audience: "<slug>" })` **só nas rotas de pessoas**, criado depois do `dotenv.config()`; `requireLevel` onde o nível importa                                   |
| Front   | `link:` do client e do contracts; `dedupe` e porta fixa com `strictPort`; `VITE_HUB_URL`; `sondo.ts`; `<SondoAuthProvider>`; interceptor com o `Bearer`; `<AppLauncher />` e Sair; usuário vindo do `useSondoAuth()` |
| Limpeza | Login, refresh, cookies e store de auth do próprio app                                                                                                                                                               |

**Três perguntas para responder antes de começar cada app:**

1. **Quais rotas são de pessoas e quais são de máquina?** Só as de pessoas passam para o hub.
2. **Quais níveis o app precisa?** Eles viram o `levels` do cadastro e o `const Level` do back.
3. **O app guarda dados por usuário** (`created_by`, preferências)? Se guarda, o vínculo com o usuário do hub é o `sub`, na Fase 4.

> **Uma porta fixa por app em dev.** O Vite usa a 5173 por padrão em **todos** os projetos. Com dois apps rodando, o `strictPort` faz o segundo falhar com erro, em vez de trocar de origin em silêncio. Dê a cada app a próxima porta livre (5182, 5183…) e cadastre esse origin.

---

## ➡️ Próximo: o SDK como pacote

Colocar o widget num app **já é uma linha**: um `<AppLauncher />` em qualquer lugar dentro do `<SondoAuthProvider>`. O CSS vai junto com o componente e a lista de apps vem da API, então um app novo aparece em todos os widgets sem deploy.

O que falta é a **entrega**: trocar o `link:` por uma versão que qualquer máquina e o CI conseguem instalar.

| Opção                                      | Como                                                                                 | Contra                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Registry npm privado** (GitHub Packages) | `pnpm publish` dos 3 pacotes; os apps instalam com um `.npmrc` e um token de leitura | No GitHub Packages, o **escopo precisa ser o dono** do pacote (org ou usuário). `@sondohub/`_ vira `@techlab-sp/_`, ou alguém cria uma org `sondohub` |
| Tarball numa Release (`pnpm pack`)         | `pnpm add https://…/sondohub-client-0.1.0.tgz`                                       | Atualizar exige trocar a URL em cada app, e não existe `pnpm update`                                                                                  |
| Dependência git                            | `pnpm add github:…#path:packages/client`                                             | O `dist` não está no git, e o `workspace:*` do contracts não resolve fora do monorepo                                                                 |

**Recomendação: registry privado.** Ele dá versão semântica, `pnpm update` para pegar correções, e o CI só precisa de um token de leitura. Esse é o assunto da próxima aula: publicar, versionar e trocar o `link:` do gêmeo pela versão publicada.

> **Ajustes de widget que só entram quando um app pedir:** abrir o painel para a esquerda (hoje ele abre para a direita, e por isso o ▦ fica no começo do cabeçalho), e levar o `requireLevel` para dentro do `@sondohub/server` quando o terceiro app repetir o do gêmeo.

## ⏳ O que ficou para depois

| Hoje                                                                                                                                                                                                                                                 | Resolve em                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Pacotes via `link:`                                                                                                                                                                                                                                  | Próxima aula (SDK publicado)                                                                     |
| Hub em `.com.br` e gêmeo em `.com`                                                                                                                                                                                                                   | Decisão sua, antes do deploy                                                                     |
| Rotas de máquina do gêmeo com `jsonwebtoken` próprio                                                                                                                                                                                                 | Fora do hub: é autenticação de dispositivo, não de pessoa                                        |
| `requireLevel` local no gêmeo                                                                                                                                                                                                                        | Vai para o `@sondohub/server` no 3º app                                                          |
| ⚠️ Em dev, o Vite do hub responde sozinho o preflight `OPTIONS` de qualquer origin `localhost`, sem passar pelo Nest. Isso **não afeta o SDK**, que só faz requisições simples, sem preflight, mas faz o teste 8 da aula 08 "falhar" pela porta 5180 | Aula 08: `cors: false` no `server` do `apps/hub/vite.config.ts`, para o preflight chegar ao Nest |

➡️ Próximo: [08 — Fechando as portas](08-aula-seguranca.md)
