# 16 — Pipeline de CI/CD no GitHub Actions

> 🎯 **Objetivo:** todo push na `main` passa por **build, lint e teste**. Se tudo der certo, vai sozinho para produção, rodando o mesmo `.\deploy\deploy.ps1 -Server root@4.249.16.228` que você roda hoje no PC. Se qualquer etapa falhar, nada vai para a VM.
>
> | Hoje | Depois desta aula |
> |---|---|
> | Você roda o `deploy.ps1` no PC, com o que estiver na sua pasta, commitado ou não | O GitHub roda, sempre a partir de um commit da `main` |
> | Um erro de tipo só aparece na hora do deploy (aconteceu duas vezes: `MainContent.tsx` e `Sidebar.tsx`) | Aparece no check vermelho do commit, antes de chegar perto da VM |
> | O deploy depende do seu PC ligado e logado no GHCR | Depende só dos secrets do repositório |

---

## 🧠 Conceito 1: dois jobs, um portão

```
push na main
   │
   ▼
┌─────────── ci ───────────┐   falhou? para aqui. A VM nem fica sabendo.
│ install → build → lint → test │
└──────────────┬───────────┘
               │ needs: ci
               ▼
┌────────── deploy ──────────┐
│ login GHCR → chave SSH → deploy.ps1 │  (build das imagens, push, scp, up --wait)
└────────────────────────────┘
```

- **Por que dois jobs e não um:** o `ci` é o portão. Ele é rápido (pnpm, sem Docker) e não tem acesso a nenhum segredo de produção. O `deploy` só começa se o `ci` passar, e é o único que recebe a chave da VM. Quanto menos código roda com o segredo, menor o estrago se algo der errado.
- **Por que reusar o `deploy.ps1`, e não reescrever os passos em YAML:** o deploy continua com **um único dono**. Você mudou o deploy? Muda no script, e o PC e o GitHub fazem a mesma coisa. Os runners Linux do GitHub já trazem o PowerShell 7, o Docker e o Compose.
- **"Mas o build roda duas vezes":** sim. O `ci` compila com o pnpm para checar os tipos, e o `deploy` compila de novo dentro do Docker para gerar as imagens. É o preço de o portão ser rápido e separado. Cache das camadas do Docker entra só se o tempo incomodar (⏳).

## 🧠 Conceito 2: os segredos, e o que cada um destrava

| Secret | O que é | Quem usa |
|---|---|---|
| `VM_SSH_KEY` | A chave **privada** de um par criado só para o GitHub | `scp` e `ssh` do `deploy.ps1` |
| `VM_KNOWN_HOSTS` | A "impressão digital" da VM | O `ssh` confere que está falando com a VM certa |
| `GITHUB_TOKEN` | Criado pelo próprio GitHub a cada execução, e vale só durante ela | `docker login ghcr.io` e o push das imagens |

- **Por que uma chave só para o GitHub, e não a sua:** se um dia ela vazar, você apaga **uma linha** no `authorized_keys` da VM, e o seu acesso continua.
- **Por que o `VM_KNOWN_HOSTS` em secret, e não um `ssh-keyscan` no workflow:** o `ssh-keyscan` aceita a primeira resposta que receber, então quem conseguisse se pôr no meio do caminho receberia o deploy e a chave. Com a impressão digital guardada, o `ssh` recusa qualquer outra máquina.
- **Por que o `GITHUB_TOKEN`, e não um token pessoal:** não vence, não é seu, e não dá para vazar para depois, porque expira quando o job termina.

> **Sobre o `root@`:** a chave do GitHub vai entrar como `root`, ou seja, com poder sobre a VM inteira, inclusive o outro projeto. Um usuário `deploy` no grupo `docker` parece mais seguro, mas o grupo `docker` dá, na prática, o mesmo poder que o `root`, porque quem roda container pode montar o disco do host. O ganho real estaria em outra coisa: uma VM só para o hub. Como o hub está aí provisoriamente, seguir com `root` e uma chave dedicada, fácil de revogar, é razoável.

---

## 🛠️ Passo 1 — Os testes precisam poder passar (`apps/api/package.json`)

Hoje o `pnpm test` **falha**: a API não tem nenhum `*.spec.ts`, e o vitest sai com erro em `No test files found`. A pipeline ficaria vermelha para sempre. Acrescente a opção:

```json
    "test": "vitest run --passWithNoTests",
```

**Pense nisso como um compromisso, não como uma solução:** o passo de teste passa a existir e protege a partir do **primeiro** spec que você escrever. O que essa opção não faz é testar alguma coisa sozinha. Os testes da aula 08 entram aqui.

O `pnpm lint` já passa hoje, com um aviso no `button.tsx` do hub. Aviso não derruba a pipeline; só erro derruba.

## 🛠️ Passo 2 — A chave do GitHub na VM

No PC:

```powershell
ssh-keygen -t ed25519 -C "github-actions-sondohub" -f $HOME\.ssh\gha_sondohub
```

Quando ele pedir a *passphrase*, aperte **Enter duas vezes**, sem digitar nada. A chave precisa ficar sem senha, porque o runner não tem como digitar uma.

