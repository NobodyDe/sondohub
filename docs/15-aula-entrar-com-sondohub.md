# 15 — "Entrar com SondoHub" na tela de login do Gêmeo

> 🎯 **Objetivo:** na tela de login do Gêmeo, um botão **Entrar com SondoHub**. Quem clica:
> 1. vai para a tela de login do hub;
> 2. faz login lá;
> 3. volta para o Gêmeo já logado, no dashboard.
>
> **A boa notícia: o fluxo já está pronto no front do Gêmeo** (`app-gemeo-digital-hotel-fairmont`). O botão existe, e a rota de volta também. Ele não aparece em produção porque o build saiu sem o `VITE_HUB_URL`. Esta aula explica cada peça, troca o texto do botão e liga o fluxo em produção.

---

## 🧠 Conceito: o Gêmeo nunca vê a senha do hub

O Gêmeo **não** chama o `POST /api/auth/login` do hub. Quem digita a senha é a tela **do hub**, e o Gêmeo só recebe, no fim, um token emitido para ele. São dois redirecionamentos e uma chamada:

```
Gêmeo /login
  │ clique em "Entrar com SondoHub"
  ▼
Gêmeo /login/sondohub ──► POST hub/api/sso/token ──► 401 (ainda sem sessão no hub)
  │ o SDK redireciona
  ▼
hub /login?returnTo=https://app-gds.sondotecnica.com/login/sondohub
  │ o usuário faz login NO HUB, e o cookie de sessão fica em hub.sondotecnica.com
  │ o hub confere o returnTo e devolve o navegador
  ▼
Gêmeo /login/sondohub ──► POST hub/api/sso/token ──► 200 { accessToken, user }
  │ abre a sessão no Gêmeo
  ▼
Gêmeo /dashboard
```

**Por que a volta é para `/login/sondohub` e não para o `/dashboard`:** a mesma página faz as duas coisas. Na ida, sem sessão, o SDK manda o navegador para o hub. Na volta, com sessão, o SDK recebe o token. Uma rota, uma responsabilidade: abrir a sessão pelo hub.

**Por que o hub confere o `returnTo`:** sem isso, `hub/login?returnTo=https://site-falso.com` viraria isca de phishing. O usuário veria a tela verdadeira do hub e, depois do login, cairia num site falso. O `safeReturnTo` (`apps/hub/src/features/auth/safe-return-to.ts`) só aceita voltar para a origem de um app **liberado para aquele usuário**.

**Por que o cookie do hub passa para o Gêmeo:** passa porque `app-gds.sondotecnica.com` e `hub.sondotecnica.com` são o mesmo site, `sondotecnica.com`. É por isso que o domínio do hub foi decidido antes do deploy (aula 07b).

---

## 🛠️ As peças, uma por uma (já existem no Gêmeo)

### 1. O cliente do hub (`src/lib/sondo.ts`)

```ts
export const sondo = createSondoAuth({ hubUrl: import.meta.env.VITE_HUB_URL });

// Sem VITE_HUB_URL no build não há hub para onde ir: o login por ele fica desligado.
export const hubEnabled = Boolean(import.meta.env.VITE_HUB_URL);
```

Uma instância para o app inteiro, e o access token fica guardado na memória dela. O `hubEnabled` é o interruptor: sem o endereço do hub no build, o botão nem aparece. Era exatamente isso que acontecia em produção.

### 2. O botão (`src/routes/auth/loginForm.tsx`)

Hoje o botão diz só "SondoHub". Troque o texto:

```tsx
{hubEnabled && (
  <>
    <FieldSeparator>Ou continue com </FieldSeparator>

    <Field>
      <div className="flex items-center justify-center gap-6">
        <Button
          variant="outline"
          type="button"
          onClick={() => navigate("/login/sondohub")}
        >
          Entrar com SondoHub
        </Button>
      </div>
    </Field>
  </>
)}
```

- **`type="button"`:** o botão está dentro do `<form>` do login próprio. Sem isso, o clique enviaria o formulário de e-mail e senha.
- **`navigate`, e não `location.assign` direto para o hub:** quem sabe montar a URL do hub, com o `returnTo` certo, é o SDK. O botão só leva para a rota que cuida disso.

### 3. A rota de ida e volta (`src/App.tsx` e `src/routes/auth/SondoHubLogin.tsx`)

```tsx
<Route path="/login/sondohub" element={<SondoHubLogin />} />
```

Ela fica **fora** do `<ProtectedRoute>`, porque quem chega nela ainda não está logado no Gêmeo.

```tsx
// Também é a URL para onde o hub devolve o usuário depois do login dele.
function SondoHubLogin() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AuthService.loginWithSondoHub().then(
      () => navigate("/dashboard", { replace: true }),
      (err) => setError(errorMessage(err)),
    );
  }, [navigate]);
  // ...spinner enquanto espera, ou a mensagem de erro com "Voltar ao login"
}
```

O `replace: true` tira o `/login/sondohub` do histórico. Sem ele, o "voltar" do navegador cairia nessa página, que abriria a sessão de novo.

### 4. Abrir a sessão (`src/api/services/auth.service.ts`)

```ts
async function loginWithSondoHub() {
  const { user } = await sondo.getSession();
  openSession("sondohub", user);
}
```

O `getSession()` do SDK faz o trabalho:

