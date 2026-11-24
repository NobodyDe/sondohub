# 19 — Guia: integrar um app da Sondotecnica ao SondoHub

> **Para quem:** quem vai plugar um app novo (front + API + banco) no SondoHub.
> **Base:** a integração do **Experience** (doc 18), feita e testada em dev em 23–24/11/2026. O Gêmeo (aulas 07b, 14 e 17) é o outro modelo de referência.
> **Resultado:** o app ganha o botão **Entrar com SondoHub**, aparece no widget ▦, e o Master do hub libera, troca o nível e tira o acesso das pessoas pelo painel do hub.

---

## 1. Visão geral

São duas conversas independentes entre o hub e o app:

```
1) LOGIN (pessoa no navegador)
   front do app ──► hub /api/sso/token (cookie do hub) ──► token RS256, 10 min, aud = <slug>
   front do app ──► API do app /api/auth/sondohub  (Authorization: Bearer <token do hub>)
   API do app   ──► valida no JWKS do hub, acha/cria o usuário local, devolve a sessão do app

2) CADASTRO (servidor a servidor, sem ninguém logado)
   painel do hub (Master) ──► API do app PUT/DELETE /api/sondohub/users/:hubId  (X-Api-Key)
```

| Peça | Credencial | Quem valida |
|---|---|---|
| Navegador → hub | cookie de sessão do hub | hub |
| Front → API do app (login) | token do hub, uma vez | API do app, com `@sondohub/server` |
| Front → API do app (resto) | sessão do próprio app | API do app, como antes |
| API do hub → API do app | chave de API em `X-Api-Key` | API do app, guard próprio |

---

## 2. Decida o modelo antes de começar

| Pergunta | Se sim | Se não |
|---|---|---|
| O app já tem login e permissões próprias (telas, papéis, ids numéricos)? | **Troca de token** (Experience): o app troca o token do hub pela sessão dele uma vez | **Token em toda chamada** (Gêmeo): o back valida o token do hub em cada rota com o `sondoAuth` |
| O app precisa conhecer a pessoa antes do primeiro login (liberar telas, ligar a contratos)? | **Cadastro pelo hub** (seção 6) | Pule a seção 6: o usuário nasce no primeiro login |
| O login próprio do app precisa continuar funcionando? | Tudo entra **ao lado** dele; nada do login atual é editado | — |

Este guia segue o caminho do Experience: troca de token + cadastro pelo hub + login antigo intacto.

---

## 3. Pré-requisitos

- **Mesmo domínio:** front do app em `*.sondotecnica.com`, sempre `https://` em produção. Em outro domínio o cookie do hub não vai junto e o login entra em loop.
- **Node 24** e **TypeScript ≥ 5.8** no back. O `@sondohub/server` é ESM; um back CommonJS importa com `"module": "nodenext"` no `tsconfig.json`.
- **Pacotes** (GitHub Packages, org `sondohub`):

| Pacote | Onde | Para quê |
|---|---|---|
| `@sondohub/server` | API do app | `createTokenVerifier` |
| `@sondohub/client` | front do app | `createSondoAuth`, `NoAccessError`, `SondoAuthProvider`, `AppLauncher` |

- Cada repositório tem um `.npmrc` **commitado** com `@sondohub:registry=https://npm.pkg.github.com`. O token de leitura vai em `pnpm config set`, nunca no `.npmrc` do projeto.
- **Sem token na máquina (só dev):** instale pela pasta do monorepo e troque pela versão publicada antes de produção:

```powershell
pnpm add "@sondohub/server@link:../../sondohub/packages/server"
```

  Confira no `package.json` que o caminho ficou com `/`, não `\\`.

---

## 4. Passo 1 — Hub: cadastrar o app

### 4.1 A migration do catálogo

`sondohub/apps/api/prisma/migrations/<data>_<slug>_app/migration.sql`:

