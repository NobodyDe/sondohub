# Deploy — SondoHub em Docker na VM (`hub.sondotecnica.com`)

> 🎯 **Objetivo:** o hub e a API rodando 24/7 em `https://hub.sondotecnica.com`, numa VM que já tem outro projeto (PM2 + nginx + certbot). O deploy sai do seu PC com **um comando**, e a mesma receita instala o hub em qualquer outra máquina.
>
> Comandos do **PC** no PowerShell, a partir da raiz do repositório. Comandos da **VM** no bash, via SSH.

---

## 🧠 As suas decisões, avaliadas

| Você decidiu | Avaliação | Como ficou |
|---|---|---|
| **Containers Docker** para instalar em outra máquina em um clique | ✅ Certo. Mas o "um clique" só existe se a VM **não guardar nada**. Se o banco morar na VM, trocar de máquina vira migração de dados. | A VM não guarda estado: o banco é o PostgreSQL do Azure (aula 09) e os avatares já estão no Azure Blob. Trocar de VM = subir a mesma receita em outro lugar. |
| **Reaproveitar o nginx + certbot** que já estão na VM | ✅ Certo, e é obrigatório: só um processo pode ouvir as portas 80/443. Um segundo nginx (ou Caddy) em container brigaria com o do outro projeto. | O nginx do **host** é o porteiro HTTPS da VM inteira. Os containers ouvem só em `127.0.0.1:8080`, que a internet não alcança. |
| **PM2** para a API ficar 24/7 | ❌ Neste projeto, não. O Docker já faz isso: `restart: unless-stopped` religa o container se ele cair, e o serviço do Docker sobe junto com a VM. PM2 dentro de container seria um segundo supervisor brigando com o primeiro. | O PM2 continua cuidando **só** do outro projeto. |
| **"Subir a api (dist)"** | ✅ Mas não o `dist` do seu PC. | O Docker compila do zero dentro da imagem e roda `node dist/main.js`. Assim o que roda não depende do estado da sua máquina, e foi esse build limpo que achou um erro de tipo no hub (veja **Mudanças no código**). |
| **"Subir o front-end no túnel do DNS"** | ✅ | Um nginx **dentro** do container do hub serve o build do Vite e repassa `/api` para a API: o mesmo origin do dev (o proxy do Vite), agora em produção. |
| **"Subir os packages"** | ⚠️ Pacote não "sobe": ele não é um processo. | O `contracts` entra **compilado** dentro das imagens da api e do hub. O `client` e o `server` são o SDK dos **outros** apps (gêmeo): o lugar deles é um registry de pacotes (GitHub Packages), não a VM. Isso é a próxima etapa da aula 07b, separada deste deploy. |
| **App demo em localhost** | ✅ Fica fora do deploy. ⚠️ Mas ele só funciona com o hub **local** (`pnpm dev`). | Contra `hub.sondotecnica.com`, o cookie `SameSite=Strict` não sai de `localhost` (são sites diferentes), e o resultado é um loop de login. Também **não cadastre o demo no banco de produção**: um origin `http://localhost` liberado no CORS de produção é uma porta aberta sem motivo. |
| **DNS `hub.sondotecnica.com`** | ✅ E resolve o bloqueio da aula 07b. | O gêmeo está em `*.sondotecnica.com`, então hub e apps passam a ser o **mesmo site**, e o cookie chega. As aulas ainda falam em `.com.br`: o que vale agora é `.com`, inclusive no `hubUrl` dos apps. |
| **Banco** (você não citou) | ⚠️ Um Postgres em container numa VM **provisória** morreria junto com ela. | Azure PostgreSQL, o mesmo da aula 09. O container `migrate` aplica as migrations sozinho a cada deploy. |
| **Como a imagem chega na VM** (você não citou) | Compilar **na** VM gastaria CPU e RAM de uma máquina dividida com outro projeto. | As imagens são compiladas no seu PC (Docker Desktop), enviadas para o **GHCR** (registry do GitHub) e a VM só faz `pull`. A imagem que você testou é a mesma que roda. |

