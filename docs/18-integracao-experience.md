# 18 — Integrando um app da Sondotecnica: o Experience

> **Status (2026-11-23):** Partes 2 e 5 aplicadas em **dev** e testadas até o banco (o Postgres de dev do Experience estava fora do ar: a migration `009` e os testes que gravam ainda não rodaram). Partes 1, 3 e 4: plano. Os checkpoints dizem como provar cada parte.
>
> **Três regras deste plano:**
> 1. **O login atual do Experience não quebra.** Usuário e senha continuam funcionando exatamente como hoje, para todo mundo (veja "O login atual não muda", logo abaixo do Conceito 1).
> 2. **Mesmo domínio:** hub e Experience ficam em `*.sondotecnica.com`, então o cookie do hub vale para o Experience.
> 3. **Primeiro desenvolvimento, depois produção.** Tudo é feito e conferido em dev, com os bancos de dev (tabela "Ambientes"). A produção só entra na Parte 4.
>
> 🎯 **Objetivo:** o Experience (`experience/admin-experience` + `experience/api-admin-experience`) entra no SondoHub.
>
> | Hoje | Depois deste plano |
> |---|---|
> | Só login próprio (usuário + senha MD5) | Login próprio **ou** botão **Entrar com SondoHub** |
> | O Experience não aparece no widget ▦ | Aparece no ▦ de todos os apps para quem tem acesso |
> | Quem entra é decidido só no Experience | O **hub** decide quem entra e o `adm` (o hub cadastra e inativa no Experience, Parte 5); as **telas** continuam sendo decididas no Experience, como hoje |
> | `app_experience.usuarios` não conhece o hub | Ganha a coluna `hub_user_id`, que liga a linha local ao usuário do hub |
>
> **O que não muda:** o `POST /api/auth/login`, as ~40 rotas da API, o `authMiddleware`, o `requireTela`, o `requireAdmin`, o `AuthUser` do front e o `httpClient`. Esse é o ponto do desenho escolhido (Conceito 1).

## Ambientes

| | Desenvolvimento (agora) | Produção (Parte 4) |
|---|---|---|
| Hub (front) | `http://localhost:5180` | `https://hub.sondotecnica.com` |
| API do hub | `http://localhost:3100` | atrás do hub, em `/api` |
| Banco do hub | Azure `sondotecnica_homologacao`, schema `sondohub` (o `.env` da raiz do sondohub) | Azure `sondotecnica_sandbox`, schema `sondohub` (o `deploy/.env`) |
| Front do Experience | `http://localhost:5183` | `https://<experience>.sondotecnica.com` |
| API do Experience | `http://localhost:3000` | `https://<api-experience>.sondotecnica.com` |
| Banco do Experience | Postgres local `experience`, schema `app_experience` | o banco de produção do Experience |

Os dois hubs usam bancos diferentes. Por isso o Experience é cadastrado **duas vezes**, uma em cada banco, com o **mesmo slug** (`experience`) e a origem de cada ambiente. O código do Experience não muda de um ambiente para o outro: só o `.env`.

---

## 🧠 Conceito 1: troca de token — o Experience continua emitindo o próprio JWT

O Gêmeo (aulas 07b e 14) manda o token do hub em **toda** chamada, e o back dele valida esse token em cada rota. Para o Experience isso exigiria reescrever a autenticação inteira, porque toda a permissão dele (`adm`, `telas`, `req.auth.id` numérico) mora no JWT próprio.

O caminho mais curto é **trocar o token uma vez**, no login:

```
Experience /login
  │ clique em "Entrar com SondoHub"
  ▼
Experience /login/sondohub ──► POST hub/api/sso/token ──► 401 (ainda sem sessão no hub)
  │ o SDK redireciona
  ▼
hub /login?returnTo=https://<experience>/login/sondohub
  │ login NO HUB (a senha nunca passa pelo Experience)
  ▼
Experience /login/sondohub ──► POST hub/api/sso/token ──► 200 { accessToken (10 min, aud=experience), user }
  │
  ├──► POST experience-api/api/auth/sondohub   Authorization: Bearer <token do hub>
  │       o back valida a assinatura (JWKS do hub), acha ou cria o usuário local
  │       e responde IGUAL ao /api/auth/login: { ...usuario, token (JWT do Experience) }
  ▼
Experience /dashboard  (daqui para frente, tudo exatamente como no login próprio)
```

| | Token do hub em toda chamada (Gêmeo) | Troca de token (Experience) |
|---|---|---|
| Arquivos alterados no back | middleware novo + todas as rotas de pessoas | 1 rota nova, 1 função no repositório |
| `adm`/`telas`/`req.auth.id` | precisam ser reconstruídos a partir do token do hub | continuam vindo do JWT do Experience |
| Revogar acesso no hub | vale em até 10 min | vale em até **1 dia** (o `expiresIn` do JWT do Experience) |
| Front | interceptor pede token ao SDK em cada chamada | só a página `/login/sondohub` fala com o SDK |

**A troca é consciente:** o preço é a revogação mais lenta. Se 1 dia for demais, basta reduzir o `expiresIn` do JWT do Experience (ex.: `8h`). Quem entrou pelo hub renova sem perceber (Parte 3, Passo 3.4), então o prazo curto não incomoda ninguém.

**Por que o token do hub é seguro de receber assim:** o back confere assinatura (RS256, chave pública do hub), emissor (`iss` = `HUB_URL`) e **audiência** (`aud` = `experience`). Um token emitido para o Gêmeo leva 401 aqui. E o hub só emite o token de `experience` para quem tem acesso a ele.

### O login atual não muda

Tudo o que este plano acrescenta fica **ao lado** do login próprio, nunca dentro dele:

| Peça do login atual | O que acontece com ela |
|---|---|
| `authController.login` e `usersRepository.findByUsuario` | **Não são editados.** A rota nova tem a própria função |
| Resposta do `POST /api/auth/login` | Igual, byte a byte (a coluna nova não entra no `SELECT` do login) |
| `authMiddleware`, `requireTela`, `requireAdmin` | Não são editados. O JWT da rota nova tem o mesmo formato do JWT do login |
| `telas` de quem já existe | **O hub nunca escreve nelas** (Conceito 3) |
| `adm` de quem já existe | O login pelo hub nunca escreve nele. Só o **Master liberando o acesso ou trocando o nível** escreve (Parte 5). ⚠️ Ao liberar um admin que já existe, escolha o nível `1 — Administrador`, ou ele vira comum nos dois logins |
| Senha de quem já existe | Não é tocada. Quem é ligado ao hub pelo e-mail continua entrando com a senha também |
| Tabela `usuarios` | Só ganha uma coluna que aceita `NULL`. Quem não usa o hub fica com `NULL` |
| Front: tela de login, `AuthContext`, `httpClient` | Só ganham ramos novos, e todos dependem de `metodo === "sondohub"`, que o login próprio nunca grava |

O checkpoint 9 da Parte 2 e o 12 da Parte 3 provam isso.

---

## 🧠 Conceito 2: o schema — uma coluna, não uma tabela nova

```sql
ALTER TABLE app_experience.usuarios ADD COLUMN IF NOT EXISTS hub_user_id UUID UNIQUE;
```

É a função `resolveLocalUser` que a [arquitetura](01-arquitetura.md) previu para a Fase 4, em três tentativas:

1. procura a linha local pelo `hub_user_id` (o `sub` do token);
2. se não achar, procura pelo **e-mail** (quem já tinha conta no Experience) e grava o `hub_user_id` nela;
3. se ainda não achar, **cria** a linha.

**Por que não uma tabela `usuarios_sondohub`, como o Gêmeo fez:**

