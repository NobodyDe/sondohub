# Aula 06 — Hub: login e launcher

> **Objetivo:** a central em `http://localhost:5180` tem duas telas:
> - uma **tela de login**, a única do ecossistema onde se digita senha;
> - um **launcher** com os apps liberados para o usuário.
>
> Depois do login, o usuário volta com segurança para o app de onde veio.
>
> **Pré-requisito:** [aula 05](05-aula-sso-e-tokens.md) concluída.

---

## 🧠 Conceito

### O hub não usa access token

O hub e a API ficam no **mesmo origin** (o proxy `/api` do Vite reproduz o `hub.sondotecnica.com.br/api` de produção). O navegador envia o cookie de sessão sozinho em cada `fetch('/api/...')`, sem CORS e sem token. O access token existe para os **outros** apps, que ficam em outros subdomínios.

```
Hub (5180) ──fetch('/api/me')──▶ proxy do Vite ──▶ API (3100)
              cookie vai junto (mesmo origin, first-party)
```

### O fluxo de login

```
gemeo.sondotecnica.com.br  ──401──▶  hub/login?returnTo=https://gemeo.sondotecnica.com.br/relatorio
                                        │
                                        ├─ já tem sessão? ──▶ volta direto (SSO, sem senha)
                                        └─ senão: email + senha ──▶ cookie criado ──▶ volta para o returnTo
```

### O perigo do `returnTo`: *open redirect*

Se o hub aceitar qualquer `returnTo`, um atacante manda por email um link assim:

```
https://hub.sondotecnica.com.br/login?returnTo=https://sondotecnica-login.com
```

O domínio é verdadeiro, o login é verdadeiro, e depois do login a vítima cai num site falso que pede "confirme sua senha". Por isso **só voltamos para apps liberados ao usuário**.

### Estado do servidor, não estado global

Os dados que vêm da API (`/me`, `/sso/apps`) ficam no **TanStack Query**: cache, loading e erro prontos, sem Redux e sem `useEffect` para cada chamada.

---

## 🛠️ Passo 1 — Dependências e testes

`react-router`, `@tanstack/react-query` e `@sondohub/contracts` já entraram no guia 02. Falta o Vitest:

```powershell
pnpm --filter hub add -D vitest
```

Em `apps/hub/package.json`, adicione o script:

```json
"test": "vitest run",
```

Apague `apps/hub/src/App.tsx` (o provisório do guia 02). No `apps/hub/index.html`, troque o `<title>` para `SondoHub`.

## 🛠️ Passo 2 — Cliente da API (`src/lib/api.ts`)

```ts
import type { HubProfile, LauncherApp, LoginInput } from '@sondohub/contracts'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`A API respondeu ${status}`)
    this.status = status
  }
}

// O hub fala com a própria API no mesmo origin (/api), então o cookie de sessão vai sozinho.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } })
  if (!response.ok) throw new ApiError(response.status)
  return (response.status === 204 ? undefined : await response.json()) as T
}

export const hubApi = {
  login: (input: LoginInput) => request<void>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<void>('/sso/logout', { method: 'POST' }),
  me: () => request<HubProfile>('/me'),
  listApps: () => request<LauncherApp[]>('/sso/apps'),
}
```

**Por que assim:**

- **Um único `request`:** a URL base, o JSON e os erros ficam num lugar só. Cada chamada vira uma linha tipada pelo `contracts`.
- **`ApiError` carrega o `status`:** a tela decide a mensagem (401 é "senha errada", 429 é "aguarde") sem ler texto de erro.
- **O campo `status` é declarado explicitamente** (e não como `constructor(readonly status)`): o template do Vite liga `erasableSyntaxOnly`, que proíbe *parameter properties* e `enum`.

## 🛠️ Passo 3 — Proteção contra open redirect (`src/features/auth/safe-return-to.ts`)

```ts
import type { LauncherApp } from '@sondohub/contracts'

/**
 * Só deixa voltar para endereços de apps liberados ao usuário.
 * Sem isso, hub/login?returnTo=https://site-falso.com viraria isca de phishing (open redirect).
 */
export function safeReturnTo(returnTo: string | null, apps: LauncherApp[]): string | null {
  if (!returnTo) return null
  try {
    const { origin } = new URL(returnTo)
    return apps.some((app) => new URL(app.url).origin === origin) ? returnTo : null
  } catch {
    return null // não é uma URL absoluta válida
  }
}
```

