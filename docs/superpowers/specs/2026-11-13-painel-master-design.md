# Painel do Master — design

Data: 2026-11-13
Mockup aprovado: [docs/mockups/painel-master.html](../../mockups/painel-master.html)

## Intenção

O Master hoje só vê listas (usuários, catálogo). Não sabe quem usa o hub, quais apps são usados, nem quais contas estão paradas. O painel responde, numa tela só:

1. Quantos usuários cada aplicativo tem.
2. Quantos usuários foram incluídos no hub por período (contas criadas, `User.createdAt`; card "Novos usuários no hub").
3. Quantas inclusões em aplicativos houve por período ("projetos" = aplicativos do hub, `UserAppAccess`; confirmado pelo Master).
4. Quem mais e quem menos faz login.
5. Quem tem mais e menos sessões abertas.
6. Quais aplicativos são mais usados.
7. Quantos cliques cada aplicativo recebe no launcher.

Mais os indicadores acrescentados no design: usuários ativos, ativação, sessões abertas por dispositivo, mapa de calor de logins e contas que pedem atenção.

## Objetivos

- Uma página `/admin/painel`, só para MASTER, igual ao mockup aprovado (tema claro e escuro, filtro de período 7d/30d/90d/12m).
- Começar a registrar aberturas e cliques de aplicativos, que hoje não existem em lugar nenhum.
- Uma rota de leitura para o painel inteiro.

## Fora do escopo

- Cliques vindos do launcher do SDK (`packages/client/src/app-launcher.tsx`). Exige publicar nova versão do SDK e atualizar os apps. Fica para depois.
- Bloqueio de conta por senha errada (ver Ressalvas). É correção de segurança separada.
- Exportar dados, filtros por app ou por usuário, página "ver todos" com logins por usuário. O link "Ver todos" do ranking leva para a lista de usuários que já existe.
- Histórico de acessos removidos.

## Anti-objetivos

- Números inflados: renovação de token (a cada 10 min) não pode virar abertura.
- Painel lento ou que pesa no banco: nada de varrer tabelas sem índice.
- Dependência nova de gráficos no hub.
- Rastrear o usuário além do necessário: só usuário, app, tipo e horário. Nada de URL, IP ou conteúdo.

## Restrições

- NestJS + Prisma + Postgres na API; React + Tailwind + react-query no hub; tipos e schemas zod compartilhados em `@sondohub/contracts`.
- Guardas existentes: `SessionGuard` e `MasterGuard` (`apps/api/src/common/auth`).
- Cookie de sessão `sameSite: 'strict'`: o clique no hub vai pelo mesmo origin (`/api`), sem CORS.
- Datas agrupadas no fuso `America/Sao_Paulo`.
- Escala: ~160 usuários, ~6 apps.

## Abordagens consideradas (registro de uso dos apps)

| | Como | Troca | |
|---|---|---|---|
| A | Colunas `openCount` e `lastOpenedAt` em `UserAppAccess` | ~0,25 dia. Só total desde sempre: sem período, sem comparação, perde dado ao remover acesso | |
| **B** | **Tabela de eventos `app_events`** | **~0,75 dia. Qualquer período, comparação, tempo de uso e última atividade** | **escolhida** |
| C | Tabela com total por dia | Linhas limitadas, mas gravação mais complicada e sem hora. Não compensa nesta escala | |

O Master escolheu B. Para a leitura, uma rota única em vez de uma por card: ~12 consultas em paralelo respondem em milissegundos nesta escala, e uma rota por card seria mais código sem ganho.

## Design

### Schema (migration nova)

```prisma
model AppEvent {
  id            BigInt       @id @default(autoincrement())
  userId        String       @map("user_id") @db.Uuid
  applicationId String       @map("application_id") @db.Uuid
  type          AppEventType
  createdAt     DateTime     @default(now()) @map("created_at")
  lastSeenAt    DateTime     @default(now()) @map("last_seen_at")

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId, createdAt])
  @@index([userId, createdAt])
  @@map("app_events")
}

enum AppEventType {
  OPEN
  CLICK
}
```

`User` e `Application` ganham `events AppEvent[]`. `onDelete: Cascade` segue o resto do schema: apagar usuário apaga os eventos dele (os totais passados mudam; aceito).

### Registro de abertura (`OPEN`)

Em `SsoService.issueToken`, depois de conferir o acesso e antes de devolver o token:

- Busca o último `OPEN` daquele usuário naquele app.
- Se `lastSeenAt` foi há menos de 30 minutos, atualiza `lastSeenAt` para agora.
- Senão, cria um `OPEN` novo.

Uma "abertura" é então uma visita: começa no primeiro token e continua enquanto o app renova o token. `lastSeenAt - createdAt` é o tempo de uso aproximado. Falha ao gravar o evento não pode impedir a emissão do token: registrar com `catch` e log.

A janela de 30 minutos fica numa constante com comentário do porquê (3× o TTL do token).

### Registro de clique (`CLICK`)