---

## 🗺️ O desenho

```
Internet ──HTTPS──▶ nginx do HOST (80/443, certbot)
                     ├─ outro-projeto ──────────▶ PM2 (como hoje, intocado)
                     └─ hub.sondotecnica.com ───▶ 127.0.0.1:8080
                                                   │   rede interna do Docker (invisível de fora)
                                                   ▼
                                         ┌─ hub ─────────────────────────┐
                                         │ nginx: arquivos do Vite (SPA) │
                                         │ /api/* ──▶ api:3100           │
                                         └───────────────┬───────────────┘
                                                         ▼
                                         ┌─ api ─────────┴──┐       ┌──────────────────────┐
                                         │ NestJS (node)    │──────▶│ Azure PostgreSQL     │
                                         └──────────────────┘       │ Azure Blob (avatares)│
                                         ┌─ migrate ────────┐──────▶└──────────────────────┘
                                         │ migrate deploy   │ roda e termina antes da api subir
                                         └──────────────────┘
```

**Por que dois nginx?** Cada um tem um dono diferente. O do **host** é da VM: HTTPS e qual domínio vai para qual projeto. O do **hub** é do projeto: a regra "`/api` vai para a API, o resto é a SPA" mora no repositório e viaja com a imagem. Em outra máquina, você não reescreve essa regra. O salto a mais acontece dentro da própria VM, e o custo é desprezível.

---

## 📁 Os arquivos

| Arquivo | Para quê |
|---|---|
| [`Dockerfile`](Dockerfile) | Um arquivo, duas imagens (`api` e `hub`). As duas saem do mesmo estágio de build: o monorepo é instalado e compilado uma vez só. |
| [`docker-compose.yml`](docker-compose.yml) | Os 3 serviços: `migrate`, `api` e `hub`. É o único arquivo do projeto que vai para a VM. |
| [`nginx/hub.conf`](nginx/hub.conf) | O nginx de dentro do container do hub (SPA + `/api`). |
| [`nginx/hub.sondotecnica.com.conf`](nginx/hub.sondotecnica.com.conf) | O site no nginx do **host** (vai para `/etc/nginx/sites-available/`). |
| [`.env.example`](.env.example) | O modelo do `.env` de produção. |
| [`deploy.ps1`](deploy.ps1) | O "um clique": build → push → a VM atualiza. |
| [`../.dockerignore`](../.dockerignore) | O que **não** entra na imagem: `node_modules`, `dist`, `.env`, `.git`, `docs`. |

O `docker-compose.yml` da raiz continua igual: ele é só o Postgres do dev.

---

## 🔧 Mudanças no código (já feitas)

| Arquivo | Mudança | Por quê |
|---|---|---|
| `apps/api/package.json` | `prisma` saiu de `devDependencies` e foi para `dependencies` | O container `migrate` roda `prisma migrate deploy`, e a imagem de produção só leva as `dependencies`. |
| `apps/api/package.json` | `"files": ["dist", "prisma", "prisma.config.ts"]` | Diz ao `pnpm deploy` o que é o "pacote" da API. Sem isso, iam para a imagem também `src/`, configs de teste e o `.tsbuildinfo`. |
| `apps/api/src/main.ts` | `app.set('trust proxy', 'loopback, uniquelocal')` | Atrás de dois nginx, o `req.ip` seria o IP do proxy, e "Dispositivos conectados" mostraria `172.x` para todo mundo. Testado: o IP gravado na sessão é o do usuário. |
| `apps/hub/.../MainContent.tsx` | Removida a prop `onToggleFavorite` do tipo | Sobra da refatoração para o zustand (o card já lê o `toggleFavorite` do store). O `tsc -b` do seu PC não acusava por causa do cache incremental; o build limpo do Docker acusou e falhou. |

---

## 🛠️ Parte A — uma vez, no seu PC

### A1. Confira a arquitetura da VM

Na VM:

```bash
uname -m
```

