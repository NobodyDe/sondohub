import type { AdminDashboard } from "@sondohub/contracts";
import { Gauge } from "lucide-react";
import { useId } from "react";
import { formatNumber } from "../format.ts";
import DashboardCard from "./DashboardCard.tsx";

type ActivationCardProps = { activation: AdminDashboard["activation"]; className?: string };

const ARC = "M10 60 A50 50 0 0 1 110 60"; // meia-volta de raio 50

/** Medidor: quantas contas ativas já entraram pelo menos uma vez. */
export default function ActivationCard({ activation, className }: ActivationCardProps) {
  const id = useId();
  const percent = activation.total
    ? Math.round((activation.everLoggedIn / activation.total) * 100)
    : 0;
  const neverLoggedIn = activation.total - activation.everLoggedIn;

  return (
    <DashboardCard icon={Gauge} title="Ativação" subtitle="Entraram pelo menos uma vez" className={className}>
      <div className="mt-auto flex items-end gap-3.5 pt-4">
        <svg viewBox="0 0 120 66" className="h-[66px] w-[120px] shrink-0" aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" x2="1">
              <stop offset="0" stopColor="var(--grad-a)" />
              <stop offset="1" stopColor="var(--grad-b)" />
            </linearGradient>
          </defs>
          <path d={ARC} fill="none" stroke="var(--muted)" strokeWidth="10" strokeLinecap="round" />
          {percent > 0 && (
            <path
              d={ARC}
              fill="none"
              stroke={`url(#${id})`}
              strokeWidth="10"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${percent} 100`}
              className="drop-shadow-[0_0_6px_var(--dash-edge)]"
            />
          )}
        </svg>
        <div>
          <p className="text-[34px] leading-tight font-bold tracking-[-0.03em] tabular-nums">{percent}%</p>
          <p className="pt-1 text-[12.5px] text-muted-foreground">
            {neverLoggedIn ? `${formatNumber(neverLoggedIn)} nunca entraram` : "Todos já entraram"}
          </p>
        </div>
      </div>
    </DashboardCard>
  );
}
