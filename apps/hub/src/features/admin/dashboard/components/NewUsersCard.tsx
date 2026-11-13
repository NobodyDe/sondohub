import type { AdminDashboard, DashboardPeriod } from "@sondohub/contracts";
import { UserPlus } from "lucide-react";
import { bucketLabels } from "../format.ts";
import BarChart from "./BarChart.tsx";
import DashboardCard from "./DashboardCard.tsx";
import HeadlineTotal from "./HeadlineTotal.tsx";

type NewUsersCardProps = {
  newUsers: AdminDashboard["newUsers"];
  period: DashboardPeriod;
  className?: string;
};

/** Contas criadas no hub em cada dia, semana ou mês do período. */
export default function NewUsersCard({ newUsers, period, className }: NewUsersCardProps) {
  const total = newUsers.series.reduce((sum, bucket) => sum + bucket.value, 0);

  return (
    <DashboardCard
      icon={UserPlus}
      title="Novos usuários no hub"
      subtitle="Contas criadas por período"
      actions={<HeadlineTotal total={total} previous={newUsers.previous} />}
      className={className}
    >
      <BarChart
        label="Novos usuários por período"
        labels={bucketLabels(newUsers.series.map((bucket) => bucket.start), period)}
        series={[{ name: "Novos usuários", color: "", values: newUsers.series.map((bucket) => bucket.value) }]}
        formatTooltip={(_, value) => `${value} novos usuários`}
      />
    </DashboardCard>
  );
}