> **Por que não `-N ''`:** é o jeito comum de criar a chave sem senha, mas o PowerShell joga fora o argumento vazio antes de chamar o `ssh-keygen`, que então reclama `option requires an argument -- N`. A alternativa `-N '""'` é pior: dependendo da versão do PowerShell, ela vira uma senha de verdade, feita de duas aspas. O Enter no prompt funciona em qualquer versão.

Isso gera dois arquivos: `gha_sondohub` (a privada, que vai para o GitHub) e `gha_sondohub.pub` (a pública, que vai para a VM).

Ponha a pública na VM:

```powershell
Get-Content $HOME\.ssh\gha_sondohub.pub | ssh root@4.249.16.228 "cat >> ~/.ssh/authorized_keys"
```

Confira se a chave nova entra, sem pedir senha:

```powershell
ssh -i $HOME\.ssh\gha_sondohub root@4.249.16.228 "echo ok"
```

Agora pegue a impressão digital da VM **direto do arquivo dela**:

```powershell
$key = (ssh root@4.249.16.228 "cat /etc/ssh/ssh_host_ed25519_key.pub").Split(" ")
"4.249.16.228 $($key[0]) $($key[1])"
```

A linha impressa (`4.249.16.228 ssh-ed25519 AAAA...`) é o valor do secret `VM_KNOWN_HOSTS`.

- **Por que dá para confiar nela:** ela veio por uma conexão `ssh` que o **seu PC já conferiu**. Você já se conectou a essa VM antes, e o `ssh` avisaria (`REMOTE HOST IDENTIFICATION HAS CHANGED`) se fosse outra máquina.
- **Por que não o `ssh-keyscan`:** no Windows ele falha com `choose_kex: unsupported KEX method sntrup761x25519-sha512@openssh.com`. A VM oferece um algoritmo de troca de chaves que o OpenSSH do Windows não conhece.

## 🛠️ Passo 3 — Os secrets no GitHub

No repositório `NobodyDe/sondohub`: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

| Nome | Valor |
|---|---|
| `VM_SSH_KEY` | O conteúdo **inteiro** de `$HOME\.ssh\gha_sondohub`, do `-----BEGIN` ao `-----END`, com as linhas como estão |
| `VM_KNOWN_HOSTS` | A linha impressa no Passo 2 (`4.249.16.228 ssh-ed25519 AAAA...`) |

Depois de copiar, apague a chave privada do PC, para ela existir só no GitHub:

```powershell
Remove-Item $HOME\.ssh\gha_sondohub
```

## 🛠️ Passo 4 — Liberar o push das imagens para o workflow

As imagens `sondohub-api` e `sondohub-hub` foram criadas pelo **seu** token, no deploy pelo PC. Por isso o `GITHUB_TOKEN` do workflow ainda não pode escrever nelas.

Em cada uma das duas: `github.com/NobodyDe?tab=packages` → o pacote → **Package settings** → **Manage Actions access** → **Add repository** → `sondohub` → papel **Write**.

Sem isso, o job `deploy` falha no `push` com `denied: permission_denied`.

## 🛠️ Passo 5 — A pipeline (`.github/workflows/deploy.yml`)

```yaml
name: CI/CD

# Todo push na main (inclusive o merge de um PR) passa pelo portão e, se passar, vai para produção.
on:
  push:
    branches: [main]

# Um deploy por vez, e nunca interrompido no meio: o próximo espera na fila.
concurrency:
  group: producao
  cancel-in-progress: false

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      # Sem "version": a action lê o "packageManager" do package.json (pnpm@12.11.2).
      - uses: pnpm/action-setup@v6

      - uses: actions/setup-node@v6
        with:
          node-version: 24 # a mesma do Dockerfile
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # O client do Prisma é gerado, não vem no git, e a api não compila sem ele.
      # O "pnpm build" segue a ordem das dependências: contracts antes de client, server, api e hub.
      - name: Build
        run: |
          pnpm --filter api exec prisma generate
          pnpm build

      - run: pnpm lint

      - run: pnpm test

  deploy:
    needs: ci # só roda se o ci passou
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write # push das imagens no GHCR com o GITHUB_TOKEN
    steps:
      - uses: actions/checkout@v6

      - name: Login no GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # Pelo env, e não ${{ }} direto no script: o valor nunca vira texto de comando.
      - name: Chave SSH da VM
        env:
          SSH_KEY: ${{ secrets.VM_SSH_KEY }}
          KNOWN_HOSTS: ${{ secrets.VM_KNOWN_HOSTS }}
        run: |
          mkdir -p ~/.ssh
          printf '%s\n' "$SSH_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts

      # O compose recusa rodar sem o arquivo do env_file. O .env de verdade mora só na VM;
      # aqui um vazio basta, porque build e push não leem nenhuma variável dele.
      - name: .env vazio para o compose
        run: touch deploy/.env

      - name: Deploy
        shell: pwsh
        run: ./deploy/deploy.ps1 -Server root@4.249.16.228
```

**As escolhas, uma por uma:**