```sql
-- Entra INATIVO nos dois bancos: inativo, o app não aparece no ▦, não recebe token e não libera CORS.
-- Assim a produção nunca aceita http://localhost por engano.
INSERT INTO "applications" ("id", "slug", "name", "description", "icon_url", "url", "origin", "levels", "is_active")
VALUES (
  gen_random_uuid(),
  'experience',
  'Experience',
  'Eventos, apresentações e pesquisa de satisfação do Experience',
  'http://localhost:5183/logo-experience.svg',
  'http://localhost:5183/login/sondohub',
  'http://localhost:5183',
  '[{ "level": 1, "label": "Administrador" }, { "level": 2, "label": "Usuário" }]'::jsonb,
  false
)
ON CONFLICT ("slug") DO NOTHING;
```

- **`id`:** o `@default(uuid())` do Prisma não existe no banco; o SQL gera com `gen_random_uuid()`.
- **`url` termina em `/login/sondohub`:** é para onde o ▦ leva; a pessoa entra direto, sem ver a tela de login.
- **`origin` é a identidade do app no SSO e é `UNIQUE`.** Cada app precisa de uma porta de dev própria (o Gêmeo já usa a 5173; o Experience usa a 5183).
- **`levels`:** convenção do hub é número maior = mais permissão. Se o número for direto para uma coluna do app (como o `adm` do Experience), documente a exceção.

### 4.2 Aplicar e ativar

```powershell
cd sondohub/apps/api
pnpm prisma migrate deploy
```

1. **Dev:** Catálogo → app → **ativar**.
2. **Produção:** a migration roda no deploy. No Catálogo: trocar URL **e ícone** pelos reais (a origem é recalculada ao salvar; o ícone não) → ativar.
3. **Reinicie a API do hub** depois de ativar: o CORS é lido no boot.

**Teste rápido:** sem cookie, a resposta tem que ser 401 com o header de CORS do app:

```powershell
curl.exe -i -X POST http://localhost:3100/api/sso/token -H "Origin: http://localhost:5183"
```

---

## 5. Passo 2 — API do app: login pelo hub

### 5.1 Banco: ligar o usuário local ao usuário do hub

```sql
ALTER TABLE app_experience.usuarios
  ADD COLUMN IF NOT EXISTS hub_user_id UUID UNIQUE;
```

Uma coluna na tabela de usuários que já existe, não uma tabela nova. `NULL` = só usa o login próprio. `UNIQUE` = um usuário do hub nunca vira duas linhas.

### 5.2 Variável

```
# igual, caractere por caractere, ao HUB_URL do .env do hub: é o "iss" do token
HUB_URL=http://localhost:5180
```

É o endereço **público** do hub (o front, 5180), não a porta da API (3100). Sem barra no fim.

### 5.3 Achar ou criar o usuário

```ts
type HubUser = { id: string; name: string; email: string; picture?: string | null };

/* 1º pelo hub_user_id; na primeira vez, pelo e-mail (liga quem já tinha login próprio). */
async function findHubMatch(hub: HubUser): Promise<number | null> {
  const found = await pool.query<{ id: number }>(
    `SELECT id FROM app_experience.usuarios
      WHERE hub_user_id = $1 OR (hub_user_id IS NULL AND lower(email) = lower($2))
      ORDER BY hub_user_id NULLS LAST, status DESC
      LIMIT 1`,
    [hub.id, hub.email]
  );
  return found.rows[0]?.id ?? null;
}
```

O `upsertFromHub` usa o `findHubMatch`: se achou, atualiza `hub_user_id`, `nome`, `email` e a foto (`COALESCE($5, imagem_perfil)`); se não achou, cria com `senha = ''` (nenhum MD5 bate com vazio) e a permissão mínima. **Nunca mexe em senha, papel nem telas de quem já existe.**

### 5.4 A rota da troca

