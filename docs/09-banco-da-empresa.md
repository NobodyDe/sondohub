# 09 — Banco da empresa (Azure PostgreSQL)

> 🎯 **Objetivo:** criar as tabelas do SondoHub no PostgreSQL da empresa (Azure), no schema `sondohub`, e deixar a API pronta para usar esse banco.
>
> Comandos no **PowerShell**, a partir da raiz do repositório.

---

## 🧠 Conceito: o que vai do Docker para o Azure?

Um banco tem duas coisas diferentes: **estrutura** (tabelas, colunas, enum) e **dados** (linhas). Cada uma tem um caminho.

| | Vai do Docker para o Azure? | Como |
|---|---|---|
| **Estrutura** | Não se copia: **recria** | `prisma migrate deploy` roda as migrations do git no Azure |
| **Dados** | **Não vão** | No Azure você cria os dados reais (o primeiro Master e os apps) |

**Por que recriar a estrutura em vez de copiar o banco do Docker:**
- A fonte da verdade é a pasta `apps/api/prisma/migrations/` no **git**, não o seu Docker.
- O mesmo comando recria tudo em qualquer banco novo: sandbox hoje, produção amanhã.
- O Prisma registra cada migration aplicada na tabela `_prisma_migrations`. Assim, a próxima mudança de schema também chega ao Azure com um único `migrate deploy`.

**"Então eu rodo o SQL de novo?"** Sim, mas **quem roda é o Prisma**, não você colando SQL no DBeaver. Se você colar à mão, a `_prisma_migrations` fica vazia, e o próximo deploy tenta criar tudo de novo e quebra.

**Por que não copiar os dados:** o que existe no Docker é de teste. São usuários com a senha do seed, o app demo em `localhost` e sessões antigas. Nada disso deve existir no banco da empresa.

**Os dois ambientes:**

| Ambiente | Para quê | Migration | Dados |
|---|---|---|---|
| **Docker** | Desenvolver e testar | `pnpm db:migrate` (`migrate dev`) | `pnpm db:seed` |
| **Azure** | Ambiente compartilhado | `pnpm db:deploy` (`migrate deploy`) | Master e apps reais |

> ⚠️ **No Azure, nunca rode `migrate dev`, `migrate reset` nem `db push`.** O `migrate dev` cria um banco temporário e pode oferecer um *reset*, que apaga tudo. O `migrate deploy` só aplica o que ainda falta e não apaga nada.

---

## Seus dados de conexão

| Item | Valor |
|---|---|
| Host | `serverdb-flex-qgis.postgres.database.azure.com` |
| Porta | `5432` |
| Banco | `sondotecnica_sandbox` |
| Schema | `sondohub` |
| Usuário | `henrique.santos` |
| Senha | **fica fora do git** (no `.env` ou digitada no terminal) |
| SSL | Obrigatório no Azure |

**Por que um schema próprio:** o banco `sondotecnica_sandbox` é compartilhado. Com o schema `sondohub`, as tabelas `users`, `sessions` e as outras ficam separadas e não colidem com as de outros sistemas.

---

## 🛠️ Passo 1 — Libere o seu IP no Azure

O Azure bloqueia qualquer IP que não esteja liberado.

1. Portal do Azure → servidor **serverdb-flex-qgis** → **Rede** (*Networking*).
2. Clique em **Adicionar endereço IP do cliente atual** e depois em **Salvar**.

Teste a conexão:

```powershell
Test-NetConnection serverdb-flex-qgis.postgres.database.azure.com -Port 5432
```

Esperado: `TcpTestSucceeded : True`.

---

## 🛠️ Passo 2 — Crie o schema

No DBeaver ou no pgAdmin, conectado ao banco `sondotecnica_sandbox`:

```sql
CREATE SCHEMA IF NOT EXISTS sondohub;
```

O Prisma até criaria o schema sozinho. Criar à mão confirma, antes de qualquer migration, que a conexão funciona e que o seu usuário tem permissão.

---

## 🛠️ Passo 3 — Entenda a URL de conexão

```
postgresql://henrique.santos:<SENHA>@serverdb-flex-qgis.postgres.database.azure.com:5432/sondotecnica_sandbox?schema=sondohub&sslmode=require&connection_limit=5
```

