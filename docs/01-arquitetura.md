# SondoHub — Arquitetura

> Decisões de arquitetura do hub de acesso unificado da Sondotecnica.
> Este é o documento de referência: as aulas (`03` a `07`) implementam o que está aqui.

## Contexto

Hoje cada app da Sondotecnica tem login e tabela de usuários próprios. O SondoHub centraliza a identidade: **um cadastro, uma senha e um nível de permissão por app**. São duas frentes:

- **A central** (`hub.sondotecnica.com.br`): mostra os apps, o perfil e a área de admin.
- **O widget**: um botão ▦ em cada app, no estilo do Microsoft 365.

| Pergunta | Decisão |
|---|---|
| Domínios | Todos os apps em subdomínios de `sondotecnica.com.br` |
| Front dos apps | Todos em React |
| Login atual dos apps | Cada app tem o seu, então haverá migração (Fase 4) |
| Quem gerencia acessos | Um admin geral no hub |
| ORM | Prisma 6 |

**Por que construir em vez de usar um IdP pronto (Keycloak)?** A experiência é o produto: launcher, perfil, admin em português e a migração dos apps atuais. Para não inventar protocolo, o desenho segue o modelo do Google e da Microsoft: **uma sessão no domínio de login e tokens curtos por app**.

---

## 1. Express ou Nest → **NestJS** (adapter Express)

- **Segurança.** A segurança não vem do framework HTTP. O Nest roda **em cima** do Express, então a camada HTTP é a mesma. O que muda é **o quanto é fácil esquecer uma proteção**.
- **Guard global (deny-by-default).** Toda rota exige sessão, e as exceções são explícitas com `@Public()`. No Express, cada rota precisa lembrar do middleware; se alguém esquecer, a rota fica aberta.
- **Recursos oficiais prontos:** pipes de validação, `@nestjs/throttler` (rate limit), um filtro de exceção que não vaza stack trace e DI, que deixa os services testáveis com fakes.
- **Custo:** mais boilerplate e mais curva de aprendizado. Para um serviço de 3 rotas o Express ganharia. Aqui não: é um provedor de identidade com ~9 módulos, e ele vira a porta de entrada de todos os sistemas.
- **Backends dos apps:** continuam no que já são (Express ou Nest). Só precisam validar o JWT com `@sondohub/server`.

## 2. Ajustes no desenho original

| Ideia inicial | Como ficou | Por quê |
|---|---|---|
| Senha criptografada | **Hash Argon2id** | Criptografia é reversível e hash não. Se o banco vazar, as senhas não vazam. |
| Refresh token em JWT | **Token opaco aleatório** (32 bytes) num cookie `HttpOnly`, guardado como **hash** na tabela `sessions`, com validade de 30 dias | Precisa ser revogável (logout, troca de senha, usuário desativado), então o banco é consultado de qualquer jeito. Assinar como JWT não traz ganho. Na prática ele é a "sessão SSO", igual ao cookie de login do Google e da Microsoft. |
| O app precisa do refresh para entrar | O refresh **nunca sai do hub**: o cookie só vai para `hub.sondotecnica.com.br`. O app recebe só um **access token de 10 min** e o backend dele valida a assinatura. | "Usuário válido" continua garantido: o hub só emite token para sessão válida, e o token expira rápido, então a revogação chega em até 10 min. Se cada app recebesse o refresh, um app comprometido conseguiria gerar tokens de todos os outros. |
| Assinatura do JWT | **RS256**: a chave privada fica só no hub; os apps validam com a pública em `/api/.well-known/jwks.json` | Com segredo compartilhado (HS256), qualquer app poderia forjar um token de admin de outro app. O `kid` desde o primeiro dia permite trocar a chave sem mexer nos apps. |
| Access token com dados básicos | **Um token por app**: `aud` = slug do app, só o **nível daquele app**, foto como **URL**. Claims OIDC (`sub`, `name`, `email`, `picture`) mais `level`. | O token do app A não abre o app B. O payload de um JWT é base64 (qualquer um lê), então nada sensível ou pesado vai nele. |
| O app pede token "para o app que quer ir" | O hub identifica o app pelo **`Origin`** da requisição, conferido no registro de apps | Um XSS no app A não consegue pedir token do app B. |
| Ver se já logou em algum app | **Login só no hub**; os apps redirecionam para lá. "Já logou?" passa a significar "existe sessão válida no hub". | O usuário digita a senha em um endereço só (proteção contra phishing) e o gerenciador de senhas funciona. |

## 3. O que estava faltando (já está no roteiro)

- **Admin:** criar usuário com convite por email, desativar, liberar apps e níveis, cadastrar apps.
- **Primeiro acesso e "esqueci minha senha":** um mesmo link de uso único, enviado por email, atende os dois casos.
- **Minha conta:**
  - trocar o email só depois de confirmar o email novo;
  - trocar a senha pedindo a atual, o que derruba as outras sessões;
  - ver as **sessões ativas**.