```ts
import { createTokenVerifier } from '@sondohub/server';

// audience = slug do app no hub: um token emitido para outro app é recusado.
const verifyHubToken = createTokenVerifier({ hubUrl: process.env.HUB_URL!, audience: 'experience' });

// POST /api/auth/sondohub
async loginSondoHub(req: Request, res: Response) {
  const [scheme, hubToken] = req.get('authorization')?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !hubToken) return res.status(401).json({ message: 'Não autenticado.' });

  let hubUser;
  try {
    hubUser = await verifyHubToken(hubToken);
  } catch (error) {
    console.warn('[auth/sondohub] token do hub recusado:', error); // iss, aud, alg: cada um tem uma correção
    return res.status(401).json({ message: 'Token do SondoHub inválido.' });
  }

  const user = await usersRepository.upsertFromHub(hubUser);
  if (user.status !== 1 || user.status_ativo !== 1) return res.status(403).json({ message: 'Usuário inativo.' });

  // mesmo payload e validade do login próprio: o resto da API não percebe a diferença
  const { senha: _senha, ...safeUser } = user;
  const token = jwt.sign({ id: user.id, usuario: user.usuario, adm: user.adm, telas: user.telas }, JWT_SECRET, { expiresIn: '1d' });
  return res.json({ ...safeUser, token });
}
```

Registre **antes** do middleware de autenticação (quem chega aqui ainda não tem a sessão do app):

```ts
router.post('/auth/login', authController.login);
router.post('/auth/sondohub', authController.loginSondoHub);
```

---

## 6. Passo 3 — Cadastro pelo hub (chave de API)

### 6.1 A chave

1. Um **Master** cria a chave no painel do hub → **Desenvolvedor**: nome `<slug>-sync`, **Nunca expira**. O segredo `sk_sondo_...` aparece uma vez.
2. Cole o **mesmo** segredo nos dois `.env` e reinicie as duas APIs:

| Onde | Variáveis |
|---|---|
| `.env` do hub | `EXPERIENCE_API_URL=http://localhost:3000/api` e `EXPERIENCE_API_KEY=sk_sondo_...` |
| `.env` da API do app | `SONDOHUB_API_KEY=sk_sondo_...` |

> ⚠️ **Excluir a chave no painel não a revoga.** O hub guarda só o hash e envia o segredo do `.env`. Para trocar: nova chave nos dois `.env`, reiniciar os dois, depois excluir a antiga. Uma chave por ambiente.

### 6.2 API do app: o guard

```ts
export function sondohubApiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SONDOHUB_API_KEY;
  // sem chave configurada, recusa tudo (sem isso, header vazio == chave vazia passaria)
  if (!expected) return res.status(401).json({ message: 'Não autenticado.' });

  // SHA-256 dos dois lados: mesmo tamanho para o timingSafeEqual e tempo constante
  const hash = (value: string) => crypto.createHash('sha256').update(value).digest();
  if (!crypto.timingSafeEqual(hash(req.get('x-api-key') ?? ''), hash(expected))) {
    return res.status(401).json({ message: 'Não autenticado.' });
  }
  return next();
}
```

### 6.3 API do app: as rotas

```ts
/* SondoHub → app (servidor a servidor): protegidas pela chave de API, não pelo JWT */
router.put('/sondohub/users/:id', sondohubApiKeyMiddleware, sondohubUsersController.upsert);
router.delete('/sondohub/users/:id', sondohubApiKeyMiddleware, sondohubUsersController.deactivate);
```

| Rota | Corpo | Faz | Responde |
|---|---|---|---|
| `PUT /api/sondohub/users/:hubId` | `{ name, email, adm }` | `findHubMatch`; achou → atualiza nome, e-mail, papel e reativa; senão cria | 204; 400 se faltar campo ou o id não for UUID |
| `DELETE /api/sondohub/users/:hubId` | — | só inativa (`status_ativo = 0`); repetir não dá erro | 204 |

Valide o `:id` como UUID antes de ir ao banco (senão vira 500 do Postgres).

### 6.4 Hub: o client do app

`sondohub/apps/api/src/modules/experience/` (cópia do `GemeoClient`):

