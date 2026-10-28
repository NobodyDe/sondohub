// format-date.ts
const formatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

/** "2026-10-28T17:32:00Z" → "28/10/2026, 14:32", no fuso de quem está vendo. */
export function formatDateTime(iso: string) {
  return formatter.format(new Date(iso));
}