- **Sem sessão no hub:** redireciona para `hub/login?returnTo=<esta página>` e não termina, porque o navegador sai da página.
- **Com sessão:** devolve o token e o usuário, com nome, e-mail e o **nível no Gêmeo**.
- **Sem acesso ao Gêmeo:** lança `NoAccessError`, e a tela mostra "Você não tem acesso a este aplicativo".

O `openSession("sondohub", user)` grava no `localStorage` só **qual** login foi usado, para o F5. O token não vai para lá: ele fica na memória do SDK.

### 5. Usar a sessão (já pronto)

- **`src/api/axios.ts`:** com o método `sondohub`, cada chamada ao back do Gêmeo leva o `Authorization: Bearer <token do hub>`.
- **`restore()`:** depois de um F5, tenta de novo o login usado da última vez.
- **`logout()`:** com o método `sondohub`, também encerra a sessão no hub.

---

## 🛠️ O que você faz agora

### Passo 1 — O endereço do hub no build (`.env.production`)

```
VITE_HUB_URL=https://hub.sondotecnica.com
VITE_API_URL=https://gds-techlab.sondotecnica.com/
```

Sem barra no fim: o SDK monta `${hubUrl}/api/sso/token`. A linha já está no seu clone, falta só commitar.

### Passo 2 — O texto do botão

A troca de "SondoHub" por "Entrar com SondoHub", da peça 2.

### Passo 3 — Conferir o cadastro no hub

No admin do hub, em **Catálogo**, o Gêmeo precisa estar assim:

| Campo | Valor |
|---|---|
| URL | `https://app-gds.sondotecnica.com/dashboard`. A origem sai dela: `https://app-gds.sondotecnica.com` |
| Ativo | sim |

E o usuário que vai testar precisa ter **acesso ao Gêmeo**, em **Usuários** → o usuário → Gêmeo. Isso importa duas vezes:

- **O hub emite o token por origem.** Uma origem diferente da cadastrada, por exemplo `http://` no lugar de `https://`, leva 403.
- **Sem acesso, a volta falha.** O `safeReturnTo` só devolve o usuário para apps dele. Sem acesso, o hub deixa o usuário no launcher em vez de voltar para o Gêmeo.

Cadastrou ou mudou o app? Na VM do hub, rode `docker compose restart api`: o CORS é lido só quando a API sobe.

### Passo 4 — Build e deploy

`pnpm build` e suba a `dist` como você já faz.

Se você já estiver aplicando a aula 14, o back do Gêmeo também passa a **exigir** o token. Sem a aula 14, o login funciona do mesmo jeito; só as rotas do back continuam abertas.

---

## ✅ Checkpoint

Numa aba anônima, para começar sem sessão nenhuma:

| # | Faça | Esperado |
|---|---|---|
| 1 | Abrir `https://app-gds.sondotecnica.com/login` | O botão **Entrar com SondoHub** aparece |
| 2 | Clicar nele | Vai para `hub.sondotecnica.com/login?returnTo=...app-gds.../login/sondohub` |
| 3 | Fazer login no hub | Volta sozinho para o Gêmeo e cai no `/dashboard` |
| 4 | F5 no dashboard | Continua logado, sem pedir login de novo |
| 5 | DevTools → Network → uma chamada ao `gds-techlab` | Header `Authorization: Bearer eyJ...` |
| 6 | Outra aba, `https://hub.sondotecnica.com`, clicar no Gêmeo | Entra direto: a sessão do hub já existe |
| 7 | Sair no Gêmeo | Sai também do hub, e o hub mostra a tela de login |
| 8 | Com um usuário **sem** acesso ao Gêmeo | O hub fica no launcher; abrindo o Gêmeo, aparece "Você não tem acesso a este aplicativo" |
| 9 | Login próprio (e-mail e senha do Gêmeo) | Continua funcionando |

---

## 🧯 Erros comuns

| Sintoma | Causa | Solução |
|---|---|---|
| O botão não aparece | O build saiu sem o `VITE_HUB_URL` | Passo 1, e rode o build **de novo**: a variável é gravada no JavaScript na hora do build |
| Depois do login, o hub fica no launcher e não volta | O usuário não tem acesso ao Gêmeo, ou a URL cadastrada tem outra origem | Passo 3 |
| "Não foi possível falar com o SondoHub" | CORS: a API do hub não reconhece a origem (cadastro errado, ou a API não foi reiniciada depois do cadastro) | Passo 3 e o `docker compose restart api` |
| Volta para o Gêmeo, vai para o hub de novo, e fica nesse ciclo | O cookie do hub não está indo no `fetch` do Gêmeo: hub e Gêmeo em sites diferentes, ou acesso por `http://` | Use sempre `https://`, com os dois em `*.sondotecnica.com` |
| Logado, mas as telas sem dados (401 do `gds-techlab`) | O back do Gêmeo exige o token do hub e está com o `HUB_URL` errado | `HUB_URL=https://hub.sondotecnica.com` no `.env` do back (aula 14, Passo 2.9) |

---

## ⏳ O que ficou para depois

| Hoje | Quando mexer |
|---|---|
| Dois botões de login na mesma tela (o próprio e o do hub) | Quando todos tiverem conta no hub, o login próprio sai, e o `/login` do Gêmeo pode mandar direto para o `/login/sondohub` |
| O texto do botão é só texto | Se a empresa quiser o logo do SondoHub no botão, é um `<img>` dentro do `<Button>`; não muda nada no fluxo |