| Alternativa | Por que não |
|---|---|
| Tabela separada `usuarios_sondohub (id uuid, role)` | O Experience já tem `usuarios` com `adm`, `telas` e uma FK (`apresentacao_exibicao.usuario_id BIGINT`). Uma segunda tabela de pessoas obrigaria o `authMiddleware`, o `requireTela` e essa FK a saberem de duas tabelas. O hub também empurra usuários para o Experience (Parte 5), mas eles caem na mesma `usuarios`, ligados pelo `hub_user_id`. |
| Trocar o `id` local pelo UUID do hub | Quebraria a FK e todo `req.auth.id` numérico. |
| Só o e-mail, sem coluna nova | O e-mail muda (o hub permite trocar). O `sub` não muda nunca. |

**Por que `UNIQUE`:** garante que um usuário do hub nunca vire duas linhas locais. O `NULL` é permitido várias vezes, então quem só usa o login próprio não é afetado.

**Quem nasce pelo hub não tem senha local.** A coluna `senha` recebe `''`, e o MD5 de qualquer senha tem 32 caracteres, então ninguém entra por senha nessa conta. A porta dessa pessoa é o hub.

---

## 🧠 Conceito 3: o hub decide quem entra e o `adm`; o Experience decide as telas

O hub fala em **número** (o nível do app); o Experience fala em `adm` (1 = admin, 2 = comum) e `telas` (lista de telas liberadas). O nível do app `experience` no hub **é o próprio `adm`**:

| Nível no hub | `adm` no Experience | Telas |
|---|---|---|
| `1 — Administrador` | 1 | todas (o admin passa direto no `requireTela`) |
| `2 — Usuário` | 2 | as que um admin do Experience liberar na tela Usuários |

| Quem decide | O quê | Como chega no Experience |
|---|---|---|
| Hub (Master) | Se a pessoa entra e se é admin | `PUT`/`DELETE` com a chave de API, na hora em que o Master salva (Parte 5) |
| Experience (admin) | Quais telas um comum vê | tela Usuários, como hoje |

- ⚠️ **Aqui o número não cresce com a permissão**, ao contrário da convenção do hub (no Gêmeo, 1 `USER` < 2 `ADMIN`). Foi escolhido assim para o nível ser igual ao `adm` e ninguém precisar traduzir de cabeça. A tradução mora num lugar só: `ADM_BY_LEVEL` em `apps/api/src/modules/experience/experience-client.ts`.
- **O login pelo hub não mexe no `adm`.** Só o `PUT` do Master mexe. Se o login traduzisse o nível a cada entrada, um admin que já existe e entrasse com um nível errado seria rebaixado sem ninguém ver.
- **Quem nasce pelo hub como `2 — Usuário` chega sem telas** (`telas = '{}'`) e cai em `/configuracoes` (o `telaInicial` já faz isso). Um admin do Experience libera as telas na tela Usuários. Liberar tela é uma decisão explícita, de propósito.
- **Quem já existe e é achado pelo e-mail** fica com as telas que já tinha; o `adm` passa a ser o do nível escolhido no hub.

> ⚠️ **Ligar pelo e-mail é confiar no e-mail do hub.** Quem tem no hub o e-mail de uma conta do Experience assume essa conta na primeira entrada, inclusive se ela for admin. É seguro porque no hub só o Master cria usuários e define o e-mail (aula 11). Se o hub um dia permitir cadastro livre, essa regra precisa de confirmação de e-mail antes.

---

## 🧠 Conceito 4: onde entra a chave de API (`sk_sondo_...`)

**Resposta curta: no login, em lugar nenhum.** Pessoas entram com o token do hub (JWT). Chave de API é credencial de **máquina**: serve quando um servidor fala com outro sem ninguém logado.

| Quem chama | Quem responde | Credencial |
|---|---|---|
| Navegador (pessoa) | hub `/api/sso/token` | cookie de sessão do hub |
| Front do Experience | back do Experience `/api/auth/sondohub` | token do hub (uma vez) |
| Front do Experience | back do Experience (demais rotas) | JWT do Experience, como hoje |
| **API do hub** | back do Experience `/api/sondohub/users/:id` | **chave de API** em `X-Api-Key` (Parte 5) |
| Back do Experience | hub (ex.: buscar perfis) | chave de API — só se esse caso existir (Parte 6) |

**Como a chave funciona hoje no hub** (`apps/api/src/modules/api-keys/`):

- Qualquer usuário cria as próprias chaves na tela **Desenvolvedor** (`POST /api/me/api-keys`).
- O segredo é `sk_sondo_` + 43 caracteres, aparece **uma vez** e o banco guarda só o SHA-256 (`api_keys.key_hash`), o mesmo esquema das sessões.
- Validade de 7, 30, 90 ou 365 dias; **"Nunca expira" só para MASTER** (a API recusa com 403).
- Remover = revogar (`revoked_at`), e a chave para de valer na hora.
- ⚠️ **Nenhuma rota do hub aceita a chave ainda.** O plano de 2026-11-23 deixou o guard de fora de propósito ("integração futura"). O Gêmeo fala com o hub por outra chave, fixa no `.env` (`GDS_APY_KEY`).

**Conclusão para o Experience:** o login (Partes 1 a 4) não usa chave. A chave entra na **Parte 5**, no sentido hub → Experience: o hub cadastra, troca o nível e inativa a pessoa no Experience. Como o hub guarda só o hash da chave, o segredo é colado nos **dois** `.env`, e excluir a chave na tela Desenvolvedor **não** a revoga (Parte 5, "A chave"). A Parte 6 descreve o guard que falta para o sentido contrário.

---

## 🧠 Conceito 5: os pacotes

| Pacote | Onde instala | O que o Experience usa |
|---|---|---|
| `@sondohub/client` | `admin-experience` | `createSondoAuth` (pede o token ao hub), `NoAccessError`, `SondoAuthProvider` + `AppLauncher` (o ▦) |
| `@sondohub/server` | `api-admin-experience` | `createTokenVerifier` (valida o token do hub com o JWKS em cache) |
| `@sondohub/contracts` | não instala | vem junto com o client; o back não precisa dele |

- Os pacotes vêm do **GitHub Packages** (aula 14). Cada repositório precisa do `.npmrc` com `@sondohub:registry=https://npm.pkg.github.com` **commitado** (protege contra *dependency confusion*), e cada máquina precisa do token *classic* com `read:packages` via `pnpm config set` (aula 14, Passo 1.2). Nunca ponha o token no `.npmrc` do projeto.
- ⚠️ Os `package.json` de `packages/*` no monorepo ainda têm `"private": true`. Antes de começar, confirme em `github.com/orgs/sondohub/packages` que a `0.1.0` está publicada (aula 14, Passos 1.3 e 1.4).
- **O back do Experience é CommonJS** (`"module": "commonjs"`, sem `"type": "module"`), e o `@sondohub/server` é **ESM** (o `jose` 6 também). O Node 24 carrega ESM com `require()` sem flag, e o TypeScript ≥ 5.8 aceita esse import com `"module": "nodenext"`. Por isso o Passo 2.2 troca uma linha do `tsconfig.json`.

---

## Parte 1 — Hub: cadastrar o Experience

### 🛠️ Passo 1.1 — Catálogo

O cadastro vem pela migration `apps/api/prisma/migrations/20261123130000_experience_app/migration.sql`. Ela roda no `pnpm prisma migrate deploy` (dev) e no deploy do hub (produção), e grava o Experience **inativo**, com o endereço de dev, nos dois bancos:

