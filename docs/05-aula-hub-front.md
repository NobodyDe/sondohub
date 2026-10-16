# Aula 05 — Hub: tela de login e launcher

> 🎯 **Objetivo:** a central em http://localhost:5180 consome as rotas das aulas 03 e 04:
> - uma **tela de login**;
> - um **launcher**, a lista de apps do usuário com o nível;
> - o botão **Sair**.
>
> **Pré-requisito:** [aula 04](04-aula-sessao-e-apps.md).

---

## 🧠 Conceito: o hub não precisa de token

O hub e a API estão no **mesmo origin**: o proxy `/api` do Vite (guia 02) reproduz o `hub.sondotecnica.com.br/api` de produção. Então:

```
navegador (5180) ── fetch('/api/me') ──▶ proxy do Vite ──▶ API (3100)
                     o cookie vai junto sozinho; o JavaScript nem o enxerga (HttpOnly)
```

Não tem token, nem header `Authorization`, nem CORS. O JavaScript do hub só pergunta "quem sou eu?" (`/api/me`), e a API responde olhando o cookie.

**Estado do servidor:** o que vem da API fica no **TanStack Query** (já instalado). Ele dá cache e os estados de carregando e de erro prontos, sem `useEffect` para cada chamada.

---

## 🛠️ Passo 1 — Limpar o template

```powershell
Remove-Item apps/hub/src/App.tsx, apps/hub/src/App.css
```

No `apps/hub/index.html`, troque `<title>hub</title>` por `<title>SondoHub</title>`.

## 🛠️ Passo 2 — Cliente da API (`apps/hub/src/lib/api.ts`)

```ts
import type { HubProfile, LauncherApp, LoginInput } from "@sondohub/contracts";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`A API respondeu ${status}`);
    this.status = status;
  }
}

// O hub fala com a própria API no mesmo origin (/api), então o cookie de sessão vai sozinho.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new ApiError(response.status);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const hubApi = {
  login: (input: LoginInput) =>
    request<HubProfile>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<HubProfile>("/me"),
  myApps: () => request<LauncherApp[]>("/me/apps"),
};
```

**Por que assim:**

- **Um `request` só:** a URL base, o JSON e o tratamento de erro ficam num lugar. Cada rota vira uma linha, tipada pelo `contracts`.
- **`ApiError` carrega o `status`:** a tela decide a mensagem (401 é senha errada) sem ler texto.
- **O `status` é declarado como campo**, e não como `constructor(readonly status)`: o template do Vite liga `erasableSyntaxOnly`, que proíbe essa sintaxe.

## 🛠️ Passo 3 — Tela de login (`apps/hub/src/features/auth/login-page.tsx`)

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ApiError, hubApi } from "../../lib/api.ts";

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      navigate("/");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Email ou senha inválidos."
          : "Não foi possível entrar. Tente de novo.",
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow"
      >
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
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
```

**Detalhes:**

- **`FormData` em vez de um `useState` por campo:** dois campos não pedem estado controlado.
- **`autoComplete="username"` e `"current-password"`:** o gerenciador de senhas reconhece o login. Com uma senha só para tudo, isso importa.
- **Depois do login vai sempre para `/`.** Voltar para o app de onde o usuário veio (`returnTo`) entra na aula 07, junto com a proteção que ele exige.

## 🛠️ Passo 4 — Launcher (`apps/hub/src/features/launcher/launcher-page.tsx`)

```tsx
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { ApiError, hubApi } from "../../lib/api.ts";

async function logout() {
  await hubApi.logout();
  location.assign("/login");
}

export function LauncherPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: hubApi.me, retry: false });
  const apps = useQuery({ queryKey: ["my-apps"], queryFn: hubApi.myApps, enabled: me.isSuccess });

  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />;
  if (me.isError) return <p className="p-8 text-red-600">Não foi possível carregar. Recarregue a página.</p>;
  if (!me.data) return <p className="p-8 text-slate-500">Carregando…</p>;

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
              className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <img src={app.iconUrl} alt="" className="size-12" />
              <span className="text-sm font-medium text-slate-700">{app.name}</span>
              <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-500">nível {app.level}</span>
            </a>
          </li>
        ))}
      </ul>
      {apps.data?.length === 0 && <p className="text-slate-500">Nenhum app liberado para você ainda.</p>}
    </main>
  );
}
```

**Por que assim:**

- **`retry: false` no `/me`:** um 401 não melhora tentando de novo, então vai direto para o login.
- **`enabled: me.isSuccess`:** só busca os apps depois de saber que há sessão.
- **Os três estados (401, erro, carregando) saem primeiro, com *early return*.** Depois disso, o resto do componente só cuida do caso feliz.

## 🛠️ Passo 5 — Rotas (`apps/hub/src/main.tsx`)

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { LoginPage } from "./features/auth/login-page.tsx";
import { LauncherPage } from "./features/launcher/launcher-page.tsx";
import "./index.css";

const router = createBrowserRouter([
  { path: "/", element: <LauncherPage /> },
  { path: "/login", element: <LoginPage /> },
]);

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

---

## ✅ Checkpoint (no navegador)

Testado assim:

1. Abra http://localhost:5180. Sem sessão, você vai parar em **/login**.
2. Entre como o leitor → **"Olá, Leitor"** e o card **App Demo · nível 1**.
3. **Recarregue a página:** continua logado. A sessão está no cookie, não na memória.
4. No console do DevTools, rode `document.cookie`. Vem **vazio**: é o `HttpOnly` funcionando, porque o JavaScript não alcança a sessão.
5. Clique em **Sair** → volta para `/login`. Abrir `/` de novo também leva para o login.

## ⏳ O que ficou para depois

| Hoje | Resolve em |
|---|---|
| Depois do login, sempre `/` | aula 07 (`returnTo` seguro) |
| `Admin@…` com maiúscula não entra (o email não é normalizado) | aula 08 (o `loginSchema` passa a validar e normalizar na API) |

➡️ Próximo: [06 — Token para os apps](06-aula-token-para-apps.md)
