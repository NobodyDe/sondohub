# Aula 07 — Um app consumindo o login do hub

> 🎯 **Objetivo:** um app (primeiro o **demo**, depois um **app real**) passa a usar o login do hub:
> - abre o app sem sessão → vai para o login do hub → volta logado;
> - o botão ▦ lista os apps;
> - o backend do app confere o token e o **nível**.
>
> **Pré-requisito:** [aula 06](06-aula-token-para-apps.md).

---

## 🔧 Antes de começar: ajuste no `packages/client/tsconfig.json`

No seu repositório, o `jsx` e o `lib` ficaram **fora** do `compilerOptions`. Hoje compila porque o pacote está vazio, mas quebra no primeiro componente. O arquivo certo:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM"]
  },
  "include": ["src"]
}
```

---

## 🧠 Conceito: o que cada app ganha

```
┌──────────────────── App (gemeo, demo…) ────────────────────┐
│ FRONT  @sondohub/client                                     │
│   createSondoAuth()    busca o token no hub e guarda em memória │
│   <SondoAuthProvider>  sem sessão → login do hub; sem acesso → aviso │
│   <AppLauncher />      o botão ▦                            │
│   Bearer <token>       nas chamadas ao backend do próprio app │
│                                                             │
│ BACK   @sondohub/server                                     │
│   sondoAuth({ audience: 'demo' })   confere o JWT com a chave pública │
│   req.sondoUser.level >= Level.ADMIN   cada app decide o que o nível pode │
└─────────────────────────────────────────────────────────────┘
```

Para o app, integrar é **instalar 2 pacotes e tocar 4 pontos**. Cookie, renovação, redirects e JWKS ficam escondidos dentro dos pacotes (é o padrão *Facade*).

**Fluxo:**

```
1. app abre → Provider → POST hub/api/sso/token (cookie do hub vai junto)
     200 → token em memória + dados do usuário → renderiza o app
     401 → manda para hub/login?returnTo=<url do app> → login → volta
     403 → "Você não tem acesso a este aplicativo"
2. o app chama o próprio backend com Authorization: Bearer <token>
3. o backend confere a assinatura com a chave pública (em cache) e lê o nível
```

---

## 🛠️ Passo 1 — `@sondohub/server` (`packages/server/src/index.ts`)

Vai no backend de cada app (Express).

```ts
import type { SondoUser } from "@sondohub/contracts";
import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type SondoAuthOptions = { hubUrl: string; audience: string };

type SondoClaims = JWTPayload & Omit<SondoUser, "id">;

declare global {
  namespace Express {
    interface Request {
      /** Preenchido pelo middleware sondoAuth depois de validar o token. */
      sondoUser?: SondoUser;
    }
  }
}

export function createTokenVerifier({ hubUrl, audience }: SondoAuthOptions) {
  // Baixa a chave pública uma vez e guarda em cache; só busca de novo se aparecer um kid novo.
  const jwks = createRemoteJWKSet(new URL("/api/.well-known/jwks.json", hubUrl));

  return async function verifyAccessToken(token: string): Promise<SondoUser> {
    const { payload } = await jwtVerify<SondoClaims>(token, jwks, {
      issuer: hubUrl, // foi o hub que emitiu?
      audience, // foi emitido para ESTE app?
      algorithms: ["RS256"], // nunca aceite o algoritmo que o próprio token declara
      requiredClaims: ["sub"],
    });
    return {
      id: payload.sub!,
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      level: payload.level,
    };
  };
}