- **Por que inativo:** um app inativo não aparece no ▦, não recebe token e não entra no CORS. Se a migration gravasse um app ativo, a produção aceitaria chamadas de `http://localhost:5183` com cookie até alguém trocar a URL.
- **`ON CONFLICT (slug) DO NOTHING`:** se o Experience já tiver sido cadastrado pelo Catálogo, a migration não mexe nele.
- **Depois de rodar, no dev** (`http://localhost:5180`, banco `sondotecnica_homologacao`): admin → **Catálogo** → Experience → **ativar**.
- **Depois do deploy, na produção (Parte 4):** Catálogo → Experience → trocar a URL pela real → salvar → **ativar**. A origem e o resto vêm da URL ao salvar; o ícone, não: troque também o ícone para `https://<experience>.sondotecnica.com/logo-experience.svg`.
- **Por que a porta 5183:** o Gêmeo já usa `http://localhost:5173` no hub de dev, e a `origin` é `UNIQUE` (é a identidade do app no SSO). O `vite.config.ts` do Experience fixa a porta com `strictPort: true`, e o `FRONTEND_URL` do `.env` da API do Experience ganhou `http://localhost:5183` (o CORS dela).

| Campo | Dev (agora) | Produção (Parte 4) |
|---|---|---|
| Slug | `experience` | `experience` |
| Nome | `Experience` | `Experience` |
| URL | `http://localhost:5183/login/sondohub` | `https://<experience>.sondotecnica.com/login/sondohub` |
| Níveis | `1 — Administrador`, `2 — Usuário` | igual |
| Ícone | `http://localhost:5183/logo-experience.svg` | `https://<experience>.sondotecnica.com/logo-experience.svg` |
| Ativo | não, pela migration; ativar no Catálogo | não, pela migration; trocar URL e ícone, depois ativar |

- **Por que a URL termina em `/login/sondohub`:** é para onde o ▦ leva. Clicando no Experience pelo hub, a pessoa cai direto na página que troca o token e entra, sem passar pela tela de login. A **origem** (protocolo + host + porta) é calculada pela API a partir da URL (aula 12) e é a identidade do app no SSO: um `http://` no lugar de `https://` leva 403.
- **Os níveis** substituem o padrão `Leitura / Edição / Admin` do formulário. O número é o `adm` do Experience (Conceito 3): edite os dois primeiros e remova o terceiro. Um 3º nível faz o hub recusar o acesso com 400 ("Esse nível não existe no Experience.").

### 🛠️ Passo 1.2 — Acesso

**Usuários** → a pessoa → card do Experience → ligar, escolhendo o nível. Ao salvar, o hub já cria (ou liga pelo e-mail) a pessoa no Experience (Parte 5). Sem acesso, o hub responde 403 no `/api/sso/token` e o `safeReturnTo` não devolve a pessoa para o Experience.

Para os primeiros testes, dê acesso a duas pessoas: uma cujo e-mail **já existe** no banco de dev do Experience (testa a ligação pelo e-mail) e uma que **não existe** lá (testa a criação).

### 🛠️ Passo 1.3 — Reiniciar a API do hub

O CORS do hub é lido quando a API sobe (aula 15, Passo 3). Sem reiniciar, o front do Experience vê "Não foi possível falar com o SondoHub".

- **Dev:** pare e suba de novo o `pnpm dev` do sondohub.
- **Produção (Parte 4):** `cd /opt/sondohub && docker compose restart api` na VM.

---

## Parte 2 — Back do Experience (`api-admin-experience`)

### 🛠️ Passo 2.1 — Instalar o `@sondohub/server`

Crie o `.npmrc` na raiz (vai para o git):

```
@sondohub:registry=https://npm.pkg.github.com
```

```powershell
pnpm add @sondohub/server
```

> **Em dev, sem token do GitHub Packages na máquina** (`No authorization header was set`), use o `link:` para o monorepo local, com o `dist` compilado (`pnpm --filter "@sondohub/*" build`), como na aula 07:
>
> ```powershell
> pnpm add link:../../sondohub/packages/server
> ```
>
> O pnpm grava o caminho com `\`; troque para `/` no `package.json` (`"link:../../sondohub/packages/server"`). **Antes de produção**, troque pelo `pnpm add @sondohub/server` (aula 14): o `link:` só existe nesta máquina.

> O repositório tem `package-lock.json`, `pnpm-lock.yaml` e `yarn.lock` ao mesmo tempo. Use o gerenciador que o deploy usa e apague os outros dois lockfiles num commit separado; três locks divergem com o tempo.

### 🛠️ Passo 2.2 — `tsconfig.json`

```json
    "module": "nodenext",
```

No lugar de `"module": "commonjs"`. Os arquivos continuam CommonJS (o `package.json` não tem `"type": "module"`), então os imports relativos sem extensão continuam valendo. O que muda é que o TypeScript passa a ler o campo `exports` do pacote e aceita importar um pacote ESM.

**Confira logo depois:** `npx tsc --noEmit` sem erros e `npm run dev` subindo. Se o TypeScript instalado for anterior ao 5.8, ele recusa o import com `TS1479`; atualize o TypeScript.

### 🛠️ Passo 2.3 — Variáveis (`.env` e `.env.example`)

```
# SONDOHUB (igual, caractere por caractere, ao HUB_URL do hub: é o "iss" do token)
HUB_URL=http://localhost:5180
```

- Em produção: `HUB_URL=https://hub.sondotecnica.com`, sem barra no fim.
- No `.env.example`, só o nome: `HUB_URL=`.
- O slug (`experience`) não é variável: é o mesmo nos dois hubs (tabela "Ambientes").
- Sem `HUB_URL`, a API **cai no boot** com `Invalid URL`. É de propósito: melhor não subir do que subir com o login pelo hub quebrado. Por isso a variável entra no `.env` **antes** do código novo, em dev e em produção.

### 🛠️ Passo 2.4 — Migration (`database/009_usuarios_hub.sql`, novo)

```sql
-- ============================================================
--  Liga o usuário local ao usuário do SondoHub (o "sub" do token).
--  NULL = só usa o login próprio. UNIQUE = um usuário do hub nunca vira duas linhas.
-- ============================================================

ALTER TABLE app_experience.usuarios
  ADD COLUMN IF NOT EXISTS hub_user_id UUID UNIQUE;
```

Rode **primeiro no banco de dev** (`experience` local), como as migrations `002` a `008` foram rodadas. No banco de produção, só na Parte 4. A coluna aceita `NULL` e nenhum código antigo a lê, então ela pode entrar antes do código novo sem efeito nenhum.

### 🛠️ Passo 2.5 — Achar ou criar o usuário (`src/repositories/usersRepository.ts`)

O `findByUsuario` (o do login atual) **não muda**. Acrescente o campo na interface, como opcional, porque o `SELECT` do login não o traz:

```ts
export interface Usuario {
  // ...campos atuais
  hub_user_id?: string | null; // só preenchido pelo login do hub
}

// Colunas da sessão aberta pelo hub. O findByUsuario continua com a lista dele.
const COLUNAS_HUB = `id, nome, usuario, email, senha, status, status_ativo, adm, telas, imagem_perfil, hub_user_id`;
```

Um helper fora do objeto (a Parte 5 usa o mesmo) e a função nova no objeto:

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

```ts
  /* Login pelo SondoHub: liga o usuário do hub a uma linha local (ver findHubMatch); se não achar, cria.
     Atualiza nome, e-mail e foto (cópia do hub, renovada a cada login). Nunca toca em usuario, senha, adm nem telas. */
  async upsertFromHub(hub: HubUser): Promise<Usuario> {
    const id = await findHubMatch(hub);
    const result = id
      ? await pool.query<Usuario>(
          `UPDATE app_experience.usuarios
              SET hub_user_id = $2, nome = $3, email = $4, imagem_perfil = COALESCE($5, imagem_perfil)
            WHERE id = $1
        RETURNING ${COLUNAS_HUB}`,
          [id, hub.id, hub.name, hub.email, hub.picture ?? null]
        )
      : // senha '' nunca bate com um MD5 (32 caracteres): quem nasce pelo hub só entra pelo hub.
        // adm 2 e telas vazias (default da coluna): um admin do Experience libera depois.
        await pool.query<Usuario>(
          `INSERT INTO app_experience.usuarios (hub_user_id, nome, usuario, email, senha, status, status_ativo, adm, imagem_perfil)
           VALUES ($1, $2, $3, $3, '', 1, 1, 2, $4)
        RETURNING ${COLUNAS_HUB}`,
          [hub.id, hub.name, hub.email, hub.picture ?? null]
        );

    return result.rows[0];
  },
```

