import type { AdminDashboard, DashboardPeriod } from "@sondohub/contracts";
import { BarChart3, Layers } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import ActivationCard from "../components/ActivationCard.tsx";
import ActiveUsersCard from "../components/ActiveUsersCard.tsx";
import AppUsageCard from "../components/AppUsageCard.tsx";
import AppUsersCard from "../components/AppUsersCard.tsx";
import AttentionCard from "../components/AttentionCard.tsx";
import GrantsCard from "../components/GrantsCard.tsx";
import LoginHeatmapCard from "../components/LoginHeatmapCard.tsx";
import LoginsCard from "../components/LoginsCard.tsx";
import NewUsersCard from "../components/NewUsersCard.tsx";
import OpenSessionsCard from "../components/OpenSessionsCard.tsx";
import SegmentedControl from "../components/SegmentedControl.tsx";
import UserRankingCard from "../components/UserRankingCard.tsx";
import { useDashboard } from "../use-dashboard.ts";

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "12m", label: "12 meses" },
];

const PERIOD_LABEL: Record<DashboardPeriod, string> = {
  "7d": "Nos últimos 7 dias",
  "30d": "Nos últimos 30 dias",
  "90d": "Nos últimos 90 dias",
  "12m": "Nos últimos 12 meses",
};

// Larguras da grade de 12 colunas: no celular tudo ocupa a linha inteira.
const KPI = "col-span-12 sm:col-span-6 xl:col-span-3";
const WIDE = "col-span-12 xl:col-span-8";
const NARROW = "col-span-12 xl:col-span-4";

/** Painel do Master: escolhe o período, busca os dados e distribui pelos cards. */
export function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const dashboard = useDashboard(period);

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl font-extrabold tracking-tight">Painel</h1>
          <p className="text-[15px] text-muted-foreground">Como a equipe está usando o SondoHub</p>
        </div>
        <SegmentedControl label="Período" options={PERIODS} value={period} onChange={setPeriod} />
      </header>

      {dashboard.data ? (
        <DashboardGrid data={dashboard.data} />
      ) : dashboard.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-border p-6">
          <p className="text-danger-text">Não foi possível carregar o painel.</p>
          <button
            type="button"
            onClick={() => dashboard.refetch()}
            className="h-10 rounded-[10px] bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-110"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <LoadingGrid />
      )}
    </div>
  );
}

/** Usa data.period, não o botão escolhido: enquanto o novo período carrega, a tela ainda mostra os dados do anterior. */
function DashboardGrid({ data }: { data: AdminDashboard }) {
  const { period } = data;
  const periodLabel = PERIOD_LABEL[period];

  return (
    <section className="grid grid-cols-12 gap-3.5">
      <ActiveUsersCard users={data.users} className={KPI} />
      <LoginsCard logins={data.logins} periodLabel={periodLabel} className={KPI} />
      <OpenSessionsCard sessions={data.sessions} className={KPI} />
      <ActivationCard activation={data.activation} className={KPI} />

      <NewUsersCard newUsers={data.newUsers} period={period} className={WIDE} />
      <AppUsersCard
        apps={data.appUsers}
        activeUsers={data.users.active}
        withoutApps={data.attention.withoutApps}
        className={NARROW}
      />

      <AppUsageCard apps={data.appUsage} className={`${NARROW} xl:row-span-2`} />
      <GrantsCard grants={data.grants} apps={data.appUsers} period={period} className={WIDE} />
      <LoginHeatmapCard heatmap={data.loginHeatmap} className={WIDE} />

      <UserRankingCard
        icon={BarChart3}
        title="Logins por usuário"
        subtitle={periodLabel}
        ranking={data.loginRanking}
        zeroLabel="nunca"
        footer={
          <Link to="/admin/usuarios" className="font-semibold text-link no-underline hover:underline">
            Ver todos os usuários
          </Link>
        }
        className={NARROW}
      />
      <UserRankingCard
        icon={Layers}
        title="Sessões por usuário"
        subtitle="Abertas agora, por pessoa"
        ranking={data.sessionRanking}
        footer="Muitas sessões abertas pode ser conta compartilhada"
        className={NARROW}
      />
      <AttentionCard attention={data.attention} className={NARROW} />
    </section>
  );
}

/** Esqueleto com as mesmas proporções da grade, para a tela não pular quando os dados chegam. */
function LoadingGrid() {
  const cards = [KPI, KPI, KPI, KPI, WIDE, NARROW, WIDE, NARROW];
  return (
    <section className="grid grid-cols-12 gap-3.5" aria-busy="true" aria-label="Carregando painel">
      {cards.map((width, index) => (
        <div
          key={index}
          className={`${width} animate-pulse rounded-2xl border border-border bg-muted ${index < 4 ? "h-40" : "h-72"}`}
        />
      ))}
    </section>
  );
}