export function sondoAuth(options: SondoAuthOptions): RequestHandler {
  const verifyAccessToken = createTokenVerifier(options);

  return async (req, res, next) => {
    const [scheme, token] = req.get("authorization")?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) {
      res.sendStatus(401);
      return;
    }
    try {
      req.sondoUser = await verifyAccessToken(token);
      next();
    } catch {
      res.sendStatus(401); // assinatura inválida, expirado, aud errado...
    }
  };
}
```

- **`createTokenVerifier`** é a regra pura, sem framework.
- **`sondoAuth`** é o adaptador fino para o Express. Se um app tiver backend Nest, ele escreve um guard de 10 linhas que chama o mesmo `verifyAccessToken`.

## 🛠️ Passo 2 — O SDK (`packages/client/src/create-sondo-auth.ts`)

```ts
import type { LauncherApp, TokenResponse } from "@sondohub/contracts";

const RENEW_MARGIN_MS = 60_000; // renova 1 min antes de expirar

/** O hub respondeu 403: o usuário está logado, mas não tem acesso a este app. */
export class NoAccessError extends Error {}

export type SondoAuth = ReturnType<typeof createSondoAuth>;

export function createSondoAuth({ hubUrl }: { hubUrl: string }) {
  let session: TokenResponse | null = null;
  let expiresAt = 0;
  let pending: Promise<TokenResponse> | null = null;

  async function requestSession(): Promise<TokenResponse> {
    const response = await fetch(`${hubUrl}/api/sso/token`, { method: "POST", credentials: "include" });
    if (response.status === 401) {
      location.assign(`${hubUrl}/login?returnTo=${encodeURIComponent(location.href)}`);
      return new Promise(() => {}); // a página está saindo: nada mais deve rodar
    }
    if (response.status === 403) throw new NoAccessError("Sem acesso a este app");
    if (!response.ok) throw new Error(`Hub respondeu ${response.status}`);

    session = (await response.json()) as TokenResponse;
    expiresAt = Date.now() + session.expiresIn * 1000;
    return session;
  }

  /** Sessão em cache; só vai ao hub perto de expirar. Chamadas simultâneas dividem a mesma ida. */
  function getSession(): Promise<TokenResponse> {
    if (session && Date.now() < expiresAt - RENEW_MARGIN_MS) return Promise.resolve(session);
    pending ??= requestSession().finally(() => {
      pending = null;
    });
    return pending;
  }

  return {
    hubUrl,
    getSession,

    async getAccessToken(): Promise<string> {
      return (await getSession()).accessToken;
    },

    async getApps(): Promise<LauncherApp[]> {
      const response = await fetch(`${hubUrl}/api/me/apps`, { credentials: "include" });
      if (!response.ok) throw new Error(`Hub respondeu ${response.status}`);
      return (await response.json()) as LauncherApp[];
    },

    async logout(): Promise<void> {
      await fetch(`${hubUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
      location.assign(`${hubUrl}/login`);
    },
  };
}
```

**Três ideias, em poucas linhas:**

1. **Token só em memória** (as variáveis da *closure*), nunca no `localStorage`, que qualquer XSS lê. Ao recarregar a página, o cookie do hub entrega outro em silêncio.
2. **Renovação preguiçosa:** não há timer. Quem pede o token recebe o cache, e o SDK só vai ao hub quando faltar menos de 1 min para expirar.
3. **Single-flight (`pending ??=`):** se três chamadas pedem o token ao mesmo tempo, as três esperam **a mesma** requisição. Isso também evita a ida dupla do StrictMode.

> **`credentials: "include"`** envia o cookie do hub numa chamada para **outro origin**. Funciona porque o hub autorizou esse origin no CORS (aula 06) e os dois são o mesmo *site* (`sondotecnica.com.br`), então o `SameSite=Strict` deixa passar.

## 🛠️ Passo 3 — React (`packages/client/src/react.tsx`)

```tsx
import type { SondoUser } from "@sondohub/contracts";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { NoAccessError, type SondoAuth } from "./create-sondo-auth.js";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; user: SondoUser }
  | { kind: "no-access" }
  | { kind: "error" };

type SondoContextValue = { auth: SondoAuth; user: SondoUser };

const SondoAuthContext = createContext<SondoContextValue | null>(null);

type SondoAuthProviderProps = {
  auth: SondoAuth;
  children: ReactNode;
  /** O que mostrar enquanto a sessão não chega do hub. */
  loading?: ReactNode;
};

export function SondoAuthProvider({ auth, children, loading = null }: SondoAuthProviderProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    // Sem sessão no hub, o SDK já redireciona para o login: aqui só tratamos 403 e falhas.
    auth.getSession().then(
      ({ user }) => setStatus({ kind: "ready", user }),
      (error) => setStatus({ kind: error instanceof NoAccessError ? "no-access" : "error" }),
    );
  }, [auth]);

  if (status.kind === "loading") return loading;
  if (status.kind === "no-access") return <Notice hubUrl={auth.hubUrl} text="Você não tem acesso a este aplicativo." />;
  if (status.kind === "error") return <Notice hubUrl={auth.hubUrl} text="Não foi possível falar com o SondoHub." />;
  return <SondoAuthContext value={{ auth, user: status.user }}>{children}</SondoAuthContext>;
}

/** O cliente e o usuário do Provider mais próximo (o widget usa por dentro). */
export function useSondoContext(): SondoContextValue {
  const value = use(SondoAuthContext);
  if (!value) throw new Error("Use dentro de <SondoAuthProvider>");
  return value;
}

export function useSondoAuth() {
  const { auth, user } = useSondoContext();
  return { user, getAccessToken: auth.getAccessToken, logout: auth.logout };
}

function Notice({ hubUrl, text }: { hubUrl: string; text: string }) {
  return (
    <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <p>{text}</p>
      <a href={hubUrl}>Ir para a central</a>
    </div>
  );
}
```

- **Quatro estados explícitos** num `Status` (união discriminada). Com `kind: "ready"`, o TypeScript **garante** que existe `user`.
- **Os filhos só renderizam com usuário pronto.** Por isso, dentro do app, `useSondoAuth().user` nunca é `null`.
- **React 19:** `<SondoAuthContext value>` já é o provider, e `use(Context)` substitui o `useContext`.

## 🛠️ Passo 4 — O widget ▦

**`packages/client/src/app-launcher.styles.ts`**

```ts
// Classes com prefixo "sondo-launcher" para não colidir com o CSS de nenhum app.
export const launcherCss = `
.sondo-launcher { position: relative; display: inline-block; font-family: system-ui, sans-serif; }
.sondo-launcher__button { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 8px; background: transparent; color: #334155; cursor: pointer; }
.sondo-launcher__button:hover, .sondo-launcher__button[aria-expanded="true"] { background: #e2e8f0; }
.sondo-launcher__button svg { fill: currentColor; }
.sondo-launcher__panel { position: absolute; top: 48px; left: 0; z-index: 1000; width: 320px; padding: 16px; border-radius: 12px; background: #fff; box-shadow: 0 10px 30px rgb(15 23 42 / 0.2); }
.sondo-launcher__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0; padding: 0; list-style: none; }
.sondo-launcher__app { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; border-radius: 8px; color: #0f172a; font-size: 12px; text-align: center; text-decoration: none; }
.sondo-launcher__app:hover { background: #f1f5f9; }
.sondo-launcher__hint { margin: 0; color: #64748b; font-size: 13px; }
.sondo-launcher__hub { display: block; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #2563eb; font-size: 13px; text-align: center; text-decoration: none; }
`;
```

**`packages/client/src/app-launcher.tsx`**

```tsx
import type { LauncherApp } from "@sondohub/contracts";
import { useEffect, useRef, useState } from "react";
import { launcherCss } from "./app-launcher.styles.js";
import { useSondoContext } from "./react.js";

export function AppLauncher() {
  const { auth } = useSondoContext();
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<LauncherApp[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc, mas só escuta o documento enquanto está aberto.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    setOpen((isOpen) => !isOpen);
    if (!apps) auth.getApps().then(setApps, () => setApps([])); // busca só na 1ª abertura
  }

  return (
    <div ref={rootRef} className="sondo-launcher">
      {/* O React 19 sobe este <style> para o <head> e não duplica, mesmo com vários launchers. */}
      <style href="sondo-launcher" precedence="default">
        {launcherCss}
      </style>
      <button
        type="button"
        className="sondo-launcher__button"
        aria-label="Aplicativos"
        aria-expanded={open}
        onClick={toggle}
      >
        <GridIcon />
      </button>
      {open && (
        <div className="sondo-launcher__panel">
          {apps === null ? (
            <p className="sondo-launcher__hint">Carregando…</p>
          ) : (
            <ul className="sondo-launcher__grid">
              {apps.map((app) => (
                <li key={app.slug}>
                  <a className="sondo-launcher__app" href={app.url}>
                    <img src={app.iconUrl} alt="" width={40} height={40} />
                    <span>{app.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <a className="sondo-launcher__hub" href={auth.hubUrl}>
            Ir para a central
          </a>
        </div>
      )}
    </div>
  );
}

function GridIcon() {
  const positions = [2, 8, 14];
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      {positions.flatMap((y) =>
        positions.map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" />),
      )}
    </svg>
  );
}
```

- **A lista vem da API** (`/api/me/apps`, a mesma do launcher do hub). Um app novo aparece em todos os widgets **sem atualizar o pacote**.
- **O CSS vai dentro do componente:** o app não importa nenhum `.css`, e as classes prefixadas não colidem com o CSS dele.

## 🛠️ Passo 5 — API pública do pacote e build

**`packages/client/src/index.ts`**: é tudo o que os apps enxergam.

```ts
export { createSondoAuth, NoAccessError, type SondoAuth } from "./create-sondo-auth.js";
export { SondoAuthProvider, useSondoAuth } from "./react.js";
export { AppLauncher } from "./app-launcher.js";
```

```powershell
pnpm --filter "@sondohub/*" build
```

## 🛠️ Passo 6 — Integrar no demo

**Antes, limpe o template:** apague `apps/demo/src/index.css`, `src/App.css` e `src/assets/`. O CSS do template desalinharia o cabeçalho.

**Front, ponto 1: `apps/demo/src/lib/sondo.ts`**

```ts
import { createSondoAuth } from "@sondohub/client";

// Uma instância por app: o access token fica guardado na memória dela.
export const sondo = createSondoAuth({ hubUrl: import.meta.env.VITE_HUB_URL });
```

**Front, ponto 2: `apps/demo/src/main.tsx`**

```tsx
import { SondoAuthProvider } from "@sondohub/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { sondo } from "./lib/sondo.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SondoAuthProvider auth={sondo} loading={<p>Carregando…</p>}>
      <App />
    </SondoAuthProvider>
  </StrictMode>,
);
```

**Front, pontos 3 e 4: `apps/demo/src/App.tsx`** (o widget e o Bearer nas chamadas)

```tsx
import { AppLauncher, useSondoAuth } from "@sondohub/client";
import { useState } from "react";
import { sondo } from "./lib/sondo.ts";

export default function App() {
  const { user, logout } = useSondoAuth();
  const [result, setResult] = useState("");

  async function callApi(path: string) {
    const token = await sondo.getAccessToken();
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    setResult(`${response.status} ${await response.text()}`);
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <AppLauncher />
        <strong>App Demo</strong>
        <span style={{ marginLeft: "auto" }}>
          {user.name} · nível {user.level}
        </span>
        <button onClick={logout}>Sair</button>
      </header>

      <p>
        <button onClick={() => callApi("/api/hello")}>GET /api/hello</button>{" "}
        <button onClick={() => callApi("/api/admin-only")}>GET /api/admin-only (nível 3)</button>
      </p>
      <pre>{result}</pre>
    </main>
  );
}
```

**Back: `apps/demo/server.ts`** (uma linha protege todas as rotas `/api`)

```ts
import { sondoAuth } from "@sondohub/server";
import express from "express";

// Cada app dá nome aos seus níveis: nada de número mágico espalhado pelo código.
const Level = { READ: 1, EDIT: 2, ADMIN: 3 } as const;

const app = express();

// Toda rota em /api exige um access token válido, emitido pelo hub para o "aud" demo.
app.use("/api", sondoAuth({ hubUrl: process.env.HUB_URL!, audience: "demo" }));

app.get("/api/hello", (req, res) => {
  res.json({ message: `Olá, ${req.sondoUser!.name}!`, level: req.sondoUser!.level });
});

app.get("/api/admin-only", (req, res) => {
  if (req.sondoUser!.level < Level.ADMIN) {
    res.sendStatus(403);
    return;
  }
  res.json({ secret: "só quem tem nível 3 vê isto" });
});

app.listen(Number(process.env.DEMO_API_PORT));
```

> **`audience: "demo"` é o `slug` do app no banco.** O nível chega **dentro do token**, então o backend do app nem precisa perguntar ao hub o que o usuário pode fazer.

## 🛠️ Passo 7 — Hub: voltar para o app de onde veio (`returnTo`)

Agora o login recebe `?returnTo=<url do app>`. Aceitar **qualquer** URL ali criaria um *open redirect*: um link `hub.sondotecnica.com.br/login?returnTo=https://site-falso.com` usaria o seu domínio verdadeiro como isca de phishing. Por isso a volta só é permitida para **apps liberados ao usuário**.

**`apps/hub/src/features/auth/safe-return-to.ts`**

```ts
import type { LauncherApp } from "@sondohub/contracts";

/**
 * Só deixa voltar para endereços de apps liberados ao usuário.
 * Sem isso, hub/login?returnTo=https://site-falso.com viraria isca de phishing (open redirect).
 */
export function safeReturnTo(returnTo: string | null, apps: LauncherApp[]): string | null {
  if (!returnTo) return null;
  try {
    const { origin } = new URL(returnTo);
    return apps.some((app) => new URL(app.url).origin === origin) ? returnTo : null;
  } catch {
    return null; // não é uma URL absoluta válida
  }
}
```

**`login-page.tsx`:** troque o `useNavigate` pelo `returnTo` e acrescente o "já tem sessão?".

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { ApiError, hubApi } from "../../lib/api.ts";
import { safeReturnTo } from "./safe-return-to.ts";

/** Vai para o app de onde o usuário veio (se for um app dele) ou para o launcher. */
async function continueTo(returnTo: string | null) {
  const target = safeReturnTo(returnTo, await hubApi.myApps());
  location.assign(target ?? "/");
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Já tem sessão? Não pede a senha de novo: segue direto para onde ia.
  useEffect(() => {
    hubApi.me().then(
      () => continueTo(returnTo),
      () => {},
    );
  }, [returnTo]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setSubmitting(true);
    setError("");
    try {
      await hubApi.login({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      await continueTo(returnTo);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Email ou senha inválidos."
          : "Não foi possível entrar. Tente de novo.",
      );
      setSubmitting(false);
    }
  }

  // ... o return (JSX do formulário) continua igual ao da aula 05
}
```

> **Por que comparar o `origin` e não "começa com"?** Com `startsWith`, um endereço como `http://localhost:5181.site-falso.com` passaria. O `new URL(...).origin` compara protocolo, host e porta exatos.

---

## ✅ Checkpoint (no navegador)

Com `pnpm dev` rodando (API, hub, demo e a API do demo), testado assim:

| # | Faça | Esperado |
|---|---|---|
| 1 | Sem sessão, abra http://localhost:5181 | Vai para `localhost:5180/login?returnTo=http%3A%2F%2Flocalhost%3A5181%2F` |
| 2 | Entre como **admin** | Volta para o demo com "Administrador · nível 3" |
| 3 | Clique em ▦ | Painel com **App Demo** e "Ir para a central" |
| 4 | `GET /api/hello` e depois `GET /api/admin-only` | `200 {"message":"Olá, Administrador!"…}` e `200 {"secret":…}` |
| 5 | DevTools → Local Storage e `document.cookie` | Os dois vazios: o token está só na memória |
| 6 | **Sair** no demo, depois abra o demo de novo | Pede login: **um logout derruba a sessão de tudo** |
| 7 | Entre como **leitor** | "Leitor · nível 1"; `admin-only` → `403 Forbidden` |
| 8 | Apague o acesso do leitor no Studio e recarregue o demo | "Você não tem acesso a este aplicativo" |
| 9 | Logado, abra `localhost:5180/login?returnTo=https://site-falso.example` | Cai no launcher, não no site falso |

---

## 🚚 Plugando um app real

Testei com um app Vite **fora do monorepo**, que é o caso dos apps que já existem.

**1. Cadastre o app no hub.** Pelo Prisma Studio ou por SQL. O `origin` é protocolo + host + porta, **exatos**:

```sql
INSERT INTO applications (id, slug, name, icon_url, url, origin, levels)
VALUES (gen_random_uuid(), 'gemeo', 'Gêmeo Digital', 'http://localhost:5182/favicon.svg',
        'http://localhost:5182', 'http://localhost:5182',
        '[{"level":1,"label":"Leitura"},{"level":2,"label":"Gestor"}]');

INSERT INTO user_app_access (user_id, application_id, level)
SELECT u.id, a.id, 2 FROM users u, applications a
WHERE u.email = 'admin@sondotecnica.com.br' AND a.slug = 'gemeo';
```

Depois **reinicie a API**: nesta fase, a lista do CORS é lida no boot.

**2. Instale os pacotes no app**, apontando para o monorepo. O `link:` cria um atalho para a pasta, e o `dist` precisa estar compilado (`pnpm --filter "@sondohub/*" build`):

```powershell
pnpm add link:../sondohub/packages/client link:../sondohub/packages/contracts
```

No backend do app (se for Node/Express): `pnpm add link:../sondohub/packages/server`.

**3. No `vite.config.ts` do app, force um React só:**

```ts
resolve: { dedupe: ["react", "react-dom"] },
```

> **Testado:** sem o `dedupe`, o bundle de produção do app real saiu com **1,6 KB de React duplicado**. O pacote linkado tem o próprio `react` (devDependency) dentro do monorepo. Funcionou, mas duas cópias do React são a porta de entrada do erro "Invalid hook call". Com o `dedupe`, sobra uma cópia só.

**4. Os mesmos 4 pontos do demo:**
- `.env` do app com `VITE_HUB_URL=http://localhost:5180`;
- `createSondoAuth` e `<SondoAuthProvider>` no `main.tsx`;
- `<AppLauncher />` no cabeçalho;
- `Bearer` nas chamadas.

No back, `sondoAuth({ hubUrl, audience: "gemeo" })`.

**5. Tire a tela de login antiga do app:** o Provider já manda para o login do hub.

Resultado testado: o app real abriu com "Administrador · nível 2", e o widget dele listou **App Demo e o app real**, cada um com o nível daquele usuário.

> **Os dados do próprio app** (a tabela de usuários antiga dele) entram na migração da Fase 4: vincular pelo `hub_user_id` (o `sub` do token) e, na primeira vez, pelo email.

## ⏳ O que ficou para depois

| Hoje | Resolve em |
|---|---|
| App novo exige reiniciar a API (CORS lido no boot) | aula 08 (CORS dinâmico) |
| O CORS vale para todas as rotas | aula 08 (só `/sso/token`, `/me/apps` e `/auth/logout`) |
| Tirar o acesso ou desativar o usuário leva até 10 min para valer **dentro do app** (o token que ele já tem continua válido até vencer) | Troca consciente: é o preço de o app não consultar o hub a cada requisição |

➡️ Próximo: [08 — Fechando as portas](08-aula-seguranca.md)