Esperado: `x86_64`, a mesma do Docker Desktop. Se aparecer `aarch64` (VM ARM), acrescente `platforms: [linux/arm64]` dentro de cada `build:` do compose. Sem isso, a VM responde `exec format error`.

### A2. Login no GHCR

Crie um **token classic** no GitHub (*Settings → Developer settings → Personal access tokens → Tokens (classic)*) com o escopo `write:packages`. O token fine-grained ainda não funciona com o registry de containers.

```powershell
docker login ghcr.io -u NobodyDe
# Password: cole o token
```

Depois do primeiro push, confira em *GitHub → seu perfil → Packages* que `sondohub-api` e `sondohub-hub` estão **privados**.

### A3. Chave JWT de produção

Gere uma chave **nova**, só de produção. Quem tem a chave de dev não pode conseguir assinar tokens que valem em produção.

```powershell
node apps/api/scripts/generate-jwt-key.ts
```

### A4. O `.env` de produção

```powershell
Copy-Item deploy/.env.example deploy/.env
```

Preencha o `deploy/.env` com:

- a saída do A3 (`JWT_KEY_ID` e `JWT_PRIVATE_KEY`);
- a `DATABASE_URL` do Azure, com a senha **codificada**: `[uri]::EscapeDataString('<senha>')` (aula 09, Passo 3);
- as duas variáveis `AZURE_STORAGE_*`, iguais às do seu `.env` da raiz.

O `deploy/.env` já está no `.gitignore`.

> ⚠️ Para o Docker Compose, `$` dentro de um valor é uma variável. Se algum valor tiver `$`, ponha o valor entre aspas simples.

---

## 🛠️ Parte B — uma vez, na VM

### B1. Instale o Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # para usar docker sem sudo
exit                            # saia e entre de novo no SSH para o grupo valer
```

Confira:

```bash
docker compose version
systemctl is-enabled docker     # esperado: enabled (é isto que religa tudo depois de um reboot)
```

O script é o instalador oficial do Docker. Ele não mexe no nginx, no PM2 nem no outro projeto.

### B2. A pasta do projeto

```bash
sudo mkdir -p /opt/sondohub
sudo chown $USER: /opt/sondohub
```

### B3. Envie o `.env` (no PC)

```powershell
scp deploy/.env usuario@ip-da-vm:/opt/sondohub/.env
```

E na VM, deixe o arquivo legível só pelo seu usuário:

```bash
chmod 600 /opt/sondohub/.env
```

### B4. Login no GHCR

Crie um segundo token classic, só com `read:packages`. A VM só precisa **baixar** imagens; se ela for invadida, esse token não serve para publicar uma imagem falsa.

```bash
docker login ghcr.io -u NobodyDe
```

### B5. Libere a VM no Azure

O Azure PostgreSQL recusa qualquer IP que não esteja liberado (aula 09, Passo 1). Descubra o IP público da VM:

```bash
curl -4 ifconfig.me
```

Portal do Azure → **serverdb-flex-qgis** → **Rede** → adicione esse IP → **Salvar**.

### B6. O site no nginx do host

Confira se a porta 8080 está livre (nenhuma linha = livre):

```bash
sudo ss -ltnp | grep ':8080'
```

Se estiver ocupada pelo outro projeto, troque a `8080` no `docker-compose.yml` **e** no `hub.sondotecnica.com.conf`.

No PC, envie o arquivo do site:

```powershell
scp deploy/nginx/hub.sondotecnica.com.conf usuario@ip-da-vm:/tmp/
```

Na VM, ative o site e peça o certificado:

```bash
sudo mv /tmp/hub.sondotecnica.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/hub.sondotecnica.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d hub.sondotecnica.com
```

O `nginx -t` testa a configuração **antes** do reload. Se ele falhar, nada muda, e o outro projeto continua no ar. O `certbot --nginx` acrescenta o bloco 443 e o redirecionamento de HTTP para HTTPS no próprio arquivo, e a renovação automática que já existe na VM passa a cobrir este domínio também.

> Se a VM usar `/etc/nginx/conf.d/` em vez de `sites-available` (CentOS/RHEL), copie o arquivo direto para `conf.d/` e pule o `ln -s`.

---

## 🚀 Parte C — o deploy (o "um clique")

No PC, da raiz do repositório:

```powershell
.\deploy\deploy.ps1 -Server usuario@ip-da-vm
```

| Etapa | O que acontece |
|---|---|
| `build` | Compila a api e o hub dentro do Docker (alguns minutos na primeira vez; depois, o cache aproveita o que não mudou) |
| `push` | Envia as duas imagens para o GHCR |
| `scp` | Atualiza o `docker-compose.yml` da VM |
| `pull` + `up -d --wait` | A VM baixa as imagens, roda o `migrate`, sobe a api, espera o healthcheck e sobe o hub |

Se qualquer etapa falhar, o script para ali: um build quebrado nunca vira push. O script precisa do PowerShell 7 (`pwsh`), não do Windows PowerShell 5.

> 💡 Use chave SSH (`ssh-keygen` + `ssh-copy-id`). Com senha, o script pede a senha duas vezes (no `scp` e no `ssh`).

### No primeiro deploy

**O Master.** Se o banco é o mesmo da aula 09, o Master já existe. Se for um banco novo, crie o `apps/api/prisma/create-master.ts` da aula 09 (Passo 6.1) **antes** do deploy: tudo o que está em `prisma/` vai junto na imagem. Depois, na VM:

```bash
cd /opt/sondohub
read -s -p "Senha do Master: " MASTER_PASSWORD && export MASTER_PASSWORD
docker compose run --rm -e MASTER_PASSWORD api node prisma/create-master.ts <seu-email> "Seu Nome"
unset MASTER_PASSWORD
```

O `-e MASTER_PASSWORD` sem valor repassa a variável do terminal: a senha não fica no histórico do bash nem no `.env`. **Nunca rode o `seed.ts` em produção**: ele cria usuários com a senha de teste e o app demo em `localhost`.

**Os apps.** No admin do hub, cadastre os apps com o endereço **real**, em `https://`. A API lê os origins do CORS só quando sobe, então reinicie depois de cadastrar ou alterar um app:

