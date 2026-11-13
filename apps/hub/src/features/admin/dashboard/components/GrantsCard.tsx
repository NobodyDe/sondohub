import type { AdminDashboard, DashboardPeriod } from "@sondohub/contracts";
import { KeyRound } from "lucide-react";
import { appColor, bucketLabels } from "../format.ts";
import BarChart from "./BarChart.tsx";
import DashboardCard from "./DashboardCard.tsx";
import HeadlineTotal from "./HeadlineTotal.tsx";

type GrantsCardProps = {
  grants: AdminDashboard["grants"];
  /** Define a ordem e a cor de cada app, igual aos outros cards. */
  apps: AdminDashboard["appUsers"];
  period: DashboardPeriod;
  className?: string;
};

/** Acessos a aplicativos concedidos em cada bucket, empilhados por app. */
export default function GrantsCard({ grants, apps, period, className }: GrantsCardProps) {
  const series = apps.map((app, index) => ({
    name: app.name,
    color: appColor(index),
    values: grants.series.map((bucket) => bucket.bySlug[app.slug] ?? 0),
  }));
  const total = series.reduce((sum, s) => sum + s.values.reduce((a, b) => a + b, 0), 0);

  return (
    <DashboardCard
      icon={KeyRound}
      title="Inclusões em aplicativos"
      subtitle="Acessos concedidos por período, por aplicativo"
      actions={<HeadlineTotal total={total} previous={grants.previous} />}
      className={className}
    >
      <BarChart
        label="Inclusões em aplicativos por período"
        labels={bucketLabels(grants.series.map((bucket) => bucket.start), period)}
        series={series}
        formatTooltip={(name, value) => `${name}: ${value}`}
      />
      <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] text-ink-body">
        {apps.map((app, index) => (
          <li key={app.slug} className="flex items-center gap-1.5">
            <i className="size-[9px] rounded-[3px]" style={{ background: appColor(index) }} />
            {app.name}
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