- `POST /api/events/app-click`, `SessionGuard`, body `{ slug }` validado por zod. Resolve o app pelo slug; slug inexistente ou inativo → 204 sem gravar (não vaza quais apps existem). Responde 204.
- No hub, um helper compartilhado `trackAppClick(slug)` chama `navigator.sendBeacon('/api/events/app-click', blob JSON)`. O beacon não atrasa a navegação.
- Usado nos dois lugares do hub que abrem app: `AppCard` (`MainContent.tsx`) e a lista "Recentes" (`Sidebar.tsx`). Liga em `onClick` e `onAuxClick` (clique do meio / nova aba). "Clique" = qualquer abertura de app a partir do hub.
- Sem deduplicação: cada clique conta.

### Leitura do painel

`GET /api/admin/dashboard?period=7d|30d|90d|12m`, `SessionGuard` + `MasterGuard`. Módulo novo `dashboard` na API com controller, service e repository.

Janelas e agrupamento (no fuso `America/Sao_Paulo`):

| period | janela | barra |
|---|---|---|
| 7d | últimos 7 dias, incluindo hoje | dia |
| 30d | últimos 30 dias | dia |
| 90d | últimas 13 semanas | semana (segunda-feira) |
| 12m | últimos 12 meses, incluindo o atual | mês |

"Período anterior" = janela do mesmo tamanho logo antes. Séries vêm com todos os buckets, inclusive os zerados (`generate_series`).

Tipo de resposta (em `@sondohub/contracts`):

```ts
export const dashboardPeriodSchema = z.enum(["7d", "30d", "90d", "12m"]);
export const dashboardQuerySchema = z.object({ period: dashboardPeriodSchema.default("30d") });

type Bucket = { start: string; value: number };          // ISO da data local do bucket
type Ranked = { id: string; name: string; avatarUrl: string | null; role: UserRole; value: number };

export type AdminDashboard = {
  period: DashboardPeriod;
  users:      { active: number; total: number; createdByMonth: Bucket[] };      // 12 meses, card KPI
  logins:     { total: number; previous: number; series: Bucket[] };
  sessions:   { open: number; people: number; desktop: number; mobile: number };
  activation: { everLoggedIn: number; total: number };
  newUsers:   { series: Bucket[]; previous: number };
  appUsers:   { slug: string; name: string; users: number }[];
  grants:     { series: { start: string; bySlug: Record<string, number> }[]; previous: number };
  loginHeatmap: number[][];                               // [diaDaSemana 0=seg][hora 0..23]
  loginRanking:   { top: Ranked[]; bottom: Ranked[] };    // 6 cada; bottom inclui quem nunca entrou (value 0)
  sessionRanking: { top: Ranked[]; bottom: Ranked[] };
  appUsage: { slug: string; name: string; opens: number; previousOpens: number; clicks: number; previousClicks: number }[];
  attention: { inactive30d: number; withoutApps: number; deactivated: number };
};
```

De onde vem cada campo:

| Campo | Fonte |
|---|---|
| `users` | `User` (`isActive`, `createdAt`) |
| `logins` | `Session.createdAt` na janela (cada login cria uma sessão) |
| `sessions` | `Session` com `revokedAt IS NULL AND expiresAt > now()`; dispositivo por regex `/Mobi\|Android\|iPhone\|iPad/` no `userAgent` |
| `activation` | usuários com pelo menos uma `Session` / total |
| `newUsers` | `User.createdAt` |
| `appUsers` | `UserAppAccess` agrupado por app (apps ativos) |
| `grants` | `UserAppAccess.grantedAt` |
| `loginHeatmap` | `Session.createdAt` na janela, `extract(isodow/hour)` em `America/Sao_Paulo` |
| `loginRanking` | `Session` na janela agrupado por usuário, com `LEFT JOIN` para incluir zeros; só usuários ativos |
| `sessionRanking` | sessões abertas por usuário; só usuários ativos |
| `appUsage` | `AppEvent` por tipo e app, janela atual e anterior |
| `attention.inactive30d` | ativos cuja última atividade (maior entre último `Session.createdAt` e último `AppEvent.lastSeenAt`) é anterior a 30 dias, ou que nunca entraram |
| `attention.withoutApps` | ativos sem nenhum `UserAppAccess` |
| `attention.deactivated` | `isActive = false` |

Consultas com agrupamento por data e mapa de calor usam `prisma.$queryRaw` (com template tag, nunca string montada). O resto usa `groupBy`/`count`.

As janelas e a lista de buckets são calculadas em TypeScript, numa função pura (`periodWindow(period, now)` → início, fim, início do anterior, lista de buckets). O SQL só devolve as linhas agrupadas (`date_trunc` no fuso) e o TypeScript preenche os buckets zerados. Assim os limites e os zeros têm teste unitário sem banco real (a pasta `apps/api/test` está vazia e os testes atuais usam Prisma mockado). Dia, semana e mês correntes contam, mesmo incompletos.

### Hub

