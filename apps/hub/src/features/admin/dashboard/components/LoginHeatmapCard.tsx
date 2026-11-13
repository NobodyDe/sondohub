import { Clock } from "lucide-react";
import DashboardCard from "./DashboardCard.tsx";

type LoginHeatmapCardProps = {
  /** [dia da semana, 0 = segunda][hora 0..23] */
  heatmap: number[][];
  className?: string;
};

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const DAYS_PLURAL = ["segundas", "terças", "quartas", "quintas", "sextas", "sábados", "domingos"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MIN_OPACITY = 0.05; // célula vazia ainda aparece como grade
const SCALE_STEPS = [0.12, 0.4, 0.7, 1];

/** Logins por dia da semana e hora: mostra quando a equipe costuma entrar. */
export default function LoginHeatmapCard({ heatmap, className }: LoginHeatmapCardProps) {
  const max = Math.max(...heatmap.flat());
  const peak = findPeak(heatmap);

  return (
    <DashboardCard
      icon={Clock}
      title="Quando a equipe entra"
      subtitle="Logins por dia da semana e hora"
      actions={<Scale />}
      className={className}
    >
      {/* 24 colunas não cabem no celular: o mapa rola sozinho, a página não. */}
      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[480px] grid-cols-[30px_repeat(24,1fr)] gap-[3px] text-[11px] text-muted-foreground">
          {heatmap.map((hours, day) => [
            <span key={`label-${day}`}>{DAYS[day]}</span>,
            ...hours.map((count, hour) => (
              <i
                key={`${day}-${hour}`}
                title={`${DAYS[day]} ${hour}h: ${count} logins`}
                className="aspect-[1.5] rounded-[3px]"
                style={{ background: `rgba(var(--heat), ${max ? Math.max(count / max, MIN_OPACITY) : MIN_OPACITY})` }}
              />
            )),
          ])}
          <span />
          {HOURS.map((hour) => (
            <span key={hour} className="text-ink-placeholder">
              {hour % 6 === 0 ? `${hour}h` : ""}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-auto pt-3.5 text-[12.5px] text-muted-foreground">
        {peak
          ? `Pico às ${DAYS_PLURAL[peak.day]}, das ${peak.hour}h às ${peak.hour + 1}h`
          : "Nenhum login no período"}
      </p>
    </DashboardCard>
  );
}

/** Célula com mais logins; null se o período não teve nenhum. */
function findPeak(heatmap: number[][]): { day: number; hour: number } | null {
  let best = { day: 0, hour: 0, count: 0 };
  for (const [day, hours] of heatmap.entries()) {
    for (const [hour, count] of hours.entries()) {
      if (count > best.count) best = { day, hour, count };
    }
  }
  return best.count ? best : null;
}

function Scale() {
  return (
    <div className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground" aria-hidden>
      Menos
      {SCALE_STEPS.map((step) => (
        <i key={step} className="h-2.5 w-3.5 rounded-[2px]" style={{ background: `rgba(var(--heat), ${step})` }} />
      ))}
      Mais
    </div>
  );
}
