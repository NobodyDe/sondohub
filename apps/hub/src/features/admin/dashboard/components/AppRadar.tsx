import { Box } from "lucide-react";
import { useId } from "react";
import { formatNumber } from "../format.ts";

type RadarItem = { slug: string; name: string; value: number; previous: number };
type Point = [number, number];

type AppRadarProps = { items: RadarItem[]; unit: string };

const CX = 220;
const CY = 172;
const RADIUS = 120;
const CORE = 24; // raio do miolo: valor zero fica aqui, não no centro exato
const LABEL_GAP = 12;
const RINGS = [0.25, 0.5, 0.75, 1];
const CURVE_TENSION = 4.5; // maior = curva mais justa nos pontos

/** Cada ponta é um app: quanto mais longe do centro, mais acessos. A linha tracejada é o período anterior. */
export default function AppRadar({ items, unit }: AppRadarProps) {
  const id = useId();
  const max = Math.max(...items.flatMap((item) => [item.value, item.previous]));
  // Raiz quadrada: app com poucos acessos ainda sai do miolo, sem esconder a diferença.
  const radiusOf = (value: number) => CORE + (RADIUS - CORE) * (max ? Math.sqrt(value / max) : 0);
  const pointAt = (index: number, radius: number) => radarPoint(index, items.length, radius);

  return (
    <svg viewBox="0 0 440 345" className="mt-1 w-full" role="img" aria-label="Uso por aplicativo">
      <defs>
        <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--grad-a)" />
          <stop offset="1" stopColor="var(--grad-b)" />
        </linearGradient>
        <radialGradient id={`${id}-fill`}>
          <stop offset="0" stopColor="var(--grad-a)" stopOpacity="0.02" />
          <stop offset="1" stopColor="var(--grad-b)" stopOpacity="0.16" />
        </radialGradient>
      </defs>

      {RINGS.map((ring) => (
        <circle key={ring} cx={CX} cy={CY} r={CORE + (RADIUS - CORE) * ring} fill="none" stroke="var(--line-divider)" />
      ))}
      {items.map((item, index) => {
        const [x1, y1] = pointAt(index, CORE);
        const [x2, y2] = pointAt(index, RADIUS + 6);
        return <line key={item.slug} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--line-divider)" />;
      })}

      <path
        d={closedCurvePath(items.map((item, index) => pointAt(index, radiusOf(item.previous))))}
        fill="none"
        stroke="var(--ink-placeholder)"
        strokeWidth="1.5"
        strokeDasharray="4 5"
      />
      <path
        d={closedCurvePath(items.map((item, index) => pointAt(index, radiusOf(item.value))))}
        fill={`url(#${id}-fill)`}
        stroke={`url(#${id}-stroke)`}
        strokeWidth="3"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        className="drop-shadow-[0_0_6px_var(--dash-edge)] motion-safe:animate-draw-line"
      />

      <circle cx={CX} cy={CY} r={CORE - 4} fill="var(--muted)" stroke="var(--border)" />
      <Box x={CX - 9} y={CY - 9} width={18} height={18} strokeWidth={1.5} className="text-muted-foreground" />

      {items.map((item, index) => {
        const [x, y] = pointAt(index, radiusOf(item.value));
        return (
          <g key={item.slug}>
            <circle cx={x} cy={y} r={4.5} fill="var(--section)" stroke={`url(#${id}-stroke)`} strokeWidth="2.5">
              <title>{`${item.name}: ${formatNumber(item.value)} ${unit} (${formatNumber(item.previous)} no período anterior)`}</title>
            </circle>
            <RadarLabel item={item} unit={unit} index={index} count={items.length} />
          </g>
        );
      })}
    </svg>
  );
}

type RadarLabelProps = { item: RadarItem; unit: string; index: number; count: number };

/** Nome e número na ponta: centralizado em cima e embaixo, alinhado para fora nas laterais. */
function RadarLabel({ item, unit, index, count }: RadarLabelProps) {
  const [x, y] = radarPoint(index, count, RADIUS + LABEL_GAP);
  const angle = angleOf(index, count);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
  const dy = sin < -0.9 ? -14 : sin > 0.9 ? 12 : -2;

  return (
    <text x={x} y={y + dy} textAnchor={anchor}>
      <tspan className="fill-foreground text-[12.5px] font-bold">{item.name}</tspan>
      <tspan x={x} dy={14} className="fill-muted-foreground text-[11.5px]">
        {formatNumber(item.value)} {unit}
      </tspan>
    </text>
  );
}

/** Primeira ponta em cima (-90°), as outras em sentido horário. */
function angleOf(index: number, count: number): number {
  return ((-90 + (index * 360) / count) * Math.PI) / 180;
}

function radarPoint(index: number, count: number, radius: number): Point {
  const angle = angleOf(index, count);
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
}

/** Curva fechada e suave passando por todos os pontos (Catmull-Rom convertida em Bézier cúbica). */
function closedCurvePath(points: Point[]): string {
  if (points.length === 0) return "";
  const at = (index: number) => points[(index + points.length) % points.length];
  const segments = points.map((_, index) => {
    const [p0, p1, p2, p3] = [at(index - 1), at(index), at(index + 1), at(index + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / CURVE_TENSION, p1[1] + (p2[1] - p0[1]) / CURVE_TENSION];
    const c2 = [p2[0] - (p3[0] - p1[0]) / CURVE_TENSION, p2[1] - (p3[1] - p1[1]) / CURVE_TENSION];
    return `C${c1.join(" ")} ${c2.join(" ")} ${p2.join(" ")}`;
  });
  return `M${points[0].join(" ")} ${segments.join(" ")}Z`;
}
