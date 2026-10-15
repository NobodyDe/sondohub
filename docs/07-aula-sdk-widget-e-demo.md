# Aula 07 — SDK, widget e app demo (o widget em cada app)

> **Objetivo:** construir os dois pacotes que todo app da Sondotecnica vai instalar e integrá-los no app demo:
> - **`@sondohub/client`**: SDK de token + botão ▦;
> - **`@sondohub/server`**: valida o token no backend do app.
>
> No fim, você vê o SSO completo no navegador.
>
> **Pré-requisito:** [aula 06](06-aula-hub-front.md) concluída.

---

## 🧠 Conceito

### O que cada app ganha

```
┌──────────────── App (gemeo.sondotecnica.com.br) ────────────────┐
│  FRONT                                                          │
│   createSondoAuth()  ← SDK: busca e renova o token (Facade)     │
│   <SondoAuthProvider> ← barra quem não está logado / sem acesso │
│   <AppLauncher />    ← o botão ▦                                │
│   fetch(..., Bearer) ← chamadas para o backend do próprio app   │
│                                                                 │
│  BACK                                                           │
│   sondoAuth({ audience: 'gemeo' })  ← valida o JWT via JWKS     │
│   req.sondoUser.level >= Level.EDIT ← cada app decide o nível   │
└─────────────────────────────────────────────────────────────────┘
```

Para o app, integrar o SSO é **instalar 2 pacotes e tocar 4 pontos**. Toda a complexidade (cookie, renovação, JWKS, redirects) fica escondida nos pacotes. Esse é o padrão **Facade**.

### As decisões do SDK

| Decisão | Por quê |
|---|---|
| Token **só em memória** | O `localStorage` é legível por qualquer XSS. Na memória, o token some ao fechar a aba, e o cookie do hub entrega outro em silêncio. |
| **Renovação preguiçosa** | `getAccessToken()` devolve o cache e só vai ao hub quando faltam menos de 60 s. Não há `setInterval`, nem timer para limpar, nem renovação em aba esquecida. |
| **Single-flight** | Cinco chamadas ao mesmo tempo com o token vencido fazem **uma** ida ao hub, porque todas recebem a mesma `Promise`. Também resolve o efeito duplo do StrictMode. |
| **Observer** (`subscribe`/`getSnapshot`) | O SDK não depende do React. O hook usa `useSyncExternalStore`, que é a API oficial do React para "estado de fora". |
| Hub devolve `user` | O front **nunca decodifica o JWT**. |
| CSS no próprio componente | Graças ao `<style href precedence>` do React 19, o app não importa nenhum `.css` e o estilo não colide (classes `sondo-launcher__*`). |

---

## 🛠️ Passo 1 — `@sondohub/server` (`packages/server/src/index.ts`)

É o que vai no backend de cada app.

```ts
import type { SondoUser } from '@sondohub/contracts';
import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type SondoAuthOptions = { hubUrl: string; audience: string };

type SondoClaims = JWTPayload & Omit<SondoUser, 'id'>;

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
  const jwks = createRemoteJWKSet(new URL('/api/.well-known/jwks.json', hubUrl));

  return async function verifyAccessToken(token: string): Promise<SondoUser> {
    const { payload } = await jwtVerify<SondoClaims>(token, jwks, {
      issuer: hubUrl, // foi o hub que emitiu?
      audience, // foi emitido para ESTE app?
      algorithms: ['RS256'], // nunca aceite o algoritmo que o próprio token declara
      requiredClaims: ['sub'],
    });
    return { id: payload.sub!, name: payload.name, email: payload.email, picture: payload.picture, level: payload.level };
  };
}

export function sondoAuth(options: SondoAuthOptions): RequestHandler {
  const verifyAccessToken = createTokenVerifier(options);

  return async (req, res, next) => {
    const [scheme, token] = req.get('authorization')?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
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

**Estrutura:**

- **`createTokenVerifier`:** a regra pura de "o token é válido?", sem depender de framework.
- **`sondoAuth`:** um adaptador fino para o Express. Num backend Nest, você escreve um guard de 10 linhas que chama o mesmo `verifyAccessToken`. Só crie esse adaptador no pacote quando o 2º app Nest precisar dele (regra de três).
- **As três checagens** (`issuer`, `audience`, `algorithms`) são obrigatórias. Sem a `audience`, um token emitido para o app A abriria o app B. Sem fixar `algorithms`, alguém poderia forjar um token declarando outro algoritmo.

## 🛠️ Passo 2 — O núcleo do SDK (`packages/client/src/create-sondo-auth.ts`)

```ts
import type { LauncherApp, SondoUser, TokenResponse } from '@sondohub/contracts';

