import type { DashboardPeriod } from "@sondohub/contracts";

const numberFormat = new Intl.NumberFormat("pt-BR");
const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const dayMonthFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

export const formatNumber = (value: number) => numberFormat.format(value);

/** Cor de cada app pela posição na lista (a API já manda os apps em ordem fixa). */
export const appColor = (index: number) => `var(--app-${(index % 6) + 1})`;

/** Rótulo do eixo X para cada bucket ('YYYY-MM-DD'). Vazio = barra sem rótulo, para o eixo não embolar. */
export function bucketLabels(starts: string[], period: DashboardPeriod): string[] {
  return starts.map((start, index) => {
    // As datas já são locais; ler como UTC evita que o fuso do navegador mude o dia.
    const date = new Date(`${start}T00:00:00Z`);
    const clean = (text: string) => text.replace(".", "");
    if (period === "7d") return clean(weekdayFormat.format(date));
    if (period === "12m") return clean(monthFormat.format(date));
    const every = period === "30d" ? 5 : 2;
    return index % every === 0 ? dayMonthFormat.format(date) : "";
  });
}