| Parte | Por quê |
|---|---|
| `?schema=sondohub` | O Prisma cria e lê tudo dentro desse schema |
| `sslmode=require` | O Azure recusa conexões sem SSL |
| `connection_limit=5` | O Azure limita as conexões por plano, e o banco é compartilhado. O padrão do Prisma (`2 × CPUs + 1`) poderia ocupar demais |
| `<SENHA>` **codificada** | Se a senha tiver `@`, `#`, `/`, `:` ou `?`, a URL quebra. O `@` separa a senha do host, então `@` vira `%40` |

Você não precisa codificar a senha à mão: o Passo 5 faz isso com `[uri]::EscapeDataString`.

---

## 🛠️ Passo 4 — Scripts

No `package.json` da raiz, ao lado do `db:migrate`:

```json
"db:deploy": "pnpm --filter api exec prisma migrate deploy",
"db:status": "pnpm --filter api exec prisma migrate status"
```

---

## 🛠️ Passo 5 — Crie as tabelas no Azure

A URL do Azure fica **só nesta janela do terminal**. O seu `.env` continua apontando para o Docker.

```powershell
# A senha é digitada (não fica no histórico) e já sai codificada para a URL
$senha = [uri]::EscapeDataString((Read-Host "Senha do banco"))
$env:DATABASE_URL = "postgresql://henrique.santos:$senha@serverdb-flex-qgis.postgres.database.azure.com:5432/sondotecnica_sandbox?schema=sondohub&sslmode=require&connection_limit=5"

pnpm db:status    # confira na saída: host do Azure, banco sondotecnica_sandbox, schema "sondohub"
pnpm db:deploy
```

Saída esperada do `db:deploy`:

```
2 migrations found in prisma/migrations
Applying migration `20261016135855_init`
Applying migration `20261021185027_user_role`
All migrations have been successfully applied.
```

**Por que a variável do terminal vence o `.env`:** o `prisma.config.ts` carrega o `.env`, mas uma variável que já existe no terminal tem prioridade sobre o arquivo.

> A migration `user_role` roda com a tabela `users` vazia. O `UPDATE` dela não afeta nenhuma linha, e está tudo certo: o importante é que o enum e a coluna `role` são criados.

**Não feche o terminal:** o Passo 6 usa a mesma variável.

---

## 🛠️ Passo 6 — Dados iniciais

O `seed.ts` é só para o Docker. No Azure você cria só o que é real.

### 6.1 O primeiro Master

Crie `apps/api/prisma/create-master.ts`:

```ts
// Cria o primeiro Master (ou promove um usuário que já existe).
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const [email, name] = process.argv.slice(2);
const password = process.env.MASTER_PASSWORD;
if (!email || !name || !password)
  throw new Error('Uso: node prisma/create-master.ts <email> "<Nome>" (com MASTER_PASSWORD definida)');

const prisma = new PrismaClient();
const normalizedEmail = email.trim().toLowerCase();

await prisma.user.upsert({
  where: { email: normalizedEmail },
  update: { role: 'MASTER' },
  create: { email: normalizedEmail, name, role: 'MASTER', passwordHash: await argon2.hash(password) },
});

console.log(`Master pronto: ${normalizedEmail}`);
await prisma.$disconnect();
```

No **mesmo terminal** do Passo 5:

```powershell
$env:MASTER_PASSWORD = Read-Host "Senha do Master no hub"
pnpm --filter api exec node prisma/create-master.ts henrique.santos@sondotecnica.com.br "Henrique Santos"

# Terminou: limpe as variáveis
Remove-Item Env:MASTER_PASSWORD, Env:DATABASE_URL
```

O Prisma lê a `DATABASE_URL` do terminal, então o Master é criado no Azure, não no Docker.

### 6.2 Os aplicativos

No DBeaver, cadastre cada app com o endereço **real**. O `origin` é exatamente o que o navegador envia: protocolo, domínio e porta.

```sql
INSERT INTO sondohub.applications (id, slug, name, icon_url, url, origin, levels)
VALUES (
  gen_random_uuid(),
  'gemeo',
  'Gêmeo Digital',
  'https://<url-do-app>/favicon.svg',
  'https://<url-do-app>',
  'https://<url-do-app>',
  '[{"level":1,"label":"Leitura"},{"level":2,"label":"Gestor"}]'
);
```