export type AuthSnapshot =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: SondoUser }
  | { status: 'no-access'; user: null };

export type SondoAuth = ReturnType<typeof createSondoAuth>;

const RENEW_MARGIN_MS = 60_000; // renova 1 min antes de expirar

export function createSondoAuth({ hubUrl }: { hubUrl: string }) {
  const ssoUrl = `${hubUrl}/api/sso`;
  const listeners = new Set<() => void>();
  let snapshot: AuthSnapshot = { status: 'loading', user: null };
  let accessToken = '';
  let expiresAt = 0;
  let pending: Promise<string> | null = null;

  function setSnapshot(next: AuthSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function redirectToLogin(): Promise<never> {
    location.assign(`${hubUrl}/login?returnTo=${encodeURIComponent(location.href)}`);
    return new Promise(() => {}); // a página está saindo: nada mais deve rodar
  }

  async function requestToken(): Promise<string> {
    const response = await fetch(`${ssoUrl}/token`, { method: 'POST', credentials: 'include' });
    if (response.status === 401) return redirectToLogin();
    if (response.status === 403) {
      setSnapshot({ status: 'no-access', user: null });
      throw new Error('Usuário sem acesso a este app');
    }
    if (!response.ok) throw new Error(`Hub respondeu ${response.status}`);

    const body = (await response.json()) as TokenResponse;
    accessToken = body.accessToken;
    expiresAt = Date.now() + body.expiresIn * 1000;
    setSnapshot({ status: 'authenticated', user: body.user });
    return accessToken;
  }

  return {
    hubUrl,

    /** Token em cache; só vai ao hub perto de expirar. Chamadas simultâneas dividem a mesma ida. */
    getAccessToken(): Promise<string> {
      if (accessToken && Date.now() < expiresAt - RENEW_MARGIN_MS) return Promise.resolve(accessToken);
      pending ??= requestToken().finally(() => {
        pending = null;
      });
      return pending;
    },

    async getApps(): Promise<LauncherApp[]> {
      const response = await fetch(`${ssoUrl}/apps`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Hub respondeu ${response.status}`);
      return (await response.json()) as LauncherApp[];
    },

    async logout(): Promise<void> {
      await fetch(`${ssoUrl}/logout`, { method: 'POST', credentials: 'include' });
      location.assign(`${hubUrl}/login`);
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot: (): AuthSnapshot => snapshot,
  };
}
```

**Leia devagar estas três linhas:**

1. **`credentials: 'include'`:** manda o cookie do hub numa chamada para **outro origin**. Funciona porque o hub responde `Access-Control-Allow-Credentials: true` para origins cadastrados (aula 05), e porque os dois são o mesmo *site* (`sondotecnica.com.br`), então o `SameSite=Strict` deixa passar.
2. **`pending ??= …`:** se já existe uma ida ao hub em andamento, todo mundo espera **a mesma**. O `finally` libera para a próxima renovação.
3. **`AuthSnapshot` como união discriminada:** com `status: 'authenticated'`, o TypeScript **garante** que `user` existe. Não há `user?.name` espalhado pelo código.

> **Por que closure e não `class`?** Os métodos são passados soltos (`auth.subscribe` para o `useSyncExternalStore`). Numa classe, isso perderia o `this`. Com closure, não há `this` para perder.

## 🛠️ Passo 3 — Bindings React (`packages/client/src/react.tsx`)

```tsx
import { createContext, use, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { SondoAuth } from './create-sondo-auth.js';

const SondoAuthContext = createContext<SondoAuth | null>(null);

type SondoAuthProviderProps = {
  auth: SondoAuth;
  children: ReactNode;
  /** O que mostrar enquanto o primeiro token não chega. */
  loading?: ReactNode;
};

export function SondoAuthProvider({ auth, children, loading = null }: SondoAuthProviderProps) {
  const { status } = useSyncExternalStore(auth.subscribe, auth.getSnapshot);

  useEffect(() => {
    // 401 já redireciona para o login e 403 vira o estado 'no-access': não há o que tratar aqui.
    auth.getAccessToken().catch(() => {});
  }, [auth]);

  if (status === 'loading') return loading;
  if (status === 'no-access') return <NoAccess hubUrl={auth.hubUrl} />;
  return <SondoAuthContext value={auth}>{children}</SondoAuthContext>;
}

/** O cliente de auth do Provider mais próximo (uso interno do widget). */
export function useSondoAuthClient(): SondoAuth {
  const auth = use(SondoAuthContext);
  if (!auth) throw new Error('Use dentro de <SondoAuthProvider>');
  return auth;
}

export function useSondoAuth() {
  const auth = useSondoAuthClient();
  const snapshot = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  // O Provider só renderiza os filhos depois de autenticado, então aqui sempre há usuário.
  if (snapshot.status !== 'authenticated') throw new Error('Usuário não autenticado');
  return { user: snapshot.user, getAccessToken: auth.getAccessToken, logout: auth.logout };
}

function NoAccess({ hubUrl }: { hubUrl: string }) {
  return (
    <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <p>Você não tem acesso a este aplicativo.</p>
      <a href={hubUrl}>Ir para a central</a>
    </div>
  );
}
```

**React 19 aqui:** `<SondoAuthContext value>` já é o provider (não precisa de `.Provider`), e `use(Context)` substitui o `useContext`.

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
import type { LauncherApp } from '@sondohub/contracts';
import { useEffect, useRef, useState } from 'react';
import { launcherCss } from './app-launcher.styles.js';
import { useSondoAuthClient } from './react.js';

export function AppLauncher() {
  const auth = useSondoAuthClient();
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
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
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
      <button type="button" className="sondo-launcher__button" aria-label="Aplicativos" aria-expanded={open} onClick={toggle}>
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
      {positions.flatMap((y) => positions.map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" />))}
    </svg>
  );
}
```

**Por que assim:**

- **A lista vem da API**, e não de uma configuração do pacote. Por isso um app novo aparece em todos os widgets **sem atualizar o pacote**: basta cadastrá-lo no hub.
- **Busca na 1ª abertura (lazy):** quem nunca abre o menu não faz a requisição.
- **`aria-label` e `aria-expanded`:** o leitor de tela anuncia "Aplicativos, recolhido/expandido". Custa uma linha.

## 🛠️ Passo 5 — Exportar, compilar e testar

**`packages/client/src/index.ts`**: a API pública do pacote, que é tudo o que os apps enxergam.

```ts
export { createSondoAuth, type AuthSnapshot, type SondoAuth } from './create-sondo-auth.js';
export { SondoAuthProvider, useSondoAuth } from './react.js';
export { AppLauncher } from './app-launcher.js';
```

O `useSondoAuthClient` fica **de fora** de propósito: é detalhe interno do widget.

**Testes do SDK.** Adicione o Vitest ao pacote e exclua os testes do build:

```powershell
pnpm --filter ./packages/client add -D vitest
```

- Em `packages/client/package.json`: `"test": "vitest run"`.
- Em `packages/client/tsconfig.json`: `"exclude": ["src/**/*.test.ts"]`.

**`packages/client/src/create-sondo-auth.test.ts`**

```ts
import { afterEach, expect, it, vi } from 'vitest';
import { createSondoAuth } from './create-sondo-auth.js';

const tokenResponse = {
  accessToken: 'token-1',
  expiresIn: 600,
  user: { id: 'u1', name: 'Ana', email: 'ana@sondotecnica.com.br', picture: null, level: 2 },
};

afterEach(() => vi.unstubAllGlobals());

it('várias chamadas ao mesmo tempo fazem UMA ida ao hub (single-flight)', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokenResponse)));
  vi.stubGlobal('fetch', fetchMock);
  const auth = createSondoAuth({ hubUrl: 'http://hub.test' });

  const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);

  expect(tokens).toEqual(['token-1', 'token-1', 'token-1']);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(auth.getSnapshot()).toEqual({ status: 'authenticated', user: tokenResponse.user });
});

it('token ainda válido vem do cache, sem nova requisição', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokenResponse)));
  vi.stubGlobal('fetch', fetchMock);
  const auth = createSondoAuth({ hubUrl: 'http://hub.test' });

  await auth.getAccessToken();
  await auth.getAccessToken();

  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('403 do hub vira o estado "no-access"', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
  const auth = createSondoAuth({ hubUrl: 'http://hub.test' });

  await expect(auth.getAccessToken()).rejects.toThrow();
  expect(auth.getSnapshot().status).toBe('no-access');
});
```

```powershell
pnpm --filter "@sondohub/*" build
```

```powershell
pnpm --filter ./packages/client test
```

Esperado: os 3 pacotes compilam e aparece `Tests  3 passed (3)`.

## 🛠️ Passo 6 — Integrar no app demo

É exatamente o que você vai fazer em cada app existente na Fase 4.

**Antes, limpe o template:** apague `apps/demo/src/index.css`, `src/App.css` e `src/assets/`. O CSS do template (`#root { width: 1126px; text-align: center; display: flex }`) desalinharia o cabeçalho do laboratório.