- **O tipo do parâmetro é local** (`{ id, name, email }`), e não o `SondoUser` do `@sondohub/contracts`: o back não precisa instalar mais um pacote por causa de um tipo. O `SondoUser` que o verificador devolve encaixa nele.
- **`ORDER BY hub_user_id NULLS LAST`:** se existir a linha já ligada ao hub **e** outra com o mesmo e-mail, a ligada ganha.
- **O `UPDATE` só mexe em `hub_user_id`, `nome`, `email` e `imagem_perfil`.** O `usuario` (o login da senha), a `senha`, o `adm` e as `telas` ficam como estavam. Quem entrava com `usuario` + senha continua entrando igual.
- **Nome, e-mail e foto vêm do hub a cada login:** o hub é a fonte da identidade (Parte 5, "Nome e foto"). Sem foto no hub (`picture` nulo), o `COALESCE` mantém a do Experience. Com foto no hub, a do hub ganha a cada login; uma foto trocada na tela Configurações do Experience vale só até o próximo login pelo hub.
- **Antes de rodar, confira no banco de dev** as colunas obrigatórias de `usuarios` (`\d app_experience.usuarios` no `psql`). A migration que cria a tabela não está na pasta `database/` (ela começa na `002`). Se houver outra coluna `NOT NULL` sem default, ou um `UNIQUE` em `usuario`, o `INSERT` precisa de ajuste.

### 🛠️ Passo 2.6 — A rota da troca (`src/controllers/authController.ts`)

O método `login` **não é editado**. Entram um import, o verificador e um método novo:

```ts
import { createTokenVerifier } from '@sondohub/server';

// audience = slug do app no hub: um token emitido para outro app é recusado.
// Criado no carregamento do módulo: o server.ts importa ./config/env antes de tudo, então o .env já está lido.
const verifyHubToken = createTokenVerifier({ hubUrl: process.env.HUB_URL!, audience: 'experience' });
```

O método novo, no objeto `authController`, depois do `login`:

```ts
  // POST /api/auth/sondohub — troca o token do hub (10 min) pela sessão do Experience
  async loginSondoHub(req: Request, res: Response) {
    const [scheme, hubToken] = req.get('authorization')?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !hubToken) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }

    let hubUser;
    try {
      hubUser = await verifyHubToken(hubToken);
    } catch (error) {
      // o motivo fica só no log: iss/aud errado, assinatura e hub fora do ar têm correções diferentes
      console.warn('[auth/sondohub] token do hub recusado:', error);
      return res.status(401).json({ message: 'Token do SondoHub inválido.' });
    }

    try {
      const user = await usersRepository.upsertFromHub(hubUser);
      // o bloqueio local continua valendo: excluído ou inativo no Experience não entra nem pelo hub
      if (user.status !== 1 || user.status_ativo !== 1) {
        return res.status(403).json({ message: 'Usuário inativo.' });
      }

      // shortcut: mesmo payload e validade do jwt.sign do login; mudou um, mude o outro (ou extraia uma função)
      const { senha: _senha, ...safeUser } = user;
      const token = jwt.sign(
        { id: user.id, usuario: user.usuario, adm: user.adm, telas: user.telas },
        JWT_SECRET,
        { expiresIn: '1d' }
      );
      return res.json({ ...safeUser, token });
    } catch (error) {
      console.error('Erro ao abrir sessão pelo SondoHub:', error);
      return res.status(500).json({ message: 'Erro ao acessar o banco.' });
    }
  },
```

**Por que repetir o `jwt.sign` em vez de extrair uma função:** extrair mexeria no `login`, e a regra 1 pede que ele fique intacto. São cinco linhas, marcadas com o comentário `shortcut`. Quando o login próprio for aposentado, a repetição some junto.

### 🛠️ Passo 2.7 — Registrar a rota (`src/routes/index.ts`)

Junto das rotas públicas, **antes** do `router.use(authMiddleware)`:

```ts
router.post('/auth/login', authController.login);
router.post('/auth/sondohub', authController.loginSondoHub);
```

É pública para o `authMiddleware` porque quem chega aqui ainda não tem o JWT do Experience. A proteção dela é o token do hub.

### ✅ Checkpoint 2 (local, antes do front)

Com o hub local no ar e o `cookies.txt` de um usuário com acesso ao Experience (aula 03), na pasta do sondohub:

```powershell
$r = curl.exe -s -b cookies.txt -X POST http://localhost:3100/api/sso/token -H "Origin: http://localhost:5183" | ConvertFrom-Json
curl.exe -i -X POST http://localhost:3000/api/auth/sondohub -H "Authorization: Bearer $($r.accessToken)"
curl.exe -i -X POST http://localhost:3000/api/auth/sondohub
```

| # | Teste | Esperado |
|---|---|---|
| 1 | Com o token do hub | 200, com `token`, `adm`, `telas` e `hub_user_id`, sem `senha` |
| 2 | Sem header | 401 |
| 3 | Token emitido para o Gêmeo (`Origin` do Gêmeo no 1º curl) | 401, e o log diz `aud` |
| 4 | Token adulterado (troque uma letra no meio) | 401 |
| 5 | Usuário com `status_ativo = 0` no Experience | 403 |
| 6 | Pessoa que **já existia** (mesmo e-mail): `SELECT hub_user_id, adm, telas FROM app_experience.usuarios WHERE email = '<e-mail>'` | O UUID do hub; `adm` e `telas` **iguais** aos de antes (o login não mexe neles) |
| 7 | Pessoa que **não existia** (e que o `PUT` da Parte 5 ainda não criou) | Linha nova com `adm = 2`, `telas = {}` e `senha = ''` |
| 8 | Repetir o teste 1 | Mesma linha (nenhuma linha nova) |
| 9 | `POST /api/auth/login` com usuário e senha, **antes e depois** da Parte 2, com um admin e com um comum, inclusive a pessoa do teste 6 | Mesma resposta (compare os campos), mesmo `adm`, mesmas telas |
| 10 | `POST /api/auth/login` com usuário e senha errados | 401, como hoje |

---

## Parte 3 — Front do Experience (`admin-experience`)

### 🛠️ Passo 3.1 — Instalar e fixar a porta

O mesmo `.npmrc` do back, na raiz, e:

```powershell
pnpm add @sondohub/client
```

No `vite.config.ts`:

```ts
  server: { port: 5183, strictPort: true },
```

A 5173 é a porta padrão do Vite em todo projeto e já é a origem do Gêmeo no hub de dev. Com `strictPort`, o Vite falha em vez de trocar de porta em silêncio (o que mudaria a origem e quebraria o SSO). Atualize também o `FRONTEND_URL` do back para `http://localhost:5183`.

### 🛠️ Passo 3.2 — O endereço do hub

`.env` (dev) e `.env.production`:

```
VITE_HUB_URL=http://localhost:5180
```

Em produção, `https://hub.sondotecnica.com`, sem barra no fim. É um endereço público e pode ir para o git; nunca ponha segredo numa `VITE_*`.

### 🛠️ Passo 3.3 — O cliente do hub (`src/lib/sondo.ts`, novo)

```ts
import { createSondoAuth } from "@sondohub/client"

export const sondo = createSondoAuth({ hubUrl: import.meta.env.VITE_HUB_URL })

// Sem VITE_HUB_URL no build não há hub para onde ir: o botão "Entrar com SondoHub" some.
export const hubEnabled = Boolean(import.meta.env.VITE_HUB_URL)
```

### 🛠️ Passo 3.4 — Sessão: entrar, renovar e sair

