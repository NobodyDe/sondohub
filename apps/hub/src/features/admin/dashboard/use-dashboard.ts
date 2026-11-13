import type { DashboardPeriod } from "@sondohub/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { hubApi } from "@/lib/api.ts";

const DASHBOARD_STALE_MS = 5 * 60_000; // painel de acompanhamento: não precisa ser ao vivo.

/** Trocar de período mantém o painel anterior na tela até o novo chegar (sem piscar). */
export function useDashboard(period: DashboardPeriod) {
  return useQuery({
    queryKey: ["admin", "dashboard", period],
    queryFn: () => hubApi.adminDashboard(period),
    staleTime: DASHBOARD_STALE_MS,
    placeholderData: keepPreviousData,
  });
}
