# 17 — Os níveis do Gêmeo viram os papéis dele

> 🎯 **Objetivo:** a permissão escolhida no card do Gêmeo, na tela do usuário, é o que chega ao Gêmeo como `role`.
>
> | Hoje | Depois desta aula |
> |---|---|
> | O card do Gêmeo tem 2 níveis: Leitura e Gestor | 3 níveis: Usuário, Administrador e Master |
> | O Gêmeo recebe o **cargo do hub** (`user.role`) e ignora o nível escolhido no card | Recebe o nível do card traduzido: 1 → `USER`, 2 → `ADMIN`, 3 → `MASTER` |
> | Trocar o cargo do hub muda o papel no Gêmeo | O cargo do hub e o papel no Gêmeo são independentes |

**Antes de começar:** esta aula parte do código que ainda não foi commitado: o módulo `modules/gemeo/`, a URL `/sondohub/users` e o debounce da tela do usuário. Ele vai junto no mesmo PR.

---

## 🧠 Diagnóstico: o que vai para o Gêmeo hoje

Ao mudar o acesso de alguém ao Gêmeo, saem **duas** requisições, e cada uma tem um corpo diferente:

```
navegador ──PUT /api/admin/users/:id/apps/gemeo  { "level": 2 }──▶ API do hub
API do hub ──PUT /sondohub/users/:id  { "role": user.role }──▶ Gêmeo
```

O `{ "level": 2 }` que aparece no DevTools é a primeira requisição, do navegador para o hub. O Gêmeo nunca recebe o número. Ele recebe o `role`, só que o role errado: o `AdminUsersService` manda o **cargo do hub** (`user.role`, o que você escolhe no "Cargo"), e não a permissão escolhida no card do Gêmeo.

**Por que isso é grave:** no Gêmeo, `MASTER` vê **todos** os contratos (`listContratosByUser`, em `src/models/contratos.ts`). Hoje, um Master do hub com acesso "Leitura" ao Gêmeo vira `MASTER` lá dentro.

---

## 🧠 Conceito: quem traduz o nível para o role

O hub fala em **números**, e o Gêmeo fala em **palavras**:

- **Do lado do hub,** o nível é um número de 1 a N. É ele que vai no token, e os apps comparam `level >= 2`. O `appLevelsSchema`, nos contracts, obriga a sequência 1, 2, 3…
- **Do lado do Gêmeo,** a rota aceita só `USER`, `ADMIN` ou `MASTER`.

A tradução fica **na fronteira**, ou seja, no `GemeoClient`. O resto do hub continua falando em número, e só quem conversa com o Gêmeo precisa saber a língua dele.

**Alternativas descartadas:**

| Alternativa | Por que não |
|---|---|
| Gravar `"USER"` dentro do JSON `levels` | O formato `{ level, label }` é o mesmo para todos os apps e é o que vai no token. Mudar o formato por causa de um app quebraria o contrato de todos. |
| Mandar o `label` ("Master") como role | O label é texto de tela, e o Master pode renomeá-lo no catálogo de apps. Trocar "Master" por "Total" quebraria o Gêmeo sem nenhum aviso. |
| Usar o tipo `UserRole` do hub | Os nomes coincidem, mas os conceitos são diferentes. Se o hub ganhar um cargo novo, os papéis do Gêmeo não mudam. Por isso o Gêmeo ganha o próprio tipo, `GemeoRole`. |

Os dois lados usam a mesma regra, **número maior = mais permissão**, então a tradução é direta: 1 → `USER`, 2 → `ADMIN`, 3 → `MASTER`.

---

## 🛠️ Passo 1 — A migration (só dados)

**Por que uma migration, e não a tela do catálogo:** o código do Passo 3 depende de o nível 3 existir. A migration vai no mesmo commit que esse código. No deploy, o container `migrate` aplica a migration antes de a API nova subir, então código e dados nunca ficam desencontrados. E a mudança fica registrada no git.

**Crie a pasta à mão. Não rode `pnpm db:migrate`.** O `DATABASE_URL` do `.env` da raiz aponta para o Azure, que é o mesmo banco da produção. O `migrate dev` precisa de um banco "sombra" e, se encontrar diferença, oferece um reset que apaga os dados (veja o aviso no `deploy/README.md`). Nesta migration isso nem é necessário: o `schema.prisma` não muda, só uma linha da tabela.

Crie `apps/api/prisma/migrations/20261104120000_gemeo_levels_roles/migration.sql`:

```sql
-- O Gêmeo Digital passa a ter os 3 papéis que a API dele aceita.
-- O número continua sendo o que vai no token; quem traduz para USER, ADMIN e MASTER é o GemeoClient.
-- Quem já tinha acesso não muda de número: 1 (Leitura) vira Usuário e 2 (Gestor) vira Administrador.
UPDATE "applications"
SET "levels" = '[
  { "level": 1, "label": "Usuário" },
  { "level": 2, "label": "Administrador" },
  { "level": 3, "label": "Master" }
]'::jsonb
WHERE "slug" = 'gemeo';
```

- **Nenhuma linha de `user_app_access` muda.** Quem estava no nível 1 continua no 1, que agora se chama Usuário. O mesmo vale para o 2, que agora se chama Administrador.
- **Ninguém vira Master sozinho.** O nível 3 é novo, e dar acesso total aos contratos tem que ser uma decisão explícita.
- **Num banco vazio, o `UPDATE` não encontra a linha e não faz nada.** Quem cria o app num banco de dev é o seed (Passo 2).

---

## 🛠️ Passo 2 — O seed (`apps/api/prisma/seed.ts`)

Para um banco de dev novo nascer igual à produção:

```ts
// Os 3 papéis do Gêmeo: o GemeoClient traduz 1 → USER, 2 → ADMIN, 3 → MASTER.
const gemeo = await upsertApp('gemeo', 'Gêmeo Digital', 'http://localhost:5173', [
  { level: 1, label: 'Usuário' },
  { level: 2, label: 'Administrador' },
  { level: 3, label: 'Master' },
]);
```

---

## 🛠️ Passo 3 — A tradução no `GemeoClient` (`apps/api/src/modules/gemeo/gemeo-client.ts`)

Três mudanças:

**1. Os imports.** Sai o `UserRole` e entra o `BadRequestException`:

```ts
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { env } from '../../config/env.js';
```

**2. O tipo e a tabela de tradução**, logo abaixo do `TIMEOUT_MS`:

```ts
/** Os papéis que a rota do Gêmeo aceita. Têm o mesmo nome do cargo do hub, mas são do Gêmeo. */
type GemeoRole = 'USER' | 'ADMIN' | 'MASTER';

/** Nível do app gemeo (applications.levels) → role do Gêmeo. Número maior = mais permissão, dos dois lados. */
const ROLE_BY_LEVEL: Record<number, GemeoRole | undefined> = {
  1: 'USER',
  2: 'ADMIN',
  3: 'MASTER',
};
```

**3. O `upsertUser` passa a receber o nível:**

```ts
  /** Traduz o nível do hub para o role do Gêmeo. O PUT dele é upsert: cria o usuário ou troca o role. */
  async upsertUser(id: string, level: number): Promise<void> {
    const role = ROLE_BY_LEVEL[level];
    // O painel de apps deixa criar um 4º nível; sem papel equivalente, o Gêmeo recusaria com 400.
    if (!role)
      throw new BadRequestException('Esse nível não existe no Gêmeo Digital.');

    if (!(await this.send('PUT', id, { role })))
      throw new BadGatewayException(
        'O Gêmeo Digital não respondeu. Nada foi salvo; tente de novo.',
      );
  }
```

- **Por que o `| undefined` no `Record`:** sem ele, o TypeScript acha que `ROLE_BY_LEVEL[4]` é um `GemeoRole`, e o `if (!role)` pareceria inútil. O `undefined` declarado faz o tipo dizer a verdade: nem todo número tem um papel.
- **Por que conferir antes do `fetch`:** sem a conferência, um nível 4 viraria `{}` no corpo. O Gêmeo responderia 400, e o painel mostraria "não respondeu", o que é mentira. Com a conferência, o erro é claro, nenhuma requisição sai e, como o Gêmeo vem antes do banco, nada é gravado.

O `deleteUser` e o `send` não mudam.

---

## 🛠️ Passo 4 — Quem chama (`apps/api/src/modules/users/admin-users.service.ts`)

**`create`:** manda o nível do Gêmeo, e não o cargo.

```ts
    // Antes
    if (apps.some((app) => app.slug === GEMEO_SLUG))
      await this.gemeo.upsertUser(id, data.role);

    // Depois
    const gemeoGrant = apps.find((app) => app.slug === GEMEO_SLUG);
    if (gemeoGrant) await this.gemeo.upsertUser(id, gemeoGrant.level);
```

O `some` vira `find` porque agora não basta saber **se** o Gêmeo foi liberado. É preciso saber **com que nível**.

**`update`:** o cargo do hub não vai mais para o Gêmeo. O método volta a ser o que era antes da integração:

```ts
  async update(
    actorId: string,
    id: string,
    input: UpdateUserInput,
  ): Promise<AdminUserDetail> {
    assertNotSelf(actorId, id);
    await this.getDetail(id); // 404 claro, em vez do erro do Prisma ao atualizar quem não existe.
    await this.users.update(id, input);
    return this.getDetail(id);
  }
```

**`setAppLevel`:** manda o nível que acabou de ser escolhido. O `const user` some, porque o cargo não é mais necessário aqui:

```ts
    await this.getDetail(id); // sem isso, um id inexistente estoura a chave estrangeira (500).
    const app = await this.findApp(slug);
    assertLevelExists(app.levels as AppLevel[], level);
    if (slug === GEMEO_SLUG) await this.gemeo.upsertUser(id, level);
```

O `removeApp`, o `remove` e a função `hasGemeoAccess` ficam como estão: o `remove` ainda usa a `hasGemeoAccess`.

---

## 🛠️ Passo 5 — `user-detail-page.tsx`: nada muda (e por quê)

A tela não sabe quais níveis o Gêmeo tem. Ela os **recebe** e só repassa o número escolhido:

1. O `GET /api/admin/users/:id` devolve cada app com os `levels` lidos do banco (`findDetail` no `users.repository.ts`).
2. O `AppAccessList` desenha um botão para cada nível dessa lista.
3. O `changeAppLevel` manda `{ level }`, com a chave de debounce `app:gemeo`.

Depois da migration, o card do Gêmeo mostra as 3 opções sozinho, e quem traduz o número é a API. É a vantagem de a tela ser guiada pelos dados: o catálogo mudou no banco e a tela acompanhou, sem deploy de front.

Duas coisas continuam valendo:

- **Ligar o switch começa no nível 1, que agora é `USER`** (`lowestLevel`, em `user-access.ts`). Liberar mais acesso continua sendo um clique a mais, de propósito.
- **O "Cargo" (`RolePicker`) continua sendo só do hub.** Ele decide quem entra no painel de administração e não mexe mais no Gêmeo.

A tela de **novo usuário** usa o mesmo `AppAccessList` e também não muda.

---

## 🚀 Passo 6 — Deploy, nesta ordem

1. **O Gêmeo já está pronto.** O `PUT /sondohub/users/:id` está no ar e responde `401` sem chave.
2. **Confira a chave no `.env` da VM.** O comando abaixo deve mostrar `1`:

   ```bash
   ssh root@4.249.16.228 "grep -c '^GDS_APY_KEY=.' /opt/sondohub/.env"
   ```

3. **Abra um PR** com a migration, o código desta aula e o código ainda não commitado (módulo `gemeo`, URL e debounce). Esta aula fica fora: a pasta `docs/` está no `.gitignore`.
4. **Faça o merge.** O CI aplica a migration (container `migrate`) e só depois sobe a API nova.

---

## 🛠️ Passo 7 — Quem já tinha acesso (só se houver alguém)

> **Em 04/11/2026 este passo foi pulado:** não havia ninguém com acesso ao Gêmeo para acertar. O script fica aqui para o dia em que precisar.

Até aqui, ninguém do hub chegou ao Gêmeo. A URL antiga (`/users`) caía no ChirpStack, que responde 200, então o hub achava que tinha sincronizado. Quem recebeu acesso ao Gêmeo antes deste deploy não está na `usuarios_sondohub`.

Crie `apps/api/prisma/sync-gemeo.ts`. Ele fica na pasta `prisma/` pelo mesmo motivo do `create-master.ts` (aula 09): tudo o que está em `prisma/` vai junto na imagem.

```ts
// Uma vez só, depois do deploy: manda ao Gêmeo quem já tinha acesso antes da sincronização funcionar.
// Na VM:  cd /opt/sondohub && docker compose run --rm api node prisma/sync-gemeo.ts
import { PrismaClient } from '@prisma/client';
// O client compilado, o mesmo que a API usa: URL, chave e tradução nível → role num lugar só.
import { GEMEO_SLUG, GemeoClient } from '../dist/modules/gemeo/gemeo-client.js';

const prisma = new PrismaClient();
const gemeo = new GemeoClient();

const accesses = await prisma.userAppAccess.findMany({
  where: { application: { slug: GEMEO_SLUG } },
  select: { userId: true, level: true },
});

// Um por vez: o primeiro erro para o script, com o motivo no log. O PUT é upsert, então rodar de novo é seguro.
for (const { userId, level } of accesses) {
  await gemeo.upsertUser(userId, level);
  console.log(`ok ${userId} (nível ${level})`);
}

console.log(`${accesses.length} usuário(s) enviados ao Gêmeo.`);
await prisma.$disconnect();
```