```bash
docker compose restart api
```

---

## ✅ Checkpoint

| # | Teste | Esperado |
|---|---|---|
| 1 | `docker compose ps -a` (na VM, em `/opt/sondohub`) | `api` **healthy**, `hub` **Up**, `migrate` **Exited (0)** |
| 2 | Abrir `https://hub.sondotecnica.com` | Cadeado válido e a tela de login |
| 3 | `curl https://hub.sondotecnica.com/api/.well-known/jwks.json` | `{"keys":[{"kty":"RSA",...` |
| 4 | Login → DevTools → Application → Cookies | `__Host-sondohub_session`, com `Secure` e `HttpOnly` |
| 5 | Meu perfil → Dispositivos conectados | O **seu** IP público, não um `172.x` |
| 6 | Abrir `https://hub.sondotecnica.com/admin/usuarios` direto (F5) | A tela carrega, sem 404 |
| 7 | `curl http://ip-da-vm:8080` (do seu PC) | **Falha**: a porta só existe para o nginx do host |
| 8 | `sudo reboot` e esperar 1 min | O hub volta sozinho, sem você rodar nada |

Os itens 1, 3, 4, 5 e 6 já foram testados localmente com estas mesmas imagens: login com o cookie `__Host-`, IP real através dos dois proxies, fallback da SPA, cache dos assets e a API recriada com IP novo sem derrubar o hub.

---

## 🔁 Operação do dia a dia

Na VM, em `/opt/sondohub`:

| Quero… | Comando |
|---|---|
| Ver os logs da API ao vivo | `docker compose logs -f api` |
| Ver o que o migrate fez | `docker compose logs migrate` |
| Ver o estado de tudo | `docker compose ps -a` |
| Recarregar o CORS (cadastrou ou alterou um app) | `docker compose restart api` |
| Aplicar uma mudança no `.env` | `docker compose up -d` |
| Parar o hub (sem apagar nada) | `docker compose stop` |
| Liberar disco (imagens antigas) | `docker image prune -f` |

