import type { DashboardRanking } from "@sondohub/contracts";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import UserAvatar from "@/components/UserAvatar.tsx";
import { ROLES } from "../../users/roles.ts";
import { formatNumber } from "../format.ts";
import DashboardCard from "./DashboardCard.tsx";
import SegmentedControl from "./SegmentedControl.tsx";

type Order = "top" | "bottom";

type UserRankingCardProps = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  ranking: DashboardRanking;
  /** Como mostrar o zero (ex.: "nunca" para logins). */
  zeroLabel?: string;
  footer: ReactNode;
  className?: string;
};

const ORDERS = [
  { value: "top" as const, label: "Mais" },
  { value: "bottom" as const, label: "Menos" },
];

/** Quem tem mais e quem tem menos de alguma coisa (logins, sessões). */
export default function UserRankingCard({
  icon,
  title,
  subtitle,
  ranking,
  zeroLabel = "0",
  footer,
  className,
}: UserRankingCardProps) {
  const [order, setOrder] = useState<Order>("top");
  const users = ranking[order];
  const max = Math.max(1, ...ranking.top.map((user) => user.value));

  return (
    <DashboardCard
      icon={icon}
      title={title}
      subtitle={subtitle}
      actions={<SegmentedControl label="Ordem" options={ORDERS} value={order} onChange={setOrder} size="sm" />}
      className={className}
    >
      <ol className="mt-3.5">
        {users.map((user) => (
          <li
            key={user.id}
            className="grid grid-cols-[28px_1fr_64px_auto] items-center gap-2.5 border-t border-line-divider py-[7px] text-[13px] first:border-t-0"
          >
            <UserAvatar name={user.name} url={user.avatarUrl} className="size-7 text-[11px]" />
            <span className="min-w-0">
              <b className="block truncate font-semibold">{user.name}</b>
              <span className="text-[11.5px] text-muted-foreground">{ROLES[user.role].shortLabel}</span>
            </span>
            <span className="h-[5px] overflow-hidden rounded bg-muted">
              <b
                className="block h-full rounded bg-linear-to-r from-(--grad-a) to-(--grad-b)"
                style={{ width: `${(user.value / max) * 100}%` }}
              />
            </span>
            <span className={user.value ? "min-w-8 text-right font-bold" : "min-w-8 text-right font-bold text-danger-text"}>
              {user.value ? formatNumber(user.value) : zeroLabel}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-auto pt-3.5 text-[12.5px] text-muted-foreground">{footer}</div>
    </DashboardCard>
  );
}