- **Logout único:** sair em qualquer app encerra a sessão do hub.
- **Força bruta:** rate limit por IP, bloqueio de 15 min após 5 erros e mensagem genérica.
- **Registro de apps:** um app novo é só uma linha no banco e aparece em todos os widgets sem deploy.
- **Sem acesso:** quem está logado mas não tem permissão vê uma tela "sem acesso" com link para a central.
- **CSRF/CORS:** só `/api/sso/*` aceita outros origins (os apps). O resto aceita apenas o próprio hub.
- **Auditoria:** registro de logins, falhas e de quem liberou o quê.
- **Migração** dos usuários dos apps atuais.
- **Anotado para depois:** MFA, "Entrar com Microsoft" (Entra ID), rotação automática de chaves e logout instantâneo (hoje leva até 10 min).

## 4. Como o widget funciona em cada app

O pacote `@sondohub/client` tem duas peças:

- **o SDK**, que cuida do token. O app nunca lida com cookie, renovação ou JWKS.
- **o `<AppLauncher />`**, que é o botão ▦.

```
App (gemeo.sondotecnica.com.br)                          Hub (hub.sondotecnica.com.br)
1. abre → Provider ── POST /api/sso/token (cookie vai junto) ─▶ sessão válida? acesso a este app?
          ◀─ 200 { accessToken, expiresIn, user }  renderiza o app: SSO, não pediu senha
          ◀─ 401  redirect hub/login?returnTo=<url> → login → volta
          ◀─ 403  tela "sem acesso" + link para a central
2. backend do app recebe o Bearer → valida com a chave pública (em cache) ─▶ GET /api/.well-known/jwks.json
3. ▦ ── GET /api/me/apps ─▶ apps liberados → abre outro app → ele repete o passo 1 em silêncio
4. Sair ── POST /api/auth/logout ─▶ sessão revogada → os outros apps param de renovar (em até 10 min)
```

**Como o SDK se comporta:**

- **Armazenamento:** o token fica **só em memória**, nunca no `localStorage`.
- **Renovação preguiçosa:** `getAccessToken()` devolve o token em cache e só vai ao hub quando faltam menos de 60 s para expirar. Não há timers.
- **Single-flight:** várias chamadas ao mesmo tempo compartilham uma única requisição.
- **Dados do usuário:** o hub devolve `user` junto com o token, então **o front nunca decodifica o JWT**. Para o front, o token é opaco; quem lê o conteúdo é o backend do app.
- **CSS do widget:** é próprio, com classes prefixadas, e é injetado pelo próprio componente (React 19 `<style href precedence>`). O app não importa nada.

## 5. Padrão de projeto

**Monólito modular:** um backend Nest, módulos por domínio e um banco. Dentro de cada módulo há três camadas finas:

- **Controller:** só HTTP.
- **Service:** as regras de negócio.
- **Repository:** o único lugar que fala com o Prisma.

```
Casos de uso (controllers + services):  auth · sso · account · admin
Domínio (dados):                         users · apps · sessions
Infra:                                   prisma · mail · audit · config
```

As dependências só apontam para baixo. SOLID na prática:

- **S:** `PasswordService` só faz hash e verificação, `TokenService` só assina e publica a chave, e `SessionsService` só cria, valida e revoga sessões.
- **O:** um app novo é um dado no registro, não código novo.
- **D:** o Nest injeta as dependências e, nos testes, você troca por fakes. **Não há interface "por via das dúvidas"**: ela só aparece quando existir uma 2ª implementação real.
- **I:** o SDK expõe só o essencial: `getSession`, `getAccessToken`, `getApps` e `logout`.

**Atenção a quatro limites:**

- A revogação leva até 10 min.
- A sessão é absoluta: 30 dias depois do login, o usuário digita a senha de novo.
- A foto em disco local exige volume persistente.
- Tudo depende do domínio próprio. **Não use** `*.azurewebsites.net` ou `*.vercel.app`: neles cada subdomínio conta como um "site" diferente e o cookie é bloqueado.

## 6. Stack (versões validadas em 15/10/2026)

| Camada | Escolha |
|---|---|
| Runtime / monorepo | Node 24 LTS · pnpm workspaces (o `pnpm init` fixa o pnpm 12 no projeto) |
| API | NestJS 12 (**ESM**: imports com `.js`; testes com Vitest e lint com Oxlint, que já vêm no scaffold) |
| Banco | PostgreSQL 18 (Docker) · **Prisma 6.19** com o generator clássico `prisma-client-js` |
| Validação | zod 4 em `packages/contracts`, com um `ZodValidationPipe` no Nest |
| Tokens e senhas | `jose` (RS256/JWKS) · `argon2` (Argon2id) · `node:crypto` para sessões e chaves |
| Proteções | helmet · cookie-parser · @nestjs/throttler |
| Front | React 19 · Vite 8 · TypeScript 6 · Tailwind 4 · React Router 8 · TanStack Query 5 |
| Packages | `tsc` puro, sem bundler: o CSS do widget vai no próprio componente |
| Fases 2 e 3 | nodemailer + Mailpit, multer + sharp e react-hook-form (quando os formulários crescerem) |

