import type { AdminDashboard } from "@sondohub/contracts";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatNumber } from "../format.ts";
import BigNumber from "./BigNumber.tsx";
import DashboardCard from "./DashboardCard.tsx";

type ActiveUsersCardProps = { users: AdminDashboard["users"]; className?: string };

/** Contas habilitadas, com as contas criadas mês a mês nos últimos 12 meses (o mês atual em destaque). */
export default function ActiveUsersCard({ users, className }: ActiveUsersCardProps) {
  const max = Math.max(1, ...users.createdByMonth.map((month) => month.value));
  const lastIndex = users.createdByMonth.length - 1;

  return (
    <DashboardCard icon={Users} title="Usuários ativos" subtitle="Contas habilitadas no hub" className={className}>
      <BigNumber value={formatNumber(users.active)} note={`de ${formatNumber(users.total)} cadastrados`} />
      <div className="mt-auto flex h-[38px] items-end gap-[3px] pt-3" aria-hidden>
        {users.createdByMonth.map((month, index) => (
          <i
            key={month.start}
            title={`${month.start.slice(0, 7)}: ${month.value} novos`}
            className={cn(
              "min-h-[3px] flex-1 rounded-[3px]",
              index === lastIndex ? "bg-linear-to-t from-(--grad-a) to-(--grad-b)" : "bg-muted",
            )}
            style={{ height: `${(month.value / max) * 100}%` }}
          />
        ))}
      </div>
    </DashboardCard>
  );
}