| Arquivo | O quê |
|---|---|
| `experience-client.ts` | `EXPERIENCE_SLUG`, mapa nível → papel, `upsertUser(id, { name, email }, level)` e `deactivateUser(id)`. Timeout de 5 s |
| `experience.module.ts` | exporta o client |
| `experience-client.spec.ts` | URL/header/corpo do PUT; nível inválido não chama o app; app recusou = 502; inativar nunca lança |

No `env.ts` do hub: `EXPERIENCE_API_URL: z.url()` e `EXPERIENCE_API_KEY: z.string().min(1)` (obrigatórias: sem elas a API do hub não sobe).

### 6.5 Hub: onde chamar (`admin-users.service.ts`)

| Ação no painel | Chamada | Ordem |
|---|---|---|
| criar usuário com o app | `upsertUser` | **app antes** do banco do hub |
| trocar o nível | `upsertUser` | **app antes** |
| tirar o acesso | `deactivateUser` | **banco antes**, app depois, sem lançar |
| excluir o usuário | `deactivateUser` | **banco antes** |

Liberar: se o app falhar, o Master vê 502 e nada é salvo. Tirar: revogar nunca depende do app estar no ar.

### 6.6 Nome e foto

O app guarda o `hub_user_id` e uma **cópia** de nome, e-mail e foto, renovada a cada login pelo hub (o token traz `name`, `email`, `picture`). Edição de perfil não é empurrada; só permissão (entrar, sair, papel) vai na hora.

---

## 7. Passo 4 — Front do app

### 7.1 Instalar e configurar

```powershell
pnpm add "@sondohub/client@link:../../sondohub/packages/client"   # dev; em produção, a versão publicada
```

`.env` (e `.env.example` versionado):

```
VITE_API_URL=http://localhost:3000/api
VITE_HUB_URL=http://localhost:5180
```

`vite.config.ts`:

```ts
  resolve: {
    // o client vem por link: e traria o React da pasta do sondohub; dois Reacts quebram os hooks
    dedupe: ['react', 'react-dom'],
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // porta fixa: ela é a origem cadastrada no hub; sem strictPort o Vite troca de porta em silêncio
  server: { port: 5183, strictPort: true },
```

Adicione a origem nova ao CORS da API do app (`FRONTEND_URL=http://localhost:5183,...`).

### 7.2 O cliente do hub (`src/lib/sondo.ts`)

```ts
import { createSondoAuth } from "@sondohub/client"

export const sondo = createSondoAuth({ hubUrl: import.meta.env.VITE_HUB_URL })

// Sem VITE_HUB_URL no build não há hub para onde ir: o botão "Entrar com SondoHub" some.
export const hubEnabled = Boolean(import.meta.env.VITE_HUB_URL)
```

### 7.3 Sessão

**Tipo do usuário:** `metodo?: "sondohub" // undefined = login próprio`.

**`AuthContext`:**

```ts
/* Sem sessão no hub, o getSession redireciona para o login do hub e não volta aqui. */
async function loginWithSondoHub(): Promise<void> {
  const { accessToken } = await sondo.getSession()
  // corpo {} e não null: o httpClient manda JSON, e o express.json recusa "null" com 400
  const { data } = await httpClient.post<AuthUser>("/auth/sondohub", {}, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  login({ ...data, metodo: "sondohub" }, true) // true: sobrevive ao F5
}

function logout() {
  const viaHub = user?.metodo === "sondohub"
  clearStoredUser()
  setUser(null)
  if (viaHub) void sondo.logout() // logout único: encerra o hub junto
}
```

**`httpClient` — duas regras:**

```ts
// request: não sobrescrever um Authorization explícito (o /auth/sondohub manda o token do hub)
if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`

