# Painel do Master — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/admin/painel` só para MASTER, igual ao mockup aprovado, com registro novo de aberturas e cliques de aplicativos.

**Architecture:** A API ganha a tabela `app_events`, um `AppEventsService` (chamado pelo SSO e por uma rota de clique) e um módulo `dashboard` com uma rota de leitura que monta o painel inteiro. O hub ganha `features/admin/dashboard/` com a página em `pages/` e um arquivo por componente em `components/`, com gráficos em SVG próprio portados do mockup.

**Tech Stack:** NestJS 11, Prisma + Postgres, zod (`@sondohub/contracts`), vitest; React 19, react-query, react-router, Tailwind 4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-13-painel-master-design.md` (ler junto). Mockup: `docs/mockups/painel-master.html` (fonte do visual e do desenho dos gráficos).

## Global Constraints

- Código simples, fácil de manter (pedido do Master): uma responsabilidade por função e por arquivo, sem abstração para um uso só, comentário só para o porquê.
- Nenhuma dependência nova no hub nem na API.
- Toda contagem em `$queryRaw` sai com `::int` (o Postgres devolve `bigint`, que o `JSON.stringify` não serializa).
- `$queryRaw` sempre com template tag (`Prisma.sql`), nunca string montada.
- Datas no fuso `America/Sao_Paulo`. As colunas são `timestamp(3)` em UTC, então a expressão local é `(col AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')`.
- Rotas do painel com `@UseGuards(SessionGuard, MasterGuard)`; rota de clique com `SessionGuard`.
- Janela de deduplicação de abertura: 30 minutos (3× o TTL de 10 min do token).
- Rankings: 6 pessoas em `top` e 6 em `bottom`, só usuários ativos.
- Textos da interface em português, iguais ao mockup.
- Trabalhar na branch `feat/painel-master` (o repositório está em `main`). Commits só com o OK do Master.

## Review Focus

1. **Renovação de token com o app aberto** (a cada 10 min): não pode criar abertura nova. Teste na Task 2.
2. **Login perto da meia-noite**: um login às 23h30 de São Paulo conta no dia local, não no dia seguinte em UTC. Teste na Task 4 (`bucketKeyOf`).
3. **Banco vazio** (sem sessões nem eventos, logo depois do deploy): a API devolve zeros e o hub mostra estado vazio, nunca `NaN` (ativação com total 0, radar com máximo 0). Testes nas Tasks 5 e 9.
4. **Usuário desativado e app inativo**: ficam fora dos rankings, de `appUsers` e de `appUsage`. Teste na Task 5.
5. **Falha ao gravar evento**: o token do SSO continua sendo emitido. Teste na Task 2.

---

### Task 1: Tabela `app_events`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration gerada em `apps/api/prisma/migrations/<timestamp>_app_events/`

**Interfaces:**
- Produces: modelo Prisma `AppEvent` e enum `AppEventType { OPEN CLICK }`, exatamente como na seção "Schema" do spec; `events AppEvent[]` em `User` e `Application`.

- [ ] **Step 1:** Criar a branch: `git switch -c feat/painel-master`.
- [ ] **Step 2:** Adicionar o modelo e o enum do spec ao `schema.prisma`.
- [ ] **Step 3:** Subir o banco e gerar a migration: `pnpm db:up` e depois `pnpm --filter api exec prisma migrate dev --name app_events`. Esperado: migration criada e "Your database is now in sync".
- [ ] **Step 4:** `pnpm --filter api build`. Esperado: sem erros.
- [ ] **Step 5: Commit** — `feat(api): tabela app_events para aberturas e cliques`

---

### Task 2: Registrar abertura no SSO

**Files:**
- Create: `apps/api/src/modules/events/app-events.service.ts`
- Create: `apps/api/src/modules/events/app-events.service.spec.ts`
- Create: `apps/api/src/modules/events/events.module.ts`
- Modify: `apps/api/src/modules/sso/sso.service.ts`, `apps/api/src/modules/sso/sso.module.ts`
- Create: `apps/api/src/modules/sso/sso.service.spec.ts`

**Interfaces:**
- Produces:
  - `AppEventsService.recordOpen(userId: string, applicationId: string, now?: Date): Promise<void>`
  - `OPEN_DEDUP_MS = 30 * 60 * 1000` (exportada)
  - `EventsModule` exporta `AppEventsService`
- `AppEventsService` usa o `PrismaService` direto, como o `SessionsService`.

- [ ] **Step 1: Testes que falham** em `app-events.service.spec.ts`, com Prisma mockado como em `users.repository.spec.ts`:
  - `cria OPEN quando não há abertura anterior`: `appEvent.findFirst` → `null`; espera `appEvent.create` com `{ data: { userId, applicationId, type: 'OPEN' } }`.
  - `só atualiza lastSeenAt dentro de 30 min`: último `OPEN` com `lastSeenAt = now - 29min`; espera `appEvent.update({ where: { id }, data: { lastSeenAt: now } })` e nenhum `create`.
  - `cria OPEN novo depois de 30 min`: `lastSeenAt = now - 31min`; espera `create`.
- [ ] **Step 2:** `pnpm --filter api test app-events`. Esperado: FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `recordOpen`. `findFirst` com `where: { userId, applicationId, type: 'OPEN' }`, `orderBy: { lastSeenAt: 'desc' }`, `select: { id, lastSeenAt }`.
- [ ] **Step 4:** `pnpm --filter api test app-events`. Esperado: PASS.
- [ ] **Step 5: Testes que falham** em `sso.service.spec.ts` (mocks de `AppsRepository`, `TokenService`, `AppEventsService`):
  - `registra a abertura ao emitir o token`: espera `recordOpen(user.id, app.id)`.
  - `emite o token mesmo se registrar a abertura falhar`: `recordOpen` rejeita; `issueToken` resolve com `accessToken`.
- [ ] **Step 6:** Rodar e ver falhar. Depois, em `SsoService.issueToken`, chamar `recordOpen` depois de conferir o acesso, com `.catch` que só registra no `Logger` do Nest. Importar `EventsModule` no `SsoModule`.
- [ ] **Step 7:** `pnpm --filter api test`. Esperado: PASS.
- [ ] **Step 8: Commit** — `feat(api): registra abertura de app na emissão do token`

---

### Task 3: Rota de clique

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/modules/events/app-events.service.ts`, `app-events.service.spec.ts`, `events.module.ts`
- Create: `apps/api/src/modules/events/app-events.controller.ts`

**Interfaces:**
- Consumes: `AppsRepository.findBySlug(slug)` (existe; conferir `isActive`). `EventsModule` importa `AppsModule` e `SessionsModule` (o `SessionGuard` precisa do `SessionsService`).
- Produces:
  - contracts: `appClickSchema = z.object({ slug: z.string().min(1) })` e `type AppClickInput`
  - `AppEventsService.recordClick(userId: string, slug: string): Promise<void>`
  - `POST /api/events/app-click` → 204

- [ ] **Step 1: Testes que falham:**
  - `grava CLICK para app ativo`: `findBySlug` → `{ id: 'a1', isActive: true }`; espera `appEvent.create` com `type: 'CLICK'`.
  - `ignora slug inexistente ou app inativo`: `null` e `{ isActive: false }`; espera nenhum `create`, sem erro.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar `recordClick` e o controller (`@Controller('events')`, `@Post('app-click')`, `@HttpCode(204)`, `ZodValidationPipe(appClickSchema)`, `@CurrentAuth()`). Rebuild do contracts: `pnpm --filter "@sondohub/contracts" build`.
- [ ] **Step 4:** `pnpm --filter api test`. Esperado: PASS.
- [ ] **Step 5: Commit** — `feat(api): rota de clique em aplicativo`

---

### Task 4: Contrato do painel e janelas de período

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/modules/dashboard/period-window.ts`
- Create: `apps/api/src/modules/dashboard/period-window.spec.ts`

**Interfaces:**
- Produces (contracts): `dashboardPeriodSchema`, `dashboardQuerySchema`, `DashboardPeriod`, `DashboardBucket`, `DashboardRankedUser`, `AdminDashboard`, exatamente como no spec ("Tipo de resposta"), com estes nomes: `Bucket` → `DashboardBucket`, `Ranked` → `DashboardRankedUser`.
- Produces (API, `period-window.ts`):

```ts
export type BucketUnit = 'day' | 'week' | 'month';
export type PeriodWindow = {
  start: Date;          // início da janela atual (meia-noite local do 1º bucket)
  end: Date;            // agora
  previousStart: Date;  // janela anterior = [previousStart, start)
  unit: BucketUnit;
  buckets: string[];    // 'YYYY-MM-DD' local do início de cada bucket, em ordem
};
export function periodWindow(period: DashboardPeriod, now: Date): PeriodWindow;
export function bucketKeyOf(date: Date, unit: BucketUnit): string;   // data local do bucket que contém `date`
export function fillBuckets(buckets: string[], rows: { bucket: string; value: number }[]): DashboardBucket[];
```

`// shortcut: fuso fixo -03:00 (Brasil sem horário de verão desde 2019); usar Intl se voltar a ter.`

- [ ] **Step 1: Testes que falham** (`now = new Date('2026-11-13T15:00:00Z')`, quinta):
  - `7d`: `unit 'day'`, 7 buckets, primeiro `'2026-11-07'`, último `'2026-11-13'`, `start` = `2026-11-07T03:00:00Z`.
  - `30d`: 30 buckets diários terminando em `'2026-11-13'`.
  - `90d`: `unit 'week'`, 13 buckets, último `'2026-11-09'` (segunda), primeiro `'2026-08-17'`.
  - `12m`: `unit 'month'`, 12 buckets de `'2025-12-01'` a `'2026-11-01'`.
  - `previousStart` tem a mesma duração da janela atual (`start - previousStart === end - start` para `7d`).
  - `bucketKeyOf(new Date('2026-11-14T02:30:00Z'), 'day') === '2026-11-13'` (23h30 em São Paulo).
  - `fillBuckets(['a','b','c'], [{ bucket: 'b', value: 4 }])` → `[{start:'a',value:0},{start:'b',value:4},{start:'c',value:0}]`.
- [ ] **Step 2:** `pnpm --filter api test period-window`. Esperado: FAIL.
- [ ] **Step 3:** Implementar. Funções pequenas: uma para o início local do dia, uma para recuar por unidade, `periodWindow` só compõe.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5: Commit** — `feat(api): contrato do painel e janelas de período`

---

### Task 5: Leitura do painel na API

**Files:**
- Create: `apps/api/src/modules/dashboard/dashboard.repository.ts`
- Create: `apps/api/src/modules/dashboard/dashboard.service.ts`
- Create: `apps/api/src/modules/dashboard/dashboard.service.spec.ts`
- Create: `apps/api/src/modules/dashboard/admin-dashboard.controller.ts`
- Create: `apps/api/src/modules/dashboard/dashboard.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `periodWindow`, `fillBuckets` (Task 4); `AdminDashboard` (contracts).
- Produces: `GET /api/admin/dashboard?period=` → `AdminDashboard`; `DashboardService.get(period: DashboardPeriod, now?: Date): Promise<AdminDashboard>`.
- `DashboardRepository`: um método por consulta, cada um devolvendo linhas cruas já com números (`::int`). Nomes:
  - `countUsers(): Promise<{ active: number; total: number; everLoggedIn: number; deactivated: number; withoutApps: number }>`
  - `usersCreatedBy(unit, from, to): Promise<{ bucket: string; value: number }[]>`, `countUsersCreated(from, to): Promise<number>`
  - `loginsBy(unit, from, to)` (mesmo formato), `countLogins(from, to): Promise<number>`
  - `openSessionsUserAgents(): Promise<{ userId: string; userAgent: string | null }[]>`
  - `usersPerApp(): Promise<{ slug: string; name: string; users: number }[]>`
  - `grantsBy(unit, from, to): Promise<{ bucket: string; slug: string; value: number }[]>`, `countGrants(from, to): Promise<number>`
  - `loginHeatmap(from, to): Promise<{ dow: number; hour: number; value: number }[]>`
  - `loginCountPerUser(from, to): Promise<DashboardRankedUser[]>` (usuários ativos, `LEFT JOIN`, zeros incluídos)
  - `openSessionsPerUser(): Promise<DashboardRankedUser[]>` (mesmo critério)
  - `appEventsPerApp(from, to): Promise<{ slug: string; name: string; type: 'OPEN' | 'CLICK'; value: number }[]>` (só apps ativos)
  - `inactiveSince(cutoff: Date): Promise<number>` (última atividade = maior entre último login e último `lastSeenAt`; nunca entrou conta)
- Bucket no SQL: `to_char(date_trunc(${unit}, <expressão local>), 'YYYY-MM-DD')`, com a expressão local das Global Constraints. Dia da semana: `extract(isodow …)::int - 1`.
- Campos "anterior" (`logins.previous`, `newUsers.previous`, `grants.previous`, `appUsage.previous*`) usam a janela `[previousStart, start)`. `users.createdByMonth` usa `usersCreatedBy('month', periodWindow('12m', now).start, now)`, independente do período escolhido.
- `DashboardService` só compõe: chama o repositório em `Promise.all`, preenche buckets, separa `top`/`bottom` (ordenar e pegar 6), conta dispositivo por `/Mobi|Android|iPhone|iPad/` e `people` por `userId` distinto, monta `loginHeatmap` 7×24 com zeros.

- [ ] **Step 1: Testes que falham** em `dashboard.service.spec.ts` (repositório mockado, `now` fixo):
  - `preenche buckets vazios com zero` em `newUsers.series` (30 itens para `30d`).
  - `ranking bottom inclui quem nunca entrou`: `loginCountPerUser` devolve 8 usuários, dois com 0; `loginRanking.bottom[0].value === 0` e `top.length === 6`.
  - `separa computador e celular`: 3 sessões, uma com `iPhone`; `sessions` = `{ open: 3, people: 2, desktop: 2, mobile: 1 }` (dois `userId` distintos).
  - `banco vazio devolve zeros`: todos os métodos devolvem `[]`/zeros; `loginHeatmap` é 7×24 de zeros e `appUsage` é `[]`.
  - `junta aberturas e cliques por app`: linhas OPEN e CLICK da janela atual e da anterior viram um item com `opens`, `previousOpens`, `clicks`, `previousClicks`.
- [ ] **Step 2:** `pnpm --filter api test dashboard`. Esperado: FAIL.
- [ ] **Step 3:** Implementar repositório, serviço, controller (`@Controller('admin/dashboard')`, `ZodValidationPipe(dashboardQuerySchema)`) e módulo (importa `SessionsModule`); registrar `DashboardModule` em `AppModule`.
- [ ] **Step 4:** `pnpm --filter api test`. Esperado: PASS.
- [ ] **Step 5: Verificação contra o banco** (o SQL não tem teste unitário): `pnpm db:seed`, `pnpm --filter api dev`, entrar como master pelo hub e abrir `/api/admin/dashboard?period=30d` no navegador. Esperado: JSON com todos os campos do `AdminDashboard`, números sem aspas. Entrar como `leitor@sondotecnica.com.br` e repetir. Esperado: 403.
- [ ] **Step 6: Commit** — `feat(api): rota de leitura do painel do master`

---

### Task 6: Estrutura da página no hub

**Files:**
- Modify: `apps/hub/src/index.css` (tokens do mockup: `--grad-a`, `--grad-b`, `--dot`, `--edge`, `--card-shadow`, nos dois temas, reaproveitando os existentes quando o valor é o mesmo)
- Modify: `apps/hub/src/lib/api.ts` (`dashboard: (period: DashboardPeriod) => request<AdminDashboard>(\`/admin/dashboard?period=${period}\`)`)
- Create: `apps/hub/src/features/admin/dashboard/use-dashboard.ts`
- Create: `apps/hub/src/features/admin/dashboard/pages/dashboard-page.tsx`
- Create: `apps/hub/src/features/admin/dashboard/components/DashboardCard.tsx`
- Create: `apps/hub/src/features/admin/dashboard/components/SegmentedControl.tsx`
- Modify: `apps/hub/src/features/admin/routes.tsx` (rota `painel`; `index` redireciona para `painel`)
- Modify: `apps/hub/src/features/launcher/components/Sidebar.tsx` (item "Painel", ícone `LayoutDashboard`, primeiro de `ADMIN_ITEMS`)

**Interfaces:**
- Produces:
  - `useDashboard(period: DashboardPeriod)` → resultado do `useQuery` com `queryKey: ['admin-dashboard', period]`, `staleTime: 5 * 60_000`, `placeholderData: keepPreviousData` (trocar de período não pisca)
  - `DashboardCard({ icon: LucideIcon; title: string; subtitle?: string; actions?: ReactNode; className?: string; children: ReactNode })` — moldura com sombra, textura de pontos e fio de luz do mockup
  - `SegmentedControl<T extends string>({ label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' })` — botões com `aria-pressed`
  - `DashboardPage`: estado do período (padrão `'30d'`), título "Painel", subtítulo "Como a equipe está usando o SondoHub", grade de 12 colunas do mockup. Carregando: cards vazios com `animate-pulse`. Erro: "Não foi possível carregar o painel." e botão "Tentar de novo" (`refetch`).

- [ ] **Step 1:** Implementar os arquivos acima. Os cards da grade ficam como `DashboardCard` vazios com o título certo, para conferir a grade.
- [ ] **Step 2:** `pnpm --filter hub build` e `pnpm --filter hub lint`. Esperado: sem erros.
- [ ] **Step 3:** `pnpm dev`, entrar como master, abrir `/admin`. Esperado: cai em `/admin/painel`, sidebar mostra "Painel" ativo, grade igual ao mockup em 1440px, nos dois temas.
- [ ] **Step 4: Commit** — `feat(hub): página do painel com grade e moldura dos cards`

---

### Task 7: Cards de número (KPIs)

**Files:**
- Create em `apps/hub/src/features/admin/dashboard/components/`: `ActiveUsersCard.tsx`, `LoginsCard.tsx`, `OpenSessionsCard.tsx`, `ActivationCard.tsx`
- Modify: `pages/dashboard-page.tsx`

**Interfaces:**
- Consumes: `DashboardCard`; campos `users`, `logins`, `sessions`, `activation` de `AdminDashboard`.
- Cada card recebe só o pedaço que usa (ex.: `LoginsCard({ logins, periodLabel }: { logins: AdminDashboard['logins']; periodLabel: string })`).
- Formatação: `Intl.NumberFormat('pt-BR')` numa constante do arquivo que usa. Variação: `Math.round((total / previous - 1) * 100)`; com `previous === 0` não mostra a variação.
- `ActivationCard`: com `total === 0` mostra "0%" e o arco vazio.
- A linha do `LoginsCard` e o arco do `ActivationCard` ficam dentro de cada card (um uso cada), com o degradê `--grad-a` → `--grad-b`.

- [ ] **Step 1:** Implementar e ligar na página.
- [ ] **Step 2:** `pnpm --filter hub build` e `lint`. Esperado: sem erros.
- [ ] **Step 3:** No navegador, conferir os 4 cards com o mockup e trocar o período (o card de logins muda).
- [ ] **Step 4: Commit** — `feat(hub): cards de número do painel`

---

### Task 8: Gráficos de barras e usuários por app

**Files:**
- Create em `components/`: `BarChart.tsx`, `NewUsersCard.tsx`, `GrantsCard.tsx`, `AppUsersCard.tsx`
- Modify: `pages/dashboard-page.tsx`

**Interfaces:**
- `BarChart({ labels: string[]; series: { name: string; color: string; values: number[] }[]; formatTooltip: (seriesName: string, value: number) => string })`. Uma série = barras com degradê; várias = empilhadas com as cores dadas. Largura medida com `ResizeObserver`. Desenho, grade tracejada e rótulos como `barChart` do mockup.
- Cores dos apps: `--app-1` … `--app-6` no `index.css` (valores `--a1`…`--a6` do mockup), atribuídas pela ordem de `appUsers`. A função `appColor(index: number): string` fica em `BarChart.tsx` e é exportada (usada também em `AppUsersCard` e `AppUsageCard`).
- Rótulos do eixo X: `'day'` → `dd/MM` a cada 5 barras (todas no `7d`, com dia da semana abreviado); `'week'` → `dd/MM` a cada 2; `'month'` → mês abreviado (`Intl.DateTimeFormat('pt-BR', { month: 'short' })`).

- [ ] **Step 1:** Implementar e ligar na página.
- [ ] **Step 2:** `build` e `lint` do hub. Esperado: sem erros.
- [ ] **Step 3:** No navegador, trocar entre os 4 períodos: número de barras 7/30/13/12, legenda de inclusões com as cores certas, sem barra cortada.
- [ ] **Step 4: Commit** — `feat(hub): gráficos de barras do painel`

---

### Task 9: Radar de uso por aplicativo

**Files:**
- Create em `components/`: `AppRadar.tsx`, `AppUsageCard.tsx`
- Modify: `pages/dashboard-page.tsx`

**Interfaces:**
- `AppRadar({ items: { name: string; value: number; previous: number }[]; unit: string })`. Geometria do mockup: `viewBox 0 0 440 345`, centro `(220, 172)`, `R = 120`, `r0 = 24`, raio `r0 + (R - r0) * sqrt(v / max)`, curva fechada Catmull-Rom com fator `1/4.5`, anéis em 25/50/75/100%, rótulos a `R + 12`. Com `max === 0` todos os pontos ficam em `r0` (sem `NaN`).
- Funções puras no próprio arquivo: `radarPoint(index, count, radius)` e `closedCurvePath(points)`.
- `AppUsageCard({ apps: AdminDashboard['appUsage'] })`: `SegmentedControl` Aberturas/Cliques, radar, legenda "Este período"/"Período anterior", tabela com Aplicativo, Aberturas e Cliques (sem coluna de conversão). Com `apps` vazio ou tudo zero: só o texto "Ainda não há aberturas registradas. Os dados aparecem conforme a equipe usa os aplicativos."
- Animação de desenho da curva só na primeira renderização, desligada com `motion-reduce`.

- [ ] **Step 1:** Implementar e ligar na página.
- [ ] **Step 2:** `build` e `lint` do hub. Esperado: sem erros.
- [ ] **Step 3:** No navegador: banco recém-migrado mostra o estado vazio. Abrir o App Demo pelo hub duas vezes em menos de 30 min e recarregar o painel: uma abertura, dois cliques. Alternar Aberturas/Cliques.
- [ ] **Step 4: Commit** — `feat(hub): radar de uso por aplicativo`

---

### Task 10: Mapa de calor, rankings e contas que pedem atenção

**Files:**
- Create em `components/`: `LoginHeatmapCard.tsx`, `UserRankingCard.tsx`, `AttentionCard.tsx`
- Modify: `pages/dashboard-page.tsx`
- Modify: `apps/hub/src/features/admin/users/pages/users-list-page.tsx` (filtro inicial vindo de `?filtro=`)

**Interfaces:**
- `LoginHeatmapCard({ heatmap: number[][] })`: 7×24, opacidade proporcional ao máximo; rodapé com o pico ("Pico às terças, das 8h às 9h"), ou nada se tudo for zero.
- `UserRankingCard({ icon, title, subtitle, ranking: { top: DashboardRankedUser[]; bottom: DashboardRankedUser[] }, footer: ReactNode })`: `SegmentedControl` Mais/Menos; usa o `UserAvatar` que já existe; valor 0 em logins aparece como "nunca". Usado duas vezes na página (logins e sessões).
- `AttentionCard({ attention: AdminDashboard['attention'] })`: três linhas do spec; "Conceder acesso" → `/admin/usuarios?filtro=no-apps`, "Ver lista" → `/admin/usuarios?filtro=inactive`; "Sem login há mais de 30 dias" sem link.
- `users-list-page.tsx`: `useState<UserFilterId>(() => filtro válido de useSearchParams() ou 'all')`, validado com `userFilterSchema.safeParse`.

- [ ] **Step 1:** Implementar e ligar na página.
- [ ] **Step 2:** `build` e `lint` do hub. Esperado: sem erros.
- [ ] **Step 3:** No navegador: alternar Mais/Menos nos dois rankings; clicar "Conceder acesso" abre a lista já filtrada em "sem apps"; `?filtro=xyz` cai em "todos".
- [ ] **Step 4: Commit** — `feat(hub): mapa de calor, rankings e contas que pedem atenção`

---

### Task 11: Registrar clique no hub

**Files:**
- Create: `apps/hub/src/features/launcher/track-app-click.ts`
- Modify: `apps/hub/src/features/launcher/components/MainContent.tsx` (`AppCard`)
- Modify: `apps/hub/src/features/launcher/components/Sidebar.tsx` (`RecentApps`)

**Interfaces:**
- Consumes: `POST /api/events/app-click` (Task 3).
- Produces: `trackAppClick(slug: string): void` — `navigator.sendBeacon('/api/events/app-click', new Blob([JSON.stringify({ slug })], { type: 'application/json' }))`.
- Ligado em `onClick` e `onAuxClick` dos links.

- [ ] **Step 1:** Implementar e ligar.
- [ ] **Step 2:** `build` e `lint` do hub. Esperado: sem erros.
- [ ] **Step 3:** No navegador, com a aba de rede aberta: clicar num app do launcher e num app de "Recentes" (e clique do meio). Esperado: `POST /api/events/app-click` com 204 em cada um; o painel soma os cliques.
- [ ] **Step 4: Commit** — `feat(hub): registra clique em aplicativo no launcher`

---

### Task 12: Verificação final

- [ ] **Step 1:** `pnpm build`, `pnpm lint` e `pnpm test` na raiz. Esperado: tudo verde.
- [ ] **Step 2:** No navegador, `/admin/painel` em 1440px e 375px, temas claro e escuro, os 4 períodos. Esperado: igual ao mockup no desktop, uma coluna no celular, sem rolagem horizontal.
- [ ] **Step 3:** Usuário que não é master abrindo `/admin/painel`: redireciona para `/`.
- [ ] **Step 4:** Deploy precisa rodar `pnpm db:deploy` antes de subir a API nova (migration da Task 1).