É uma **função pura**: sem React, sem fetch, só entrada e saída. Por isso dá para testá-la em milissegundos. **`src/features/auth/safe-return-to.test.ts`**:

```ts
import { describe, expect, it } from 'vitest'
import { safeReturnTo } from './safe-return-to.ts'

const apps = [{ slug: 'demo', name: 'Demo', iconUrl: '', url: 'http://localhost:5181' }]

describe('safeReturnTo', () => {
  it('aceita um endereço de app liberado', () => {
    expect(safeReturnTo('http://localhost:5181/relatorios?id=1', apps)).toBe('http://localhost:5181/relatorios?id=1')
  })

  it('recusa um site que não é app do usuário (open redirect)', () => {
    expect(safeReturnTo('https://site-falso.com/login', apps)).toBeNull()
  })

  it('recusa javascript: e lixo', () => {
    expect(safeReturnTo('javascript:alert(1)', apps)).toBeNull()
    expect(safeReturnTo('nao-e-url', apps)).toBeNull()
  })
})
```

```powershell
pnpm --filter hub test
```

> **Por que comparar o `origin` e não "começa com"?** Com `startsWith`, um endereço como `http://localhost:5181.site-falso.com` passaria, porque "começa com" a URL do app. Já o `new URL(...).origin` compara protocolo, host e porta **exatos**.

## 🛠️ Passo 4 — Tela de login (`src/features/auth/login-page.tsx`)

```tsx
import { loginSchema } from '@sondohub/contracts'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError, hubApi } from '../../lib/api.ts'
import { safeReturnTo } from './safe-return-to.ts'

async function continueTo(returnTo: string | null) {
  const target = safeReturnTo(returnTo, await hubApi.listApps())
  location.assign(target ?? '/')
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return 'Email ou senha inválidos.'
  if (error instanceof ApiError && error.status === 429) return 'Muitas tentativas. Aguarde um minuto.'
  return 'Não foi possível entrar. Tente de novo.'
}

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Já tem sessão? Não pede a senha de novo: segue direto para onde ia.
  useEffect(() => {
    hubApi.me().then(
      () => continueTo(returnTo),
      () => {},
    )
  }, [returnTo])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = loginSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)))
    if (!parsed.success) {
      setError('Informe um email válido e a senha.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await hubApi.login(parsed.data)
      await continueTo(returnTo)
    } catch (err) {
      setError(loginErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-slate-800">Entrar no SondoHub</h1>
        <input
          name="email"
          type="email"
          autoComplete="username"
          placeholder="Email"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Senha"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white disabled:opacity-60"
        >
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
```

**Por que assim:**

- **O mesmo `loginSchema` da API:** se a regra do email mudar no `contracts`, o front e o back mudam juntos. A validação no front é **conforto** para o usuário; a **segurança** continua na API.
- **`FormData` em vez de um `useState` por campo:** um formulário de dois campos não precisa de estado controlado. O `react-hook-form` entra na Fase 2, quando os formulários crescerem.
- **`autoComplete="username"` e `"current-password"`:** o gerenciador de senhas reconhece o login. Com uma senha só para tudo, isso importa.
- **`location.assign` e não `navigate`:** o destino é **outro app** (outro origin). O React Router só navega dentro do hub.

## 🛠️ Passo 5 — Launcher (`src/features/launcher/launcher-page.tsx`)

```tsx
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router'
import { ApiError, hubApi } from '../../lib/api.ts'

async function logout() {
  await hubApi.logout()
  location.assign('/login')
}

export function LauncherPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: hubApi.me, retry: false })
  const apps = useQuery({ queryKey: ['apps'], queryFn: hubApi.listApps, enabled: me.isSuccess })

  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />
  if (me.isError) return <p className="p-8 text-red-600">Não foi possível carregar. Recarregue a página.</p>
  if (!me.data) return <p className="p-8 text-slate-500">Carregando…</p>

  return (
    <main className="mx-auto max-w-4xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Olá, {me.data.name}</h1>
        <button onClick={logout} className="text-sm text-slate-600 hover:text-slate-900">
          Sair
        </button>
      </header>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {apps.data?.map((app) => (
          <li key={app.slug}>
            <a
              href={app.url}
              className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <img src={app.iconUrl} alt="" className="size-12" />
              <span className="text-sm font-medium text-slate-700">{app.name}</span>
            </a>
          </li>
        ))}
      </ul>
      {apps.data?.length === 0 && <p className="text-slate-500">Nenhum app liberado para você ainda.</p>}
    </main>
  )
}
```