**Front, ponto 1: `apps/demo/src/lib/sondo.ts`.** Uma instância por app.

```ts
import { createSondoAuth } from '@sondohub/client'

// Uma instância por app: o access token fica guardado na memória dela.
export const sondo = createSondoAuth({ hubUrl: import.meta.env.VITE_HUB_URL })
```

**Front, ponto 2: `apps/demo/src/main.tsx`.** O app inteiro só renderiza com usuário válido.

```tsx
import { SondoAuthProvider } from '@sondohub/client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { sondo } from './lib/sondo.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SondoAuthProvider auth={sondo} loading={<p>Carregando…</p>}>
      <App />
    </SondoAuthProvider>
  </StrictMode>,
)
```

**Front, pontos 3 e 4: `apps/demo/src/App.tsx`.** O ponto 3 é o widget no cabeçalho, e o ponto 4 é o Bearer nas chamadas.

```tsx
import { AppLauncher, useSondoAuth } from '@sondohub/client'
import { useState } from 'react'
import { sondo } from './lib/sondo.ts'

export default function App() {
  const { user, logout } = useSondoAuth()
  const [result, setResult] = useState('')

  async function callApi(path: string) {
    const token = await sondo.getAccessToken()
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
    setResult(`${response.status} ${await response.text()}`)
  }

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AppLauncher />
        <strong>App Demo</strong>
        <span style={{ marginLeft: 'auto' }}>
          {user.name} · nível {user.level}
        </span>
        <button onClick={logout}>Sair</button>
      </header>

      <p>
        <button onClick={() => callApi('/api/hello')}>GET /api/hello</button>{' '}
        <button onClick={() => callApi('/api/admin-only')}>GET /api/admin-only (nível 3)</button>
      </p>
      <pre>{result}</pre>
    </main>
  )
}
```