- **Por que importar do `dist`, e não reescrever o `fetch`:** a URL, a chave e a tabela `ROLE_BY_LEVEL` continuam existindo num lugar só. O `GemeoClient` não tem dependências no construtor, então um `new` funciona fora do Nest.
- **No editor,** o import do `dist` só é reconhecido depois de um `pnpm --filter api build`. Na imagem o `dist` já existe, e é lá que o script roda.

Na VM, depois do deploy:

```bash
cd /opt/sondohub && docker compose run --rm api node prisma/sync-gemeo.ts
```

---

## ✅ Checkpoint

| # | Faça | Esperado |
|---|---|---|
| 1 | Admin → um usuário → card do Gêmeo | Três opções: **Usuário**, **Administrador** e **Master** |
| 2 | Ligue o Gêmeo para alguém | Fica em **Usuário**. No banco do Gêmeo, `SELECT role FROM gemeo_digital_hotel_fairmonte.usuarios_sondohub WHERE id = '<uuid>'` devolve `USER` |
| 3 | Troque para **Master** | O `role` vira `MASTER`, e a pessoa passa a ver todos os contratos no Gêmeo |
| 4 | Troque o **Cargo** do hub dessa pessoa | O `role` no Gêmeo **não** muda |
| 5 | Desligue o Gêmeo | A linha some da `usuarios_sondohub` (e os vínculos com contratos vão junto) |
| 6 | `docker compose logs api \| grep GemeoClient` (na VM) | Nada. Se aparecer `falhou`, o motivo vem na linha de baixo |

---

## 🧯 Erros comuns

| Sintoma | Causa | Solução |
|---|---|---|
| "Não deu para salvar" e `HTTP 401` no log | O `GDS_APY_KEY` da VM é diferente do `SONDOHUB_API_KEY` do Gêmeo | Passo 6, item 2; depois `docker compose up -d` |
| `400 Esse nível não existe no Gêmeo Digital.` | Alguém criou um 4º nível no catálogo de apps | Tire o nível no catálogo, ou acrescente o papel equivalente no `ROLE_BY_LEVEL` |
| O card ainda mostra Leitura e Gestor | A migration não rodou | `docker compose logs migrate` na VM |
| O `sync-gemeo.ts` para no meio | O Gêmeo recusou ou não respondeu: o motivo está logo acima no log | Corrija e rode de novo; quem já foi é sobrescrito com o mesmo valor |

---

## ⏳ O que ficou para depois (de propósito)

| Hoje | Quando mexer |
|---|---|
| A tradução depende da **posição** do nível. Renomear um label no catálogo é seguro; trocar o significado (chamar o nível 2 de "Master") manda `ADMIN` | Se isso acontecer, travar a edição dos níveis do Gêmeo no catálogo |
| Só o Gêmeo traduz nível em papel | Se um segundo app precisar de um papel em texto, aí sim vale um campo próprio no JSON `levels`. Com dois casos, o padrão já é conhecido |
| O hub aceita qualquer 2xx do Gêmeo como sucesso | Se o nginx da VM voltar a desviar uma rota, a falha fica silenciosa de novo: conferir se o PUT devolveu JSON |

> **Como esta aula foi validada (04/11/2026):**
> - **Migration:** aplicada num Postgres 18 descartável, depois das 4 migrations do repositório. Resultado `UPDATE 1`: só a linha do `gemeo` mudou, e o JSON segue a regra 1, 2, 3.
> - **Passos 3 e 4:** aplicados numa cópia do código. O typecheck do build e o lint passaram, e 9 testes passaram:
>   - 1 → `USER`, 2 → `ADMIN`, 3 → `MASTER`, com a URL `/sondohub/users` e o `x-api-key`;
>   - nível 4 dá 400 sem chamar o Gêmeo;
>   - o `create` manda o nível do card, e não o cargo;
>   - trocar o cargo não chama o Gêmeo;
>   - uma falha do Gêmeo não grava nada no banco.
>
>   Depois, os arquivos voltaram ao que eram.
> - **Passo 7:** o build gera `dist/modules/gemeo/gemeo-client.js`, o import dele funciona e o `new GemeoClient()` funciona fora do Nest. O script **não** rodou contra o banco nem contra o Gêmeo de verdade.
> - **Não testado:** a tela de ponta a ponta, porque o hub de dev usa o banco de produção.

⬅️ Voltar para o [índice](README.md)
