// Chaves de API: regras de exibição. Os tipos vêm do contrato com a API.
import type { ApiKey } from "@sondohub/contracts";

export type ApiKeyStatus = "active" | "expired";

/** Valor do <select> de prazo: dias, ou "never" (só MASTER; vira null no envio). */
export const EXPIRY_OPTIONS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 365, label: "1 ano" },
] as const;

export const DEFAULT_EXPIRY_DAYS = 30;
export const API_KEY_NAME_MAX = 60;

export const STATUS_LABELS: Record<ApiKeyStatus, string> = {
  active: "Ativa",
  expired: "Expirada",
};

export function keyStatus(key: Pick<ApiKey, "expiresAt">, now = Date.now()): ApiKeyStatus {
  return key.expiresAt && Date.parse(key.expiresAt) <= now ? "expired" : "active";
}

export function addDays(days: number, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });
const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "19 de nov. de 2026" */
export function formatDate(value: string | Date) {
  return dateFormatter.format(new Date(value));
}

/** "qui., 19 de nov. de 2026, 17:25" */
export function formatLongDate(value: string | Date) {
  return longDateFormatter.format(new Date(value));
}

/** Validade para a tela: chave sem prazo mostra "Nunca". */
export function formatExpiry(expiresAt: string | null, long = false) {
  if (!expiresAt) return "Nunca";
  return long ? formatLongDate(expiresAt) : formatDate(expiresAt);
}
