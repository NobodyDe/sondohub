import type { AdminDashboard } from "@sondohub/contracts";
import { Radar } from "lucide-react";
import { useState } from "react";
import { appColor, formatNumber } from "../format.ts";
import AppRadar from "./AppRadar.tsx";
import DashboardCard from "./DashboardCard.tsx";
import SegmentedControl from "./SegmentedControl.tsx";

type Metric = "opens" | "clicks";

type AppUsageCardProps = { apps: AdminDashboard["appUsage"]; className?: string };

const METRICS = [
  { value: "opens" as const, label: "Aberturas" },
  { value: "clicks" as const, label: "Cliques" },
];

/** Radar de uso por app (aberturas ou cliques) e a tabela com os dois números. */
export default function AppUsageCard({ apps, className }: AppUsageCardProps) {
  const [metric, setMetric] = useState<Metric>("opens");
  const hasData = apps.some((app) => app.opens || app.clicks || app.previousOpens || app.previousClicks);
  const items = apps.map((app) => ({
    slug: app.slug,
    name: app.name,
    value: metric === "opens" ? app.opens : app.clicks,
    previous: metric === "opens" ? app.previousOpens : app.previousClicks,
  }));

  return (
    <DashboardCard
      icon={Radar}
      title="Uso por aplicativo"
      subtitle="Longe do centro, mais acessos"
      actions={
        hasData && <SegmentedControl label="Medida" options={METRICS} value={metric} onChange={setMetric} size="sm" />
      }
      className={className}
    >
      {hasData ? (
        <>
          <AppRadar items={items} unit={metric === "opens" ? "aberturas" : "cliques"} />
          <div className="mt-0.5 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="h-[3px] w-4 rounded bg-(--grad-b)" />
              Este período
            </span>
            <span className="flex items-center gap-1.5">
              <i className="w-4 border-t-2 border-dashed border-ink-placeholder" />
              Período anterior
            </span>
          </div>
          <UsageTable apps={apps} />
        </>
      ) : (
        <p className="my-auto py-10 text-center text-sm text-muted-foreground">
          Ainda não há aberturas registradas. Os dados aparecem conforme a equipe usa os aplicativos.
        </p>
      )}
    </DashboardCard>
  );
}

function UsageTable({ apps }: { apps: AdminDashboard["appUsage"] }) {
  return (
    <table className="mt-3.5 w-full text-[12.5px] tabular-nums">
      <thead>
        <tr className="text-muted-foreground">
          <th className="pb-1.5 text-left font-semibold">Aplicativo</th>
          <th className="pb-1.5 text-right font-semibold">Aberturas</th>
          <th className="pb-1.5 text-right font-semibold">Cliques</th>
        </tr>
      </thead>
      <tbody>
        {apps.map((app, index) => (
          <tr key={app.slug} className="border-t border-line-divider text-ink-body">
            <td className="py-[7px] font-semibold text-foreground">
              <i className="mr-2 inline-block size-2 rounded-[2px]" style={{ background: appColor(index) }} />
              {app.name}
            </td>
            <td className="text-right">{formatNumber(app.opens)}</td>
            <td className="text-right">{formatNumber(app.clicks)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
