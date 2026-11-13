import type { AdminDashboard } from "@sondohub/contracts";
import { LogIn } from "lucide-react";
import { useId } from "react";
import { formatNumber } from "../format.ts";
import BigNumber from "./BigNumber.tsx";
import DashboardCard from "./DashboardCard.tsx";
import Delta from "./Delta.tsx";

type LoginsCardProps = {
  logins: AdminDashboard["logins"];
  periodLabel: string;
  className?: string;
};

const WIDTH = 100;
const HEIGHT = 40;

/** Total de logins no período, a variação contra o período anterior e a linha de tendência. */
export default function LoginsCard({ logins, periodLabel, className }: LoginsCardProps) {
  const change =
    logins.previous > 0 ? Math.round((logins.total / logins.previous - 1) * 100) : null;

  return (
    <DashboardCard icon={LogIn} title="Logins" subtitle={periodLabel} className={className}>
      <BigNumber value={formatNumber(logins.total)} note={<Delta value={change} unit="%" />} />
      <Sparkline values={logins.series.map((bucket) => bucket.value)} />
    </DashboardCard>
  );
}

/** Linha com área por baixo. preserveAspectRatio="none" estica o desenho na largura do card. */
function Sparkline({ values }: { values: number[] }) {
  const id = useId();
  const max = Math.max(1, ...values);
  const step = WIDTH / Math.max(1, values.length - 1);
  const points = values.map((value, index) => `${index * step},${HEIGHT - 3 - (value / max) * (HEIGHT - 6)}`);
  const line = `M${points.join(" L")}`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="mt-auto h-[42px] w-full overflow-visible pt-2"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-line`} x1="0" x2="1">
          <stop offset="0" stopColor="var(--grad-a)" />
          <stop offset="1" stopColor="var(--grad-b)" />
        </linearGradient>
        <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--grad-b)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--grad-a)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`} fill={`url(#${id}-area)`} />
      <path
        d={line}
        fill="none"
        stroke={`url(#${id}-line)`}
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="drop-shadow-[0_0_6px_var(--dash-edge)]"
      />
    </svg>
  );
}