> **Repare no `sondohub.` antes da tabela.** O DBeaver procura no schema `public` por padrão. Sem o prefixo, ele responde `relation "applications" does not exist`.

---

## 🛠️ Passo 7 — Apontar a API para o Azure

Quando quiser rodar a API contra o Azure, troque a `DATABASE_URL` no `.env` da raiz. Deixe as duas linhas no arquivo e comente a que não está em uso:

```dotenv
# Docker (dia a dia)
# DATABASE_URL=postgresql://sondohub:sondohub@localhost:5433/sondohub?schema=public

# Azure sandbox (senha CODIFICADA: @ vira %40)
DATABASE_URL=postgresql://henrique.santos:<SENHA_CODIFICADA>@serverdb-flex-qgis.postgres.database.azure.com:5432/sondotecnica_sandbox?schema=sondohub&sslmode=require&connection_limit=5
```

Para gerar a senha codificada: `[uri]::EscapeDataString('<sua senha>')`.

O `.env` já está no `.gitignore`, então a senha nunca vai para o GitHub. **Reinicie a API** depois de trocar a URL: o CORS lê os origins dos apps só quando ela sobe.

---

## ✅ Checkpoint

1. **Migrations em dia.** Num terminal com a URL do Azure (Passo 5):
   ```powershell
   pnpm db:status
   ```
   Esperado: `Database schema is up to date!`

2. **Tabelas no schema certo** (DBeaver):
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'sondohub' ORDER BY 1;
   -- _prisma_migrations, applications, sessions, user_app_access, users

   SELECT email, role FROM sondohub.users;
   -- henrique.santos@sondotecnica.com.br | MASTER
   ```

3. **Ponta a ponta:** com o `.env` apontando para o Azure, rode `pnpm dev`, entre no hub com o Master e abra `/admin/usuarios`.

---

## 🧯 Erros comuns

| Erro | Causa | Solução |
|---|---|---|
| `P1001: Can't reach database server` | O seu IP não está liberado no firewall do Azure | Passo 1. Se o seu IP mudou (outra rede ou VPN), libere de novo |
| `P1000: Authentication failed` | Senha errada, ou com `@` sem codificar | Use `[uri]::EscapeDataString` |
| `no pg_hba.conf entry ... no encryption` | Faltou o SSL na URL | Acrescente `sslmode=require` |
| `permission denied for database` | O seu usuário não pode criar schema | Um admin do servidor roda `GRANT CREATE ON DATABASE sondotecnica_sandbox TO "henrique.santos";` (as aspas são por causa do ponto no nome) |
| `P3005: The database schema is not empty` | O schema `sondohub` já tinha tabelas criadas à mão | Apague só o que você criou nesse schema, ou use um schema novo |
| `P3009: migrate found failed migrations` | Uma migration quebrou no meio | Corrija a causa, rode `pnpm --filter api exec prisma migrate resolve --rolled-back <nome>` e depois `pnpm db:deploy` de novo |
| `relation "users" does not exist` (no DBeaver) | A consulta está no schema `public` | Use o prefixo: `sondohub.users` |

---

## ⚠️ Regras que valem para sempre

- **Mudou o schema?** `pnpm db:migrate` no Docker → commit da migration → `pnpm db:deploy` no Azure. Sempre nessa ordem.
- **Nunca edite uma migration que já foi aplicada.** Mudou de ideia? Crie uma migration nova.
- **Backup do schema antes de cada deploy**, quando ele já tiver dados reais:
  ```powershell
  pg_dump -Fc -h serverdb-flex-qgis.postgres.database.azure.com -U henrique.santos -d sondotecnica_sandbox -n sondohub -f sondohub.dump
  ```
- **Senha nunca vai para o git.** Ela fica só no `.env`, ou é digitada no terminal.
- **Quando for para produção:** crie um usuário só da API, que apenas lê e grava dados, em vez de usar o seu usuário pessoal. Se a API for invadida, o atacante não consegue apagar tabelas.

⬅️ Voltar para o [índice](README.md)