**Por que assim:**

- **`retry: false` no `/me`:** um 401 não melhora tentando de novo. Vai direto para o login.
- **`enabled: me.isSuccess`:** só busca os apps depois de saber que há sessão, evitando um segundo 401 à toa.
- **Três estados explícitos** (401, erro, carregando) e depois a tela feliz: são *early returns*, sem `if` aninhado.

## 🛠️ Passo 6 — Rotas (`src/main.tsx`)

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { LoginPage } from './features/auth/login-page.tsx'
import { LauncherPage } from './features/launcher/launcher-page.tsx'
import './index.css'

const router = createBrowserRouter([
  { path: '/', element: <LauncherPage /> },
  { path: '/login', element: <LoginPage /> },
])

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
```

A estrutura fica assim, com pastas **por feature**. Na Fase 2 entram `account/` e, na Fase 3, `admin/`:

```
apps/hub/src/
├─ features/
│  ├─ auth/        login-page.tsx · safe-return-to.ts (+ teste)
│  └─ launcher/    launcher-page.tsx
├─ lib/api.ts
├─ index.css
└─ main.tsx
```

---

## ✅ Checkpoint (no navegador)

Com `pnpm dev` rodando:

1. Abra http://localhost:5180. Você é redirecionado para **/login**.
2. Teste o login:
   - entre com o leitor (`leitor@sondotecnica.com.br` e a `SEED_PASSWORD`) → o launcher mostra **"Olá, Leitor"** e o card **App Demo**;
   - **recarregue a página** → continua logado. A sessão está no cookie, não na memória.
3. No **DevTools → Application → Cookies**, o cookie `sondohub_session` precisa aparecer com:
   - **HttpOnly ✔** e **SameSite Strict ✔**;
   - **Secure ✘**, só no dev. Em produção, com `COOKIE_SECURE=true`, fica ✔.
4. No console do DevTools, rode `document.cookie`. A sessão **não aparece**: é o `HttpOnly` funcionando.
5. Teste o `returnTo`:
   - clique em **Sair** e abra `http://localhost:5180/login?returnTo=https://site-falso.com`;
   - faça login → você cai no **launcher**, não no site falso;
   - repita com `?returnTo=http://localhost:5181/qualquer` → você vai para o demo (que ainda mostra o template; a aula 07 integra).
6. Erre a senha 6 vezes → "Email ou senha inválidos." Na 11ª tentativa do minuto aparece "Muitas tentativas. Aguarde um minuto."

```powershell
pnpm --filter hub test
```

Esperado: `Tests  3 passed (3)`.

---

## ⚠️ Atenção

- **SPA em produção:** o proxy reverso precisa devolver o `index.html` para rotas como `/login`. No dev, o Vite já faz isso.
- **StrictMode no dev roda os efeitos duas vezes:** o `me()` da tela de login é chamado 2×. É inofensivo, e é o React avisando que efeitos precisam ser idempotentes.
- **Estilo:** o código do front segue o estilo do template do Vite (sem ponto e vírgula), e o da API o do Nest. Cada app fica consistente com o próprio scaffold.

## 🏋️ Exercícios

1. Mostre a foto do usuário no cabeçalho do launcher, ou as iniciais se `avatarUrl` for `null`. Onde fica a lógica das iniciais e como você a testaria?
2. Por que o `continueTo` busca `listApps()` em vez de aceitar qualquer subdomínio de `sondotecnica.com.br`?

<details>
<summary>Respostas</summary>

1. Numa função pura, `initials(name: string): string`, em `features/launcher/`, testada como o `safeReturnTo`. O componente só decide entre `<img>` e `<span>{initials(name)}</span>`.
2. Porque um subdomínio comprometido (um site antigo esquecido, por exemplo) também é `*.sondotecnica.com.br`. A lista de apps liberados é a fonte de verdade, e ainda é mais restritiva: nem todo usuário pode ir para qualquer app.

</details>

➡️ Próximo: [07 — SDK, widget e app demo](07-aula-sdk-widget-e-demo.md)