**Back: `apps/demo/server.ts`.** Uma linha protege todas as rotas `/api`.

```ts
import { sondoAuth } from '@sondohub/server'
import express from 'express'

// Cada app dá nome aos seus níveis: nada de número mágico espalhado pelo código.
const Level = { READ: 1, EDIT: 2, ADMIN: 3 } as const

const app = express()

// Toda rota em /api exige um access token válido, emitido pelo hub para o "aud" demo.
app.use('/api', sondoAuth({ hubUrl: process.env.HUB_URL!, audience: 'demo' }))

app.get('/api/hello', (req, res) => {
  res.json({ message: `Olá, ${req.sondoUser!.name}!`, level: req.sondoUser!.level })
})

app.get('/api/admin-only', (req, res) => {
  if (req.sondoUser!.level < Level.ADMIN) {
    res.sendStatus(403)
    return
  }
  res.json({ secret: 'só quem tem nível 3 vê isto' })
})

app.listen(Number(process.env.DEMO_API_PORT))
```

> **`audience: 'demo'` é o `slug` do app no banco.** O nível vem **dentro do token**, então o backend do app nem consulta o hub para saber o que o usuário pode fazer.

---

## ✅ Checkpoint final da Fase 1 (no navegador)

Com `pnpm dev` rodando (API, hub, demo e a API do demo):

| # | Faça | Esperado |
|---|---|---|
| 1 | No hub, clique em **Sair**. Abra http://localhost:5181 | Redireciona para `localhost:5180/login?returnTo=http://localhost:5181/` |
| 2 | Entre como **admin** | Volta ao demo com "Administrador · nível 3" |
| 3 | Clique em ▦ | Painel com **App Demo** e o link "Ir para a central" |
| 4 | Recarregue o demo | Continua logado **sem pedir senha** (token novo pelo cookie do hub) |
| 5 | Clique em `GET /api/hello` e depois em `GET /api/admin-only` | `200 {"message":"Olá, Administrador!"…}` e `200 {"secret":…}` |
| 6 | **Sair**, e entre como **leitor** | "Leitor · nível 1"; `admin-only` → **`403`** |
| 7 | No Studio, apague o acesso do leitor ao demo e recarregue o demo | Tela **"Você não tem acesso a este aplicativo"** |
| 8 | DevTools → Application → **Local Storage** do demo | **Vazio**: o token está só em memória |
| 9 | DevTools → Network, na chamada `token` | `POST localhost:5180/api/sso/token`, origin `localhost:5181`, resposta com `access-control-allow-credentials: true` |
| 10 | Clique em **Sair** no demo e abra o hub | O hub pede login: um só logout derrubou a sessão de tudo |