// response: 401 nas rotas /auth/ é credencial recusada (a tela trata);
// nas outras, quem entrou pelo hub renova em /login/sondohub, quem entrou com senha vai para /login
const isLoginRequest = error.config?.url?.includes("/auth/")
if (error.response?.status === 401 && !isLoginRequest) {
  const viaHub = entrouPeloHub()
  clearStoredUser()
  window.location.href = viaHub ? "/login/sondohub" : "/login"
}
```

### 7.4 Página `/login/sondohub`

```tsx
export default function SondoHubLoginPage() {
  const { loginWithSondoHub } = useAuth()
  const navigate = useNavigate()
  const [erro, setErro] = useState<string | null>(null)
  const iniciou = useRef(false)

  useEffect(() => {
    if (iniciou.current) return // trava: o login() recria a função e o efeito rodaria de novo
    iniciou.current = true
    loginWithSondoHub().then(
      () => navigate("/dashboard", { replace: true }),
      (e) => setErro(e instanceof NoAccessError
        ? "Você não tem acesso a este app. Peça a liberação no SondoHub."
        : (axios.isAxiosError(e) && e.response?.data?.message) || "Não foi possível entrar pelo SondoHub."),
    )
  }, [loginWithSondoHub, navigate])

  if (!erro) return <p>Entrando pelo SondoHub…</p>
  return <div><p>{erro}</p><Link to="/login">Voltar ao login</Link></div>
}
```

Rota **pública**, fora da rota protegida:

```tsx
<Route path="/login" element={<LoginPage />} />
<Route path="/login/sondohub" element={<SondoHubLoginPage />} />
```

### 7.5 Botão e ▦

```tsx
{/* type="button": sem ele, o clique enviaria o formulário de senha */}
{hubEnabled && (
  <Button type="button" variant="outline" onClick={() => navigate("/login/sondohub")}>
    Entrar com SondoHub
  </Button>
)}
```

```tsx
{/* só para quem entrou pelo hub: sem sessão no hub, o provider redireciona para o login dele */}
{user?.metodo === "sondohub" && (
  <SondoAuthProvider auth={sondo}>
    <AppLauncher />
  </SondoAuthProvider>
)}
```

---

## 8. Checklist de testes (dev)

| # | Teste | Esperado |
|---|---|---|
| 1 | `POST hub /api/sso/token` com `Origin` do app, sem cookie | 401 + `Access-Control-Allow-Origin` do app |
| 2 | `POST /api/auth/sondohub` sem header / token de outro app / adulterado | 401 (log: `aud`, `signature`) |
| 3 | `PUT /api/sondohub/users/:id` sem chave / chave errada / corpo inválido | 401 / 401 / 400 |
| 4 | Painel do hub: liberar o app para quem não existe no app | linha nova, papel do nível escolhido |
| 5 | Trocar o nível / tirar o acesso | papel trocado / inativo; login com senha dá 403 |
| 6 | App fora do ar e o Master libera | 502 no painel, nada salvo no hub |
| 7 | `/login` → **Entrar com SondoHub** → login no hub | volta sozinho e entra |
| 8 | No hub, clicar no app no ▦ | entra direto, sem tela de login |
| 9 | F5 / Sair | continua logado / cai no login do hub |
| 10 | Login próprio (senha) | igual a antes, sem ▦ |

---

## 9. Produção

1. Variáveis **antes** do código novo (as APIs não sobem sem elas):
   - API do app: `HUB_URL=https://hub.sondotecnica.com`, `SONDOHUB_API_KEY` (chave de produção).
   - Hub (`deploy/.env`): `<APP>_API_URL=https://<api-app>.sondotecnica.com/api`, `<APP>_API_KEY`.
   - Front: `VITE_HUB_URL=https://hub.sondotecnica.com`, `VITE_API_URL` real.
2. Trocar os `link:` pela versão publicada dos pacotes; CI com o token de leitura do GitHub Packages.
3. Migration da coluna `hub_user_id` no banco de produção do app.
4. Deploy da API do app → conferir o login com senha.
5. Deploy do hub (a migration do catálogo roda) → Catálogo: URL e ícone reais → ativar → reiniciar a API do hub.
6. Deploy do front → repetir o checklist da seção 8.

**Voltar atrás:** subir o front anterior. O botão some e o login com senha segue igual.

---

## 10. Erros que já aconteceram (e a correção)