- **`concurrency` com `cancel-in-progress: false`:** dois merges seguidos não rodam dois deploys ao mesmo tempo, e o segundo não **mata** o primeiro no meio de um `up`. Na pipeline do Gêmeo está `true`, o que faz sentido para ele, que só copia arquivos. Aqui um deploy cortado pode deixar o `migrate` pela metade.
- **`permissions` só no `deploy`:** o `ci` fica com o mínimo padrão. Ele roda o código do repositório, então não precisa e não deve poder publicar imagem.
- **`touch deploy/.env`:** testado. Sem o arquivo, o `docker compose` para em `env file ... not found`, até para o `build`. Com um vazio, `config`, `build` e `push` funcionam. O `.env` da VM não é tocado: o `deploy.ps1` só copia o `docker-compose.yml`.
- **Por que a chave vai em `~/.ssh/id_ed25519`:** é o nome que o `ssh` e o `scp` procuram sozinhos. Assim o `deploy.ps1` não muda nada.

## 🛠️ Passo 6 — A regra nova do deploy

**A partir daqui, o deploy é só pela pipeline.** Dois motivos para não rodar mais o `deploy.ps1` do PC:

1. **O PC manda o que está na pasta**, commitado ou não (o problema da seção "Subir uma mudança" do `deploy/README.md`). A pipeline manda sempre um commit.
2. **Um deploy do PC enquanto a pipeline roda** faz os dois brigarem pelo mesmo `latest`, e não dá para saber qual ganhou.

O `deploy.ps1` continua no repositório: é o que a pipeline chama, e é o plano B se o GitHub estiver fora do ar.

**Proteja a `main`:** **Settings** → **Branches** → **Add rule** → `main` → **Require a pull request before merging** e **Require status checks to pass** (marque `ci`). Agora um push direto na `main`, que iria para produção sem revisão, nem é aceito.

---

## ✅ Checkpoint

| # | Faça | Esperado |
|---|---|---|
| 1 | Merge de um PR na `main` | Na aba **Actions**, `ci` verde e depois `deploy` verde |
| 2 | Abrir o job `deploy` → passo **Deploy** | O fim do `up -d --wait`: `api` **Healthy** e `hub` **Started** |
| 3 | `https://hub.sondotecnica.com` | A versão nova no ar |
| 4 | Um PR com um erro de tipo de propósito (um import sem uso no hub) | `ci` vermelho no PR, botão de merge bloqueado, e a VM intacta |
| 5 | Dois merges em sequência | O segundo `deploy` espera o primeiro terminar (**Pending**), em vez de cancelar |

---

## 🧯 Erros comuns

| Sintoma | Causa | Solução |
|---|---|---|
| `No test files found` no `pnpm test` | Faltou o `--passWithNoTests` | Passo 1 |
| `@prisma/client did not initialize yet` ou erro de tipo do Prisma no build | O `prisma generate` não rodou antes | Confira a ordem no passo **Build** |
| `denied: permission_denied` no `push` | O pacote do GHCR não liberou o repositório | Passo 4, nos **dois** pacotes |
| `Host key verification failed` | O `VM_KNOWN_HOSTS` está errado ou vazio, ou a VM foi recriada | Passo 2 de novo: a linha tirada do `/etc/ssh/ssh_host_ed25519_key.pub` da VM |
| `Permission denied (publickey)` | A pública não está no `authorized_keys` do root, ou o secret ficou sem a última linha | Passo 2; cole a privada inteira, com o `-----END ...-----` |
| `env file .../deploy/.env not found` | Faltou o passo do `touch` | Passo 5 |
| `deploy` falha no `up --wait` | É a VM: banco, `.env`, healthcheck | O log do passo mostra o mesmo que você veria no PC; os 🧯 Erros comuns do `deploy/README.md` valem igual |

---

## ⏳ O que ficou para depois (de propósito)

| Hoje | Quando mexer |
|---|---|
| As imagens são sempre `latest`, e voltar de versão exige um revert e um deploy novo | Quando um rollback precisar ser imediato: tag por commit (`:${{ github.sha }}`) e o compose da VM apontando para a tag |
| O build das imagens começa do zero a cada deploy | Se o deploy demorar demais: cache das camadas do Docker no GitHub (`cache-from: type=gha`) |
| O passo de teste ainda não testa nada | Assim que entrarem os specs da aula 08: eles já rodam aqui, sem mudar o workflow |
| O hub divide a VM e o `root` com o Gêmeo | Quando o hub deixar de ser provisório: VM própria, e a chave do GitHub só com acesso a ela |

> **Como esta aula foi validada (30/10/2026):**
> - **`pnpm lint`:** passa hoje (um aviso, nenhum erro).
> - **`pnpm test`:** falha hoje com `No test files found`, e por isso o Passo 1 existe.
> - **`.env` do compose:** testado. Sem o `deploy/.env`, o `docker compose` recusa até o `config`; com um vazio, o `config` e o `push --dry-run` passam.
> - **Não testado:** uma execução real no GitHub Actions, o push com `GITHUB_TOKEN` (depende do Passo 4) e o SSH do runner até a VM.
