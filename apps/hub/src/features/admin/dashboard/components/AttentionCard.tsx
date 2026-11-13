import type { AdminDashboard } from "@sondohub/contracts";
import { TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils.ts";
import { formatNumber } from "../format.ts";
import DashboardCard from "./DashboardCard.tsx";

type AttentionCardProps = { attention: AdminDashboard["attention"]; className?: string };

type Row = { label: string; count: number; tone?: string; link?: { to: string; text: string } };

/** Contas para revisar. Os links abrem a lista de usuários já filtrada. */
export default function AttentionCard({ attention, className }: AttentionCardProps) {
  const rows: Row[] = [
    { label: "Sem login há mais de 30 dias", count: attention.inactive30d, tone: "text-favorite" },
    {
      label: "Sem nenhum aplicativo",
      count: attention.withoutApps,
      link: { to: "/admin/usuarios?filtro=no-apps", text: "Conceder acesso" },
    },
    {
      label: "Desativadas",
      count: attention.deactivated,
      link: { to: "/admin/usuarios?filtro=inactive", text: "Ver lista" },
    },
  ];

  return (
    <DashboardCard
      icon={TriangleAlert}
      title="Contas que pedem atenção"
      subtitle="Para revisar acessos"
      className={className}
    >
      <ul className="mt-3.5">
        {rows.map((row) => (
          <li
            key={row.label}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 border-t border-line-divider py-[11px] first:border-t-0"
          >
            <span>
              <strong className="block text-[13px] font-semibold">{row.label}</strong>
              {row.link && (
                <Link to={row.link.to} className="text-xs font-semibold text-link no-underline hover:underline">
                  {row.link.text}
                </Link>
              )}
            </span>
            <b className={cn("text-[22px] font-bold tracking-[-0.02em] tabular-nums", row.count > 0 && row.tone)}>
              {formatNumber(row.count)}
            </b>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