**`src/app/types/user.ts`:** um campo novo no `AuthUser`:

```ts
  metodo?: "sondohub" // undefined = login próprio
```

**`src/services/authStorage.ts`:**

```ts
/* A sessão veio do hub? Então o 401 renova por lá e o Sair encerra o hub junto. */
export function entrouPeloHub(): boolean {
  try {
    return JSON.parse(readStoredUser() ?? "null")?.metodo === "sondohub"
  } catch {
    return false
  }
}
```

**`src/app/contexts/AuthContext.tsx`:** `loginWithSondoHub` no contexto (e no `AuthContextType`), e o `logout` passa a encerrar o hub:

```ts
  /* Sem sessão no hub, o getSession redireciona para o login do hub e não volta aqui. */
  async function loginWithSondoHub(): Promise<void> {
    const { accessToken } = await sondo.getSession()
    // corpo {} e não null: o httpClient manda JSON, e o express.json recusa "null" com 400
    const { data } = await httpClient.post<AuthUser>("/auth/sondohub", {}, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    login({ ...data, metodo: "sondohub" }, true)
  }

  function logout() {
    const viaHub = user?.metodo === "sondohub"
    clearStoredUser()
    setUser(null)
    if (viaHub) sondo.logout() // logout único: encerra a sessão do hub e vai para o login dele
  }
```

- **`remember = true`:** a sessão vai para o `localStorage`, para sobreviver ao F5. O que fica lá é o JWT do Experience, como no login próprio com "Lembrar-me". O token do hub fica **só na memória** do SDK.

**`src/services/api/httpClient.ts`:** no interceptor de **request**, o JWT salvo não pode passar por cima de um `Authorization` explícito. Sem isso, quem já tinha uma sessão salva manda o JWT do Experience (HS256) no lugar do token do hub (RS256), e o back responde 401 com `JOSEAlgNotAllowed`:

```ts
      // não sobrescreve um Authorization explícito: o /auth/sondohub manda o token do hub, não o do Experience
      if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`
```

No interceptor de resposta, duas linhas mudam:

```ts
    // 401 nas rotas de login = credencial recusada; deixa a tela tratar.
    const isLoginRequest = error.config?.url?.includes("/auth/")
    if (error.response?.status === 401 && !isLoginRequest) {
      // quem entrou pelo hub renova em silêncio: o hub ainda tem a sessão de 30 dias
      const viaHub = entrouPeloHub()
      clearStoredUser()
      window.location.href = viaHub ? "/login/sondohub" : "/login"
      toast.error("Sessão expirada. Faça login novamente.")
    }
```

O `"/auth/login"` virou `"/auth/"` para cobrir também o `/auth/sondohub`: sem isso, um 401 na troca recarregaria a página em vez de mostrar o erro.

### 🛠️ Passo 3.5 — A página de ida e volta (`src/pages/login/sondohub.tsx`, novo)

```tsx
import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import axios from "axios"
import { NoAccessError } from "@sondohub/client"
import { useAuth } from "@/app/contexts/AuthContext"

/* Também é a URL para onde o hub devolve a pessoa depois do login dele, e a URL do Experience no ▦. */
export default function SondoHubLoginPage() {
  const { loginWithSondoHub } = useAuth()
  const navigate = useNavigate()
  const [erro, setErro] = useState<string | null>(null)
  const iniciou = useRef(false)

  useEffect(() => {
    // o login() troca o contexto e recria a função: sem a trava, a troca rodaria de novo a cada render
    if (iniciou.current) return
    iniciou.current = true
    loginWithSondoHub().then(
      () => navigate("/dashboard", { replace: true }), // replace: o "voltar" não cai aqui de novo
      (e) => setErro(mensagem(e)),
    )
  }, [loginWithSondoHub, navigate])

  if (!erro) return <p className="p-8 text-center">Entrando pelo SondoHub…</p>
  return (
    <div className="p-8 text-center">
      <p>{erro}</p>
      <Link to="/login" className="underline">Voltar ao login</Link>
    </div>
  )
}