| Sintoma (log da API do app) | Causa | Correção |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` ao salvar usuário | `PG_HOST` apontando para um Postgres local que não existe | `.env` com o servidor certo (Azure) |
| `database "app_experience" does not exist` | `PG_DATABASE` com o nome do **schema** | `PG_DATABASE` = nome do banco (`sondotecnica`) |
| Clique no ▦ cai na tela de login do app | front sem a rota `/login/sondohub` (o `*` manda para o dashboard, que manda para o login) | seção 7 inteira |
| Front chama `http://localhost:9999/api` | front sem `.env` (`VITE_API_URL` vazio) | criar o `.env` do front |
| 400 `"null" is not valid JSON` | `httpClient.post(url, null)` com `Content-Type: application/json` | corpo `{}` |
| 401 `unexpected "iss" claim value` | `HUB_URL` do app diferente do `HUB_URL` do hub (ex.: 3100 × 5180) | copiar o valor do hub; reiniciar a API |
| 401 `JOSEAlgNotAllowed` | interceptor de request trocou o token do hub (RS256) pelo JWT salvo do app (HS256) | não sobrescrever `Authorization` explícito |
| 401 `unexpected "aud" claim value` | app cadastrado com outro slug, ou token de outro app | slug = `audience` do verificador |
| 502 "O app não respondeu" no painel | API do app parada, URL errada ou chave diferente nos dois `.env` | seção 6.1 |
| `duplicate key ... origin` na migration do catálogo | porta de dev já usada por outro app | porta própria + `strictPort` |
| API do hub não sobe (erro do zod) | falta `<APP>_API_URL` / `<APP>_API_KEY` no `.env` do hub | seção 6.1 |
| Mudou o `.env` e nada mudou | `nodemon`/Vite só releem o `.env` ao reiniciar (o nodemon do Experience só observa `src`) | reiniciar a API |

---

## 11. Variáveis de ambiente (resumo)

| Onde | Variável | Dev | Produção |
|---|---|---|---|
| API do app | `HUB_URL` | `http://localhost:5180` | `https://hub.sondotecnica.com` |
| API do app | `SONDOHUB_API_KEY` | chave de dev | chave de produção |
| API do app | `FRONTEND_URL` | `http://localhost:5183` | URL do front |
| Front do app | `VITE_API_URL` | `http://localhost:3000/api` | URL da API |
| Front do app | `VITE_HUB_URL` | `http://localhost:5180` | `https://hub.sondotecnica.com` |
| Hub | `<APP>_API_URL` | `http://localhost:3000/api` | URL da API do app |
| Hub | `<APP>_API_KEY` | mesma chave do app | mesma chave do app |

---

## 12. Arquivos da integração do Experience (referência)

| Repositório | Arquivo | Novo? |
|---|---|---|
| sondohub | `apps/api/prisma/migrations/20261123130000_experience_app/migration.sql` | novo |
| sondohub | `apps/api/src/modules/experience/{experience-client,experience.module,experience-client.spec}.ts` | novo |
| sondohub | `apps/api/src/modules/users/{admin-users.service,users.module}.ts`, `apps/api/src/config/env.ts` | alterado |
| api-admin-experience | `database/009_usuarios_hub.sql` | novo |
| api-admin-experience | `src/middlewares/sondohubApiKeyMiddleware.ts`, `src/controllers/sondohubUsersController.ts` | novo |
| api-admin-experience | `src/controllers/authController.ts`, `src/repositories/usersRepository.ts`, `src/routes/index.ts`, `tsconfig.json`, `.npmrc` | alterado |
| admin-experience | `src/lib/sondo.ts`, `src/pages/login/sondohub.tsx`, `.npmrc`, `.env.example` | novo |
| admin-experience | `src/app/contexts/AuthContext.tsx`, `src/services/api/httpClient.ts`, `src/services/authStorage.ts`, `src/app/types/user.ts`, `src/app/routes/index.tsx`, `src/pages/login/index.tsx`, `src/components/Main/site-header.tsx`, `vite.config.ts` | alterado |

⬅️ Voltar para o [índice](README.md) · Detalhes e decisões do Experience: [doc 18](18-integracao-experience.md)