Pedido do Master: código simples e fácil de manter; uma pasta `dashboard` dentro de `apps/hub/src/features/admin/`, com a página completa em `pages/` e um arquivo por componente em `components/`. Segue o padrão de `admin/users`:

```
apps/hub/src/features/admin/dashboard/
  pages/dashboard-page.tsx        página: período, consulta e grade de cards
  use-dashboard.ts                useQuery do painel (igual a users/use-users-page.ts)
  components/
    DashboardCard.tsx             moldura comum: ícone, título, subtítulo, ações, conteúdo
    SegmentedControl.tsx          botões de escolha (período, Mais/Menos, Aberturas/Cliques)
    BarChart.tsx                  barras simples ou empilhadas (novos usuários e inclusões)
    ActiveUsersCard.tsx
    LoginsCard.tsx
    OpenSessionsCard.tsx
    ActivationCard.tsx
    NewUsersCard.tsx
    AppUsersCard.tsx
    AppUsageCard.tsx              radar + tabela de aberturas e cliques
    AppRadar.tsx                  só o desenho do radar
    GrantsCard.tsx
    LoginHeatmapCard.tsx
    UserRankingCard.tsx           ranking reaproveitado para logins e para sessões
    AttentionCard.tsx
```

Componente só vira arquivo próprio quando tem responsabilidade própria. Linha e medidor, usados uma vez cada, ficam dentro do card que os usa.

- Rota `painel` em `apps/hub/src/features/admin/routes.tsx`; vira o `index` do `/admin` (o Master cai no painel).
- Item "Painel" no topo de `ADMIN_ITEMS` em `Sidebar.tsx`.
- `hubApi.dashboard(period)` em `apps/hub/src/lib/api.ts`; `useQuery` com `staleTime` de 5 minutos e o período na `queryKey`.
- Gráficos em SVG próprio, portados do mockup (barras, barras empilhadas, linha, medidor, radar, mapa de calor). Sem biblioteca nova.
- Cores, sombra, textura e degradê viram tokens em `apps/hub/src/index.css` (os do mockup mapeiam para os que já existem: `--g-sky`, `--primary`, etc.).
- Links do card "Contas que pedem atenção": "Conceder acesso" → `/admin/usuarios?filtro=no-apps`; "Ver lista" (desativadas) → `/admin/usuarios?filtro=inactive`. A lista de usuários passa a ler `filtro` da URL como filtro inicial (hoje o filtro é só estado local). "Sem login há mais de 30 dias" fica sem link nesta versão: exigiria filtro novo na API.
- Estados: carregando (esqueleto dos cards), erro (mensagem e botão para tentar de novo), vazio (ex.: radar sem eventos ainda mostra "Ainda não há aberturas registradas. Os dados aparecem conforme a equipe usa os aplicativos.").

### Testes

- `SsoService`: cria `OPEN` na primeira emissão; só atualiza `lastSeenAt` dentro de 30 min; cria novo depois de 30 min; erro ao gravar não impede o token.
- Clique: slug válido grava; slug inválido não grava e devolve 204; sem sessão → 401.
- Dashboard service: limites de janela por período, buckets zerados, ranking `bottom` com quem nunca entrou.
- Rota do painel recusa quem não é MASTER.

## Decisões tomadas (calls do Claude, não discutidas)

- Linha "Bloqueadas por senha errada" sai do card de atenção, porque o bloqueio não está implementado e mostraria sempre 0.
- Coluna "Conversão" sai da tabela do radar: cliques do SDK e favoritos do navegador ficam fora, e o número passaria de 100%. Ficam aberturas e cliques.
- `/admin` passa a abrir no painel, não mais na lista de usuários.
- Janela de deduplicação de 30 minutos.
- Cliques contam no card de app e na lista "Recentes", inclusive clique do meio.
- Buckets calculados em TypeScript, não em `generate_series`, para serem testáveis sem banco.
- Links do card de atenção: dois apontam para filtros que já existem; "sem login há 30 dias" fica sem link.

## Ressalvas

- **Bloqueio por senha errada não funciona:** `UsersRepository.saveLoginAttempts` existe mas nunca é chamado, e `AuthService.login` não confere `lockedUntil`. Tratar fora deste trabalho.
- **Inclusões removidas somem:** remover acesso apaga a linha de `UserAppAccess`, então o gráfico de inclusões conta só os acessos que ainda existem.
- **`Session.lastUsedAt` nunca é atualizado:** por isso a atividade usa login e `AppEvent`, não esse campo.
- **Logins dependem de sessões nunca apagadas.** Se um dia entrar limpeza de sessões vencidas, o histórico de logins encurta.
- O radar começa vazio: aberturas e cliques só passam a existir depois do deploy.

## Fica para quem constrói

- Nome exato dos arquivos e divisão interna do módulo `dashboard`, seguindo o padrão de `users` (controller, service, repository).
- Forma exata das consultas SQL.
- Divisão dos componentes do painel no hub.
- Ordem das pontas no radar (no mockup: nomes longos no topo e embaixo).