function mensagem(e: unknown): string {
  if (e instanceof NoAccessError) return "Você não tem acesso ao Experience. Peça a liberação no SondoHub."
  return (axios.isAxiosError(e) && e.response?.data?.message) || "Não foi possível entrar pelo SondoHub."
}
```

O `/dashboard` não precisa ser a tela certa para todo mundo: o `TelaRoute` já manda quem não pode vê-la para o `telaInicial`.

**`src/app/routes/index.tsx`:** a rota fica **fora** do `PrivateRoute`, ao lado do `/login`:

```tsx
const SondoHubLoginPage = lazy(() => import("@/pages/login/sondohub"))

        <Route element={<PublicLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/sondohub" element={<SondoHubLoginPage />} />
        </Route>
```

> Confira o `PublicLayout`: se ele redireciona quem já está logado, o fluxo continua certo (quem já tem sessão local vai para o dashboard).

### 🛠️ Passo 3.6 — O botão (`src/pages/login/index.tsx`)

Abaixo do botão de entrar, dentro do `<form>`:

```tsx
{hubEnabled && (
  <Button type="button" variant="outline" onClick={() => navigate("/login/sondohub")}>
    Entrar com SondoHub
  </Button>
)}
```

- **`type="button"`:** sem ele, o clique enviaria o formulário de usuário e senha.
- **`navigate`, e não um link direto para o hub:** quem monta a URL do hub com o `returnTo` certo é o SDK.

### 🛠️ Passo 3.7 — O widget ▦ (`src/components/Main/site-header.tsx`)

```tsx
import { AppLauncher, SondoAuthProvider } from "@sondohub/client"
import { sondo } from "@/lib/sondo"

{user?.metodo === "sondohub" && (
  <SondoAuthProvider auth={sondo}>
    <AppLauncher />
  </SondoAuthProvider>
)}
```

- **Só para quem entrou pelo hub:** o `SondoAuthProvider` pede a sessão ao hub e, sem ela, **redireciona para o login do hub**. Em volta do app inteiro, ele expulsaria quem usa o login próprio.
- O CSS do widget vem dentro do componente; não há nada para importar. Ele abre para a direita, por isso fica no começo do cabeçalho (aula 07b).

### ✅ Checkpoint 3 (no navegador, aba anônima)

| # | Faça | Esperado |
|---|---|---|
| 1 | Abrir `http://localhost:5183/login` | Botão **Entrar com SondoHub** |
| 2 | Clicar nele | Vai para `localhost:5180/login?returnTo=...5183/login/sondohub` |
| 3 | Fazer login no hub | Volta sozinho e cai na primeira tela liberada |
| 4 | F5 | Continua logado |
| 5 | Network → qualquer chamada à API do Experience | `Authorization: Bearer` com o JWT **do Experience** (não o do hub) |
| 6 | ▦ no cabeçalho | Lista o Experience e os outros apps da pessoa |
| 7 | No hub, clicar no Experience | Entra direto, sem tela de login |
| 8 | Sair no Experience | Cai no login do hub; abrir o hub pede login |
| 9 | Apagar o JWT no `localStorage` e navegar | Renova sozinho pelo `/login/sondohub` |
| 10 | Usuário sem acesso ao Experience no hub | "Você não tem acesso ao Experience..." |
| 11 | Usuário que nasceu pelo hub | Entra em `/configuracoes`; um admin libera telas na tela Usuários |
| 12 | Login próprio (admin e comum), "Lembrar-me" ligado e desligado, F5, Sair, sessão vencida | Tudo igual a hoje: sem ▦, o Sair volta para `/login` do Experience, o 401 volta para `/login` |

---

## Parte 4 — Produção (só depois de todos os checkpoints de dev)

1. **Domínio (decidido).** O front e a API do Experience ficam em `*.sondotecnica.com`, o mesmo site do `hub.sondotecnica.com`, então o cookie do hub vai no `fetch` do Experience. Sempre `https://`. Em outro domínio (ex.: `.com.br`, `*.azurewebsites.net`), o login entraria em loop (aula 07b, "Domínio").
2. **Ordem do deploy.** Cada passo deixa o login atual funcionando sozinho, então dá para parar em qualquer um:
   1. migration `009` no banco de produção do Experience (a coluna nova não atrapalha o código antigo);
   2. `HUB_URL=https://hub.sondotecnica.com` e `SONDOHUB_API_KEY` (a chave de produção, Parte 5) no `.env` do servidor da API **antes** de subir o código novo (sem `HUB_URL` a API não sobe);
   3. back novo no ar; conferir o login com senha logo em seguida;
   4. ⚠️ `EXPERIENCE_API_URL=https://<api-experience>.sondotecnica.com/api` e `EXPERIENCE_API_KEY` no `deploy/.env` da VM do hub **antes** do próximo deploy do hub: o `env.ts` exige as duas, e sem elas a **API do hub não sobe** (vale para qualquer deploy do hub a partir desta mudança, mesmo um que não seja do Experience);
   5. no hub de produção, a migration `20261123130000_experience_app` já gravou o Experience inativo: no Catálogo, trocar URL e ícone pelos reais, ativar (Parte 1, coluna Produção) e `docker compose restart api` na VM do hub;
   6. front com `VITE_HUB_URL=https://hub.sondotecnica.com` no `.env.production`, build e deploy;
   7. repetir os checkpoints 2, 3 e 5 com os endereços de produção.
3. **Voltar atrás:** se algo der errado depois do passo 6, basta subir o front anterior: o botão some e o login com senha segue como sempre. A coluna `hub_user_id` pode ficar.
4. **CI.** Se o Experience tiver pipeline, o `pnpm install` precisa do token de leitura do GitHub Packages, como no Gêmeo (aula 14, Passo 2.8): secret `SONDOHUB_PACKAGES_TOKEN` + `pnpm config set` no runner, e o `.npmrc` indo junto para o servidor.

---

## Parte 5 — Hub cadastra, troca o nível e inativa no Experience (chave de API)

> **Aplicado em dev em 2026-11-23.** Código e testes sem banco passaram; falta o Checkpoint 5 com o banco de dev do Experience no ar.

Até a Parte 4, a pessoa só aparece no Experience no primeiro login. Com esta parte, ela aparece **quando o Master libera o acesso** no painel do hub, já com o `adm` certo. Um admin do Experience pode liberar as telas antes de a pessoa entrar pela primeira vez.

```
Painel do hub (Master)                          API do Experience (X-Api-Key)
  criar usuário com o Experience ligado  ──►  PUT    /api/sondohub/users/:hubId   { name, email, adm }
  ligar o Experience / trocar o nível    ──►  PUT    (o mesmo: é upsert)
  tirar o acesso / excluir o usuário     ──►  DELETE /api/sondohub/users/:hubId
```

- **`:hubId` é o id do usuário no hub** (UUID, o mesmo `sub` do token). O `PUT` usa a mesma regra de ligação do login (`findHubMatch`): primeiro o `hub_user_id`, depois o e-mail; senão cria.
- **O `PUT` reativa** (`status = 1`, `status_ativo = 1`) e grava `nome`, `email` e `adm`. Não mexe em `telas`, `usuario` nem `senha`.
- **O `DELETE` só inativa** (`status_ativo = 0`). O histórico fica, e a pessoa não entra nem pelo hub nem pela senha própria, se tiver uma. Repetir não dá erro.
- **A ordem é a do Gêmeo** (comentário no topo de `admin-users.service.ts`). Ao **liberar**, o hub chama o Experience **antes** de gravar no próprio banco. Se o Experience não responder, o Master vê 502 ("O Experience não respondeu. Nada foi salvo; tente de novo.") e nada muda. Ao **tirar**, o hub grava primeiro e chama depois, sem lançar: revogar não pode depender do Experience estar no ar.

### 🧠 Nome e foto: como o Experience fica sabendo quando mudam no hub?

**O Experience guarda o `hub_user_id` (o vínculo) e uma cópia de `nome`, `email` e `imagem_perfil`.** A cópia se renova sozinha a cada login pelo hub, porque o token traz `name`, `email` e `picture`, e o `upsertFromHub` grava os três (Passo 2.5). O `PUT` do Master também manda nome e e-mail.

**Nada é empurrado quando alguém só edita o perfil.** Uma cópia desatualizada até o próximo login não abre nem fecha porta nenhuma. Por isso só o que é **permissão** (entrar, sair, `adm`) é empurrado na hora.

| Alternativa | Por que não |
|---|---|
| Guardar só o id e perguntar o nome ao hub em cada tela | Toda tela de pessoas do Experience passaria a depender do hub no ar, e precisaria do guard e da rota da Parte 6. A FK `apresentacao_exibicao.usuario_id` e o `req.auth.id` continuariam precisando da linha local |
| Empurrar a cada edição de perfil | Mais três pontos de chamada no hub (painel, Minha conta, avatar), cada um com a própria falha para tratar, para ganhar alguns minutos de atualização |

> E o e-mail? Se ele mudar no hub, nada quebra: a ligação é pelo `hub_user_id`, que não muda nunca. O e-mail novo chega no próximo login ou no próximo `PUT`.

### 🔑 A chave

1. Um **Master** do hub cria a chave na tela **Desenvolvedor**: nome `experience-sync`, validade **Nunca expira**. O segredo (`sk_sondo_...`) aparece uma vez.
2. Cole o **mesmo** segredo nos dois `.env`:

| Onde | Variável |
|---|---|
| hub (`.env` da raiz em dev; `deploy/.env` em produção) | `EXPERIENCE_API_KEY=sk_sondo_...` e `EXPERIENCE_API_URL=http://localhost:3000/api` (dev) |
| Experience (`api-admin-experience/.env`) | `SONDOHUB_API_KEY=sk_sondo_...` |

3. Reinicie as duas APIs (as duas leem o `.env` só ao subir).

- ⚠️ **Excluir a chave na tela Desenvolvedor não a revoga.** O hub guarda só o hash e manda o segredo que está no `.env`; nada confere a tabela `api_keys` nessa conversa. Para trocar: crie outra chave, cole nos dois `.env`, reinicie os dois, e só então exclua a antiga no painel. A tela serve aqui para gerar uma chave forte e registrar quem a criou e quando.
- **Uma chave por ambiente.** Dev e produção têm hubs e bancos diferentes (tabela "Ambientes").
- **`SONDOHUB_API_KEY` vazia no Experience = recusa tudo** (401). Sem essa regra, header vazio e chave vazia seriam iguais e passariam.
- O dev já vem com `EXPERIENCE_API_KEY=cole-a-chave-do-painel` no hub (só para a API subir) e `SONDOHUB_API_KEY=` vazia no Experience. Até colar a chave de verdade, liberar o Experience no painel dá 502, e nada é salvo.

### 🛠️ Passo 5.1 — Experience: o guard (`src/middlewares/sondohubApiKeyMiddleware.ts`, novo)

```ts
export function sondohubApiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SONDOHUB_API_KEY;
  // sem chave configurada, recusa tudo (sem isso, header vazio == chave vazia passaria)
  if (!expected) {
    return res.status(401).json({ message: 'Não autenticado.' });
  }

  // compara os SHA-256 em tempo constante: com === dá para descobrir a chave medindo a demora da resposta
  const hash = (value: string) => crypto.createHash('sha256').update(value).digest();
  if (!crypto.timingSafeEqual(hash(req.get('x-api-key') ?? ''), hash(expected))) {
    return res.status(401).json({ message: 'Não autenticado.' });
  }

  return next();
}
```

**Por que comparar os hashes e não as chaves:** o `timingSafeEqual` exige dois buffers do mesmo tamanho. O SHA-256 tem sempre 32 bytes, então não é preciso checar o tamanho antes (e esse teste vazaria o tamanho da chave).

### 🛠️ Passo 5.2 — Experience: o repositório (`src/repositories/usersRepository.ts`)

Duas funções novas no objeto, ao lado do `upsertFromHub`, usando o mesmo `findHubMatch`:

- `syncFromHub(hub, adm)`: achou → `UPDATE ... SET hub_user_id, nome, email, adm, status = 1, status_ativo = 1`; não achou → `INSERT` com `senha = ''` e o `adm` recebido.
- `deactivateFromHub(hubUserId)`: `UPDATE ... SET status_ativo = 0 WHERE hub_user_id = $1`.

### 🛠️ Passo 5.3 — Experience: o controller (`src/controllers/sondohubUsersController.ts`, novo)

- `upsert`: valida `:id` (UUID), `name`, `email` e `adm` (1 ou 2). Responde 400 se faltar algo, 204 se gravou e 500 se o banco falhar.
- `deactivate`: valida `:id` e responde 204.
- O id é validado antes de ir ao banco: um id torto viraria erro do Postgres (500) em vez de 400.

### 🛠️ Passo 5.4 — Experience: as rotas (`src/routes/index.ts`)

Antes do `router.use(authMiddleware)`, porque quem chama é a API do hub, que não tem o JWT do Experience:

```ts
router.put('/sondohub/users/:id', sondohubApiKeyMiddleware, sondohubUsersController.upsert);
router.delete('/sondohub/users/:id', sondohubApiKeyMiddleware, sondohubUsersController.deactivate);
```

E no `.env` / `.env.example`: `SONDOHUB_API_KEY=`.

### 🛠️ Passo 5.5 — Hub: o cliente (`apps/api/src/modules/experience/`, novo)

Cópia do `GemeoClient`, com duas diferenças: a URL vem do `.env` (dev e produção são endereços diferentes) e o corpo leva `name`, `email` e `adm`.

| Arquivo | O quê |
|---|---|
| `experience-client.ts` | `EXPERIENCE_SLUG`, `ADM_BY_LEVEL`, `upsertUser(id, { name, email }, level)` (lança 400 para nível sem `adm`, 502 se o Experience falhar) e `deactivateUser(id)` (nunca lança) |
| `experience.module.ts` | Exporta o `ExperienceClient` |
| `experience-client.spec.ts` | URL, header e corpo do `PUT`; nível 3 não chama o Experience; Experience recusou = 502; inativar com o Experience fora do ar não lança |

### 🛠️ Passo 5.6 — Hub: quem chama (`users.module.ts`, `admin-users.service.ts`, `env.ts`)

- `users.module.ts`: importa o `ExperienceModule`.
- `env.ts`: `EXPERIENCE_API_URL: z.url()` e `EXPERIENCE_API_KEY: z.string().min(1)`. São obrigatórias, como a `GDS_APY_KEY`: é melhor a API não subir do que liberar acessos que nunca chegam. O `.env.example` ganhou as duas.
- `admin-users.service.ts`, nos mesmos quatro pontos do Gêmeo:

| Ação no painel | Chamada |
|---|---|
| `create` com o Experience na lista de apps | `upsertUser(id, data, level)` antes do insert |
| `setAppLevel` com slug `experience` | `upsertUser(id, user, level)` antes do `upsertAccess` |
| `removeApp` com slug `experience` | `deactivateUser(id)` depois do `deleteAccess` |
| `remove` de quem tinha acesso | `deactivateUser(id)` depois do delete |

O `hasGemeoAccess` virou `hasAccess(user, slug)`, para servir aos dois apps.

### ✅ Checkpoint 5

Já rodado em 2026-11-23, sem banco (Experience na porta 3911 com uma chave de teste; hub com `vitest`):

| # | Teste | Resultado |
|---|---|---|
| 1 | `PUT` sem `X-Api-Key` / com chave errada | 401 / 401 |
| 2 | `PUT` com `adm: 3` / com id `abc` | 400 / 400 |
| 3 | `PUT` e `DELETE` com a chave certa | Passaram do guard e da validação; 500 porque o banco estava fora |
| 4 | `/api/eventos` sem token, `/api/auth/login` vazio | 401 e 400, como antes |
| 5 | `npx vitest run` em `apps/api` | 39 testes passando, 4 deles do `ExperienceClient` |

Falta, com o banco de dev do Experience no ar e a chave colada nos dois `.env`:

| # | Teste | Esperado |
|---|---|---|
| 6 | Painel do hub: ligar o Experience com nível 2 para quem **não existe** no Experience | Linha nova: `hub_user_id` do hub, `adm = 2`, `telas = {}`, `senha = ''` |
| 7 | Ligar com nível 1 para quem **já existe** (mesmo e-mail) | Mesma linha, com `hub_user_id` e `adm = 1`; `telas`, `usuario` e `senha` iguais |
| 8 | Trocar o nível 1 → 2 | `adm = 2`; a pessoa continua com as telas que tinha |
| 9 | Tirar o acesso | `status_ativo = 0`; `POST /api/auth/login` com a senha dela dá 403 |
| 10 | Experience parado e o Master liga o acesso | 502 no painel; o acesso **não** aparece ligado no hub |
| 11 | Experience parado e o Master tira o acesso | Sai do hub normalmente; o log do hub mostra o `DELETE` que falhou |

---

## Parte 6 — (opcional) A chave de API no sentido contrário: o Experience falando com o hub

> Faça só quando houver um caso real. Exemplo: a tela Usuários do Experience mostrar quem tem acesso no hub **antes** do primeiro login dessa pessoa.

### Como o Experience usaria

1. Um **Master** do hub cria a chave na tela **Desenvolvedor**: nome `experience-backend`, validade **Nunca expira**. O segredo aparece uma vez.
2. O segredo vai para o `.env` do back do Experience numa variável **própria** (ex.: `SONDOHUB_LOOKUP_KEY=sk_sondo_...`; a `SONDOHUB_API_KEY` já é a chave da Parte 5), nunca para o git nem para uma `VITE_*`.
3. O back manda a chave no header `X-Api-Key`, separado do `Authorization`, para uma credencial de máquina nunca se confundir com a de uma pessoa (aula 14, Conceito 3):

```ts
const response = await fetch(`${process.env.HUB_URL}/api/apps/experience/users/lookup`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': process.env.SONDOHUB_API_KEY! },
  body: JSON.stringify({ ids }),
  signal: AbortSignal.timeout(5_000), // hub fora do ar não pode prender a tela
});
```

4. Para revogar: **Desenvolvedor** → excluir a chave. Vale na hora; crie outra e troque o `.env`.

### O que falta no hub

**1. O guard** (`apps/api/src/modules/api-keys/api-key.guard.ts`, novo). É o par do `create`: lá o hub guarda o hash, aqui ele compara.

```ts
import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashToken } from '../sessions/sessions.service.js';

/** Chamadas servidor → servidor. A chave vale com as permissões de quem a criou. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { apiKeyOwner?: { id: string; role: string } }>();
    const secret = req.header('x-api-key');
    if (!secret?.startsWith('sk_sondo_')) throw new UnauthorizedException();

    // busca pelo hash: o banco nunca vê o segredo, e um hash de 256 bits não se adivinha
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashToken(secret) },
      select: { id: true, expiresAt: true, revokedAt: true, user: { select: { id: true, role: true, isActive: true } } },
    });
    const expired = key?.expiresAt != null && key.expiresAt <= new Date();
    if (!key || key.revokedAt || expired || !key.user.isActive) throw new UnauthorizedException();

    await this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    req.apiKeyOwner = { id: key.user.id, role: key.user.role };
    return true;
  }
}
```

- **Usuário desativado derruba as chaves dele** (`isActive`): a chave nunca vale mais do que a pessoa.
- **O `lastUsedAt`** alimenta a coluna "Último uso" que a tela Desenvolvedor já mostra.
- Exporte o guard no `ApiKeysModule` para outros módulos usarem.

**2. A rota.** Generalizar o `POST /api/gemeo/users/lookup` (que usa a chave fixa `GDS_APY_KEY`) para `POST /api/apps/:slug/users/lookup`, com o `ApiKeyGuard`, devolvendo só quem tem acesso a `:slug`, e só se o dono da chave for `MASTER` (ela lê o perfil de outras pessoas). Testes no estilo do `api-keys.service.spec.ts`: chave revogada, vencida, de usuário inativo e de não-Master levam 401/403.

---

## 🧯 Erros comuns

| Sintoma | Causa | Solução |
|---|---|---|
| API do Experience reiniciando com `Invalid URL` | Falta o `HUB_URL` no `.env` | Passo 2.3 |
| `TS1479` / `ERR_REQUIRE_ESM` ao importar `@sondohub/server` | `tsconfig` ainda em `commonjs`, TypeScript < 5.8 ou Node < 22.12 | Passo 2.2; Node 24 |
| `404` de `registry.npmjs.org/@sondohub%2F...` | Falta o `.npmrc` | Passos 2.1 e 3.1 |
| `400` no `/api/auth/sondohub`, log `"null" is not valid JSON` | O front mandou `null` como corpo; o `express.json` (modo strict) só aceita objeto ou lista | Corpo `{}` no `httpClient.post` (Passo 3.4) |
| `401`, log `JOSEAlgNotAllowed` | O front mandou o JWT do Experience (HS256) no lugar do token do hub: o interceptor de request sobrescreveu o header | Passo 3.4, interceptor de request |
| `401` no `/api/auth/sondohub`, log com `aud` | O app não foi cadastrado com o slug `experience` naquele hub | Parte 1 |
| Login com senha diferente depois da Parte 2 | Algo do login atual foi editado | Ver "O login atual não muda" e desfazer; o checkpoint 9 pega isso |
| `401`, log com `iss` | `HUB_URL` do Experience diferente do `HUB_URL` do hub | Copie caractere por caractere, sem barra no fim |
| `401`, log com `fetch failed` | O back do Experience não alcança o JWKS do hub | Rede/DNS entre os servidores |
| "Não foi possível falar com o SondoHub" | Origem não cadastrada, ou API do hub não reiniciada | Parte 1, Passos 1.1 e 1.3 |
| Volta do hub e vai para o hub de novo, em ciclo | Front fora de `*.sondotecnica.com`, ou `http://` | Parte 4, item 1 |
| Depois do login, o hub fica no launcher | A pessoa não tem acesso ao Experience | Passo 1.2 |
| Entra e cai em `/configuracoes` | Nível `2 — Usuário` sem telas liberadas | Admin do Experience libera telas (Conceito 3) |
| Liberar o Experience no painel dá 502 "O Experience não respondeu" | API do Experience parada, `EXPERIENCE_API_URL` errado, ou chave diferente nos dois `.env` (o log do hub mostra `HTTP 401`) | Parte 5, "A chave"; reiniciar as duas APIs depois de mudar o `.env` |
| Liberar dá 400 "Esse nível não existe no Experience." | O app no hub tem um nível que não é 1 nem 2 | Passo 1.1 |
| API do hub não sobe, erro do zod com `EXPERIENCE_API_URL` | Falta a variável no `.env` do hub | Parte 5, "A chave"; em produção, Parte 4, passo 4 |
| Admin do Experience virou comum | Foi liberado no hub com o nível `2 — Usuário` | Trocar para `1 — Administrador` no painel do hub |
| `duplicate key ... hub_user_id` | Duas linhas locais tentaram o mesmo `sub` (dado legado) | Ver as linhas com o mesmo e-mail e manter uma |

---

## ⏳ O que ficou para depois (de propósito)

| Hoje | Por quê | Quando mexer |
|---|---|---|
| Revogação no hub leva até 1 dia no Experience | Preço da troca de token (Conceito 1) | Baixar o `expiresIn` para `8h` se incomodar (vale para os dois logins) |
| Nome e foto mudados no hub só chegam no próximo login | Só permissão é empurrada na hora (Parte 5) | Se incomodar: chamar o `upsertUser` também no `update` do painel |
| Desativar a conta inteira no hub (`isActive`) não inativa no Experience | Sem token do hub ninguém entra pelo hub; só a senha própria de quem já tinha continua valendo | Chamar o `deactivateUser` no `update` quando `isActive` virar `false` |
| Excluir a chave na tela Desenvolvedor não a revoga | O hub manda o segredo do `.env`; nada confere a tabela `api_keys` | Trocar nos dois `.env` (Parte 5) |
| `jwt.sign` repetido no `loginSondoHub` | Não editar o `login` (regra 1) | Na limpeza do login próprio, ou extrair uma função quando os dois logins estiverem cobertos por teste |
| Dois logins na mesma tela | Ninguém perde acesso durante a migração | Quando todos tiverem conta no hub: tirar o login próprio, o MD5 e a tela de senha |
| A tela Usuários do Experience ainda cria usuário com senha e edita `adm` | Continua servindo ao login próprio. Um `adm` editado lá vale até o próximo `PUT` do hub | Na limpeza acima: criar usuário e `adm` passam a ser só no hub, e a tela fica só com as telas |
| As senhas MD5 do login próprio | Já era assim | Na limpeza; MD5 não serve para senha (a aula 01 explica o Argon2id do hub) |
| Chave de API sem guard no hub | Nenhum app chama o hub com chave ainda | Parte 6, no primeiro caso real |

---

## 📋 Receita para qualquer app da Sondotecnica

Esta é a versão curta, para a futura página "Integração com app Sondotecnica".

**Antes de começar, responda:**

1. **O back do app já tem permissão própria rica** (telas, papéis, ids locais)? Use a **troca de token** (este documento). **Não tem**, ou é app novo? Use o **token do hub em toda chamada** (aulas 07b e 14), que é ainda menos código.
2. **Quais níveis o app precisa?** Viram o `levels` do cadastro. Convenção do hub: número maior = mais permissão (o Experience é a exceção: nível = `adm`, Conceito 3).
3. **O app guarda dados por usuário?** O vínculo é o `sub` do token (`hub_user_id`), achado pelo e-mail na primeira vez.
4. **O app precisa conhecer a pessoa antes do primeiro login** (ligar a contratos, liberar telas)? O hub empurra: `PUT`/`DELETE /…/sondohub/users/:id` com chave em `X-Api-Key` (Parte 5), e um client no hub chamado nos quatro pontos do `admin-users.service.ts`.
5. **Há rotas de máquina** (sensores, integrações, scripts)? Elas usam chave em `X-Api-Key`, nunca o login de pessoa.

| Onde | O quê |
|---|---|
| Hub | Cadastrar o app (slug, URL → origem, níveis), dar acesso, reiniciar a API |
| Os dois repositórios | `.npmrc` commitado + token de leitura via `pnpm config set` |
| Back | `@sondohub/server`; `HUB_URL` no `.env` e o slug como `audience`; `createTokenVerifier` (troca) ou `sondoAuth` (toda chamada) |
| Banco do app | Coluna `hub_user_id UUID UNIQUE` na tabela de usuários existente; nome, e-mail e foto são cópia, renovada a cada login |
| Hub → app (se a pergunta 4 for sim) | Rota com guard de chave no app; `modules/<app>/<app>-client.ts` no hub; a chave nos dois `.env` |
| Front | `@sondohub/client`; `VITE_HUB_URL`; porta fixa; `sondo.ts`; página `/login/sondohub`; botão; ▦ para quem entrou pelo hub; Sair encerra o hub |
| Produção | Front em `*.sondotecnica.com`, sempre `https://` |

⬅️ Voltar para o [índice](README.md)