**Ataques que já foram testados contra este código:**

| Ataque | Resultado |
|---|---|
| Chamar a API do demo sem token | 401 |
| Token de outro app (`aud: gemeo`) | 401 |
| Token com assinatura adulterada | 401 |
| Nível 2 numa rota que exige nível 3 | 403 |

---

## 🚚 Levando para um app existente (prévia da Fase 4)

1. No hub, cadastre o app: `slug`, `origin` (com protocolo e porta exatos), `url`, ícone e `levels`.
2. No front:
   - instale `@sondohub/client`;
   - crie o `lib/sondo.ts`;
   - envolva o app com `<SondoAuthProvider>`;
   - coloque o `<AppLauncher />` no cabeçalho;
   - envie `Bearer` em todas as chamadas à API do app;
   - **troque a tela de login antiga** por nada: o Provider já redireciona.
3. No back:
   - instale `@sondohub/server` e use `sondoAuth({ audience: '<slug>' })`;
   - troque a validação antiga de JWT por `req.sondoUser`;
   - crie `resolveLocalUser`, que procura por `hub_user_id`, depois por email (gravando o `hub_user_id`) e senão cria o usuário.
4. Converta os papéis antigos do app em **constantes de nível** (`Level.EDIT`), como no `server.ts` do demo.

---

## ⚠️ Atenção

- **No dev, o JWKS passa pelo proxy do hub.** O backend do app busca a chave em `HUB_URL` (5180), que repassa para a API (3100). Se só a API estiver rodando, **todo token é recusado com 401**. Isso foi verificado nos testes: rode sempre o `pnpm dev` completo.
- **Um único React por página:** o `client` declara o React como `peerDependency`. Se um app acabar com duas cópias, os hooks quebram com "Invalid hook call".
- **O token vence em até 10 min depois de revogado.** Para quem precisa de corte imediato (por exemplo, desligamento de funcionário), desative o usuário: a sessão cai no próximo `/sso/token`.
- **CSS do widget:** se um app tiver um reset muito agressivo (`* { all: unset }`), ele pode afetar o widget. Se acontecer, o próximo passo é isolar o widget em Shadow DOM. Só faça isso se acontecer.

## 🏋️ Exercícios

1. Adicione um botão **Sair** dentro do painel do `AppLauncher`. Qual função do SDK você usa, e por que ela fica no SDK e não no app?
2. Por que o demo chama `sondo.getAccessToken()` **antes de toda** chamada, em vez de guardar o token num `useState`?
3. Escreva um teste no `create-sondo-auth.test.ts`: "um token perto de expirar é renovado". Dica: `expiresIn: 30` (menos que a margem de 60 s).

<details>
<summary>Respostas</summary>

1. A `auth.logout()`, que vem de `useSondoAuthClient()`. Ela fica no SDK porque sair é igual em todos os apps: revogar a sessão no hub e ir para o login. Se cada app implementasse o seu, um esqueceria de revogar.
2. Porque o token **expira**. O `getAccessToken()` decide sozinho entre devolver o cache e renovar, e o app nunca segura um token velho. Num `useState`, você teria que reimplementar a renovação.
3. ```ts
   it('token perto de expirar é renovado', async () => {
     const shortLived = { ...tokenResponse, expiresIn: 30 };
     const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(shortLived))));
     vi.stubGlobal('fetch', fetchMock);
     const auth = createSondoAuth({ hubUrl: 'http://hub.test' });

     await auth.getAccessToken();
     await auth.getAccessToken();

     expect(fetchMock).toHaveBeenCalledTimes(2);
   });
   ```
   Use `mockImplementation`, e não `mockResolvedValue`: o corpo de um `Response` só pode ser lido uma vez, então cada chamada precisa de um `Response` novo.

</details>

---

🎉 **Fase 1 concluída.** O próximo passo é a Fase 2 (minha conta: email, foto, senha e sessões). Veja o roteiro em [01-arquitetura.md](01-arquitetura.md#7-roteiro-de-fases).
