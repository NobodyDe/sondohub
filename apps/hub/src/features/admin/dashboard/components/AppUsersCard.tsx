import type { AdminDashboard } from "@sondohub/contracts";
import { LayoutGrid } from "lucide-react";
import { appColor, formatNumber } from "../format.ts";
import DashboardCard from "./DashboardCard.tsx";

type AppUsersCardProps = {
  apps: AdminDashboard["appUsers"];
  /** Base da porcentagem: usuários ativos no hub. */
  activeUsers: number;
  withoutApps: number;
  className?: string;
};

/** Quantos usuários têm acesso a cada aplicativo hoje. */
export default function AppUsersCard({ apps, activeUsers, withoutApps, className }: AppUsersCardProps) {
  const share = (users: number) => (activeUsers ? Math.round((users / activeUsers) * 100) : 0);

  return (
    <DashboardCard icon={LayoutGrid} title="Usuários por aplicativo" subtitle="Quem tem acesso hoje" className={className}>
      <ul className="mt-4 grid gap-3">
        {apps.map((app, index) => (
          <li key={app.slug} className="grid grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-1.5 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <i className="size-[9px] shrink-0 rounded-[3px]" style={{ background: appColor(index) }} />
              <span className="truncate">{app.name}</span>
            </span>
            <span className="font-bold tabular-nums">
              {formatNumber(app.users)}{" "}
              <small className="font-medium text-muted-foreground">{share(app.users)}%</small>
            </span>
            <span className="col-span-2 h-1.5 overflow-hidden rounded bg-muted">
              <b className="block h-full rounded" style={{ width: `${share(app.users)}%`, background: appColor(index) }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-3.5 text-[12.5px] text-muted-foreground">
        {withoutApps
          ? `${formatNumber(withoutApps)} usuários ainda sem nenhum aplicativo`
          : "Todos os usuários têm algum aplicativo"}
      </p>
    </DashboardCard>
  );
}