**Por que dois comandos diferentes?** O `restart` reaproveita o container com as variáveis antigas: serve para a API reler o banco, não para pegar um `.env` novo. Já o `up -d` só recria o container quando a configuração mudou: depois de um cadastro de app ele não faz nada.

**Voltar para a versão anterior:** no PC, `git checkout <commit-bom>` e rode o `deploy.ps1` de novo. A imagem é recompilada a partir daquele commit.

**Mudou o schema do banco?** O `migrate` aplica a migration sozinho no deploy. Antes, faça o backup do schema (aula 09, "Regras que valem para sempre"), principalmente se a migration apagar ou alterar uma coluna.

---

## 🚚 Instalar em outra máquina

É a **Parte B** de novo, mais o `deploy.ps1` apontando para o servidor novo:

1. B1 a B4 na máquina nova (Docker, pasta, `.env`, login no GHCR).
2. B5: libere o IP **novo** no Azure.
3. Aponte o DNS `hub.sondotecnica.com` para o IP novo.
4. B6: nginx + certbot. Se a máquina não tiver nginx, instale antes: `sudo apt install nginx certbot python3-certbot-nginx`.
5. `.\deploy\deploy.ps1 -Server usuario@ip-novo`

Não há dados para migrar: banco e avatares estão no Azure, e as sessões continuam válidas. Os usuários nem precisam fazer login de novo.

---

## 🧯 Erros comuns

| Sintoma | Causa | Solução |
|---|---|---|
| `502 Bad Gateway` no site | A api não subiu | `docker compose logs api`. Se for o `.env`, o zod diz qual variável está faltando ou inválida |
| `migrate` com `Exited (1)` e `P1001` | O IP da VM não está liberado no Azure | B5 |
| `migrate` com `P1000` | Senha errada, ou com `@`/`#` sem codificar | `[uri]::EscapeDataString` (A4) |
| `denied` ou `unauthorized` no `pull` | Faltou o `docker login` na VM, ou o token não tem `read:packages` | B4 |
| `exec format error` | Imagem `amd64` numa VM ARM | A1 |
| O login dá certo, mas volta para `/login` | Acesso por `http://` ou pelo IP: o cookie `__Host-` exige HTTPS | Use sempre `https://hub.sondotecnica.com` |
| `413 Request Entity Too Large` no avatar | Faltou o `client_max_body_size` no nginx do host | Confira o arquivo do B6 |
| `address already in use` na 8080 | Outra coisa da VM usa a porta | Troque a porta nos dois arquivos (B6) |
| App real recebe `403` no `/api/sso/token` | Origin do app diferente do cadastrado, ou a API não foi reiniciada depois do cadastro | Confira o `https://` e a porta, depois `docker compose restart api` |

---

## ⚠️ O que ficou para depois (de propósito)

- **GitHub Actions:** o `deploy.ps1` vira um workflow que roda a cada merge no `main`. É o mesmo build, push e `ssh`, só que sem o seu PC.
- **Tag por versão:** hoje a imagem é sempre `latest`, e voltar de versão exige recompilar. Com a CI, cada imagem ganha a tag do commit, e o rollback vira só trocar a tag.
- **Usuário de banco só da API** (aula 09): hoje a `DATABASE_URL` usa o seu usuário pessoal.
- **Imagem da api com ~780 MB:** quase 200 MB são do Prisma (client, CLI e engines). O CLI só está ali para o `migrate`. Se o tamanho incomodar, o `migrate` pode ganhar uma imagem própria.
- **Limite de memória:** a VM é dividida. Se a API um dia vazar memória, ela leva o outro projeto junto. Se isso aparecer, acrescente `mem_limit` no compose.
- **O SDK (`client` e `server`) no GitHub Packages:** é o que falta para o gêmeo instalar o hub sem `link:` (aula 07b).

⬅️ Voltar para o [índice](../docs/README.md)
