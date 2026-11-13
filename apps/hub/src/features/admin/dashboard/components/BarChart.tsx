import { useEffect, useId, useRef, useState } from "react";

type Series = { name: string; color: string; values: number[] };

type BarChartProps = {
  /** Nome do gráfico para leitor de tela. */
  label: string;
  /** Um rótulo por barra; vazio = sem rótulo naquela barra. */
  labels: string[];
  /** Uma série = barras com degradê; várias = barras empilhadas, uma cor por série. */
  series: Series[];
  formatTooltip: (seriesName: string, value: number) => string;
};

const HEIGHT = 210;
const PAD_LEFT = 28;
const PAD_BOTTOM = 20;
const PAD_TOP = 8;
const GRID_LINES = 4;

/** Barras verticais em SVG. Mede a largura real para as barras não ficarem esticadas. */
export default function BarChart({ label: chartLabel, labels, series, formatTooltip }: BarChartProps) {
  const id = useId();
  const [ref, width] = useWidth<SVGSVGElement>();
  const totals = labels.map((_, index) => series.reduce((sum, s) => sum + s.values[index], 0));
  const max = Math.ceil(Math.max(GRID_LINES, ...totals) / GRID_LINES) * GRID_LINES;
  const plotHeight = HEIGHT - PAD_BOTTOM - PAD_TOP;
  const slot = (width - PAD_LEFT) / Math.max(1, labels.length);
  const barWidth = Math.max(4, Math.min(28, slot * 0.62));
  const isStacked = series.length > 1;

  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${HEIGHT}`} className="mt-3 h-[210px] w-full" role="img" aria-label={chartLabel}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--grad-a)" />
          <stop offset="1" stopColor="var(--grad-b)" />
        </linearGradient>
      </defs>

      {Array.from({ length: GRID_LINES + 1 }, (_, line) => {
        const y = PAD_TOP + plotHeight * (1 - line / GRID_LINES);
        return (
          <g key={line}>
            <line x1={PAD_LEFT} x2={width} y1={y} y2={y} stroke="var(--line-divider)" strokeDasharray={line ? "3 4" : undefined} />
            <text x={PAD_LEFT - 6} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {(max * line) / GRID_LINES}
            </text>
          </g>
        );
      })}

      {labels.map((label, index) => {
        const x = PAD_LEFT + slot * index + (slot - barWidth) / 2;
        let base = HEIGHT - PAD_BOTTOM;
        return (
          <g key={index}>
            {series.map((s, seriesIndex) => {
              const height = (s.values[index] / max) * plotHeight;
              if (height <= 0) return null;
              base -= height;
              return (
                <rect
                  key={seriesIndex}
                  x={x}
                  y={base}
                  width={barWidth}
                  height={Math.max(height - 1.5, 1)}
                  rx={Math.min(4, barWidth / 3)}
                  fill={isStacked ? s.color : `url(#${id})`}
                >
                  <title>{formatTooltip(s.name, s.values[index])}</title>
                </rect>
              );
            })}
            {label && (
              <text x={x + barWidth / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Largura atual do elemento, atualizada quando a tela muda de tamanho. */
function useWidth<T extends Element>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
