import type { LauncherApp } from "@sondohub/contracts";

/**
 * Só deixa voltar para endereços de apps liberados ao usuário.
 * Sem isso, hub/login?returnTo=https://site-falso.com viraria isca de phishing (open redirect).
 */
export function safeReturnTo(
  returnTo: string | null,
  apps: LauncherApp[],
): string | null {
  if (!returnTo) return null;
  try {
    const { origin } = new URL(returnTo);
    return apps.some((app) => new URL(app.url).origin === origin)
      ? returnTo
      : null;
  } catch {
    return null; // não é uma URL absoluta válida
  }
}