### Banco (todas as fases)

```
users            id, email (único, minúsculo), name, password_hash (null até aceitar convite), avatar_url,
                 is_admin, is_active, failed_login_count, locked_until, timestamps
applications     id, slug (único → aud), name, icon_url, url, origin (único), levels json [{level,label}], is_active
user_app_access  (user_id, application_id) PK, level, granted_at
sessions         id, user_id, token_hash (único), user_agent, ip, created_at, last_used_at, expires_at, revoked_at
user_tokens      (Fase 2) id, user_id, purpose (INVITE|RESET_PASSWORD|CHANGE_EMAIL), token_hash, new_email, expires_at, used_at
audit_logs       (Fase 3) id, actor_id, action, target_id, metadata json, ip, created_at
```

### Cookie de sessão

- **Nome:** `__Host-sondohub_session` em produção (`sondohub_session` no dev).
- **Flags:** `HttpOnly; Secure; SameSite=Strict; Path=/`, por 30 dias. No dev, em http://localhost, `Secure=false`.

### Rotas

- **Públicas:**
  - `POST /api/auth/login`
  - `POST /api/auth/forgot-password` e `POST /api/auth/set-password` (Fase 2)
  - `GET /api/.well-known/jwks.json`
- **Com sessão (cookie):** `GET /api/me`, `GET /api/me/apps` (apps com o nível), `POST /api/auth/logout` e `POST /api/sso/token`.
- **Que os apps (outros origins) podem chamar:** só `/api/sso/token`, `/api/me/apps` e `/api/auth/logout`. O resto é só do próprio hub, incluindo `/api/admin/*` na Fase 3.
- **CSRF:** toda requisição que altera estado exige um `Origin` conhecido (aula 08).

### Portas de desenvolvimento

As portas 3000 e 5173 já estavam em uso nesta máquina. O SondoHub usa portas próprias e `strictPort`, para o Vite falhar em vez de trocar de porta sozinho e quebrar o CORS:

| Processo | Porta |
|---|---|
| API (Nest) | 3100 |
| Hub (Vite) | 5180 |
| Demo (Vite) | 5181 |
| API do demo (Express) | 4100 |
| Postgres (Docker) | 5433 |

---

## 7. Roteiro de fases

**Fase 1: primeiro funcionar, uma rota por vez; depois proteger** (aulas 03 a 08)

1. Monorepo, Docker e `.env` compartilhado (guia `02`). O banco está no [apêndice](apendice-banco-de-dados.md).
2. `POST /api/auth/login`: sessão crua no cookie + dados do usuário (aula `03`).
3. `GET /api/me`, `GET /api/me/apps` (com o nível) e `POST /api/auth/logout` (aula `04`).
4. Hub: tela de login e launcher (aula `05`).
5. `POST /api/sso/token` (JWT por app), JWKS e CORS simples (aula `06`).
6. Um app consumindo o login do hub: SDK, widget, middleware, `returnTo` e o roteiro para apps reais (aula `07`).
7. Fechando as portas: guard global, validação, rate limit, bloqueio, CSRF, CORS dinâmico e testes (aula `08`).

**Fase 2: minha conta.** Email (nodemailer/Mailpit), esqueci e definir senha, perfil (nome e foto), trocar senha, trocar email com confirmação e sessões ativas.

**Fase 3: admin e auditoria.** Usuários (criar com convite, desativar, admin), acessos e níveis por app, registro de apps e `audit_logs`.

**Fase 4: migração dos apps.** Primeiro um app piloto, depois os demais:

1. Publicar `contracts`, `client` e `server` num registry npm privado.
2. Cadastrar o app no hub (slug, origin, URL, ícone e níveis).
3. Importar os usuários por CSV (`email, nome, papel`):
   - fazer upsert por email, assim quem está em vários apps vira um único usuário;
   - converter o papel antigo em nível;
   - criar todos sem senha e mandar o convite.

   As senhas antigas não são migradas: os algoritmos são diferentes e haveria conflito quando o mesmo email tem senhas diferentes em dois apps.
4. Front do app: entram o SDK e o launcher, e a tela de login vira um redirect.
5. Back do app: entram o `@sondohub/server` e uma função `resolveLocalUser`:
   - procura o usuário local pelo `hub_user_id`;
   - se não achar, procura pelo email (já verificado pelo convite) e grava o `hub_user_id`;
   - se ainda não achar, cria o usuário.

**Pendências que não bloqueiam a Fase 1:**

- registry privado (GitHub Packages ou Azure Artifacts);
- hospedagem: front e `/api` no mesmo host, atrás de um proxy reverso com `trust proxy` no Express;
- provedor SMTP;
- lib de UI do hub.
