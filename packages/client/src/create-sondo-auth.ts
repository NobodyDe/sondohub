import type { LauncherApp, TokenResponse } from "@sondohub/contracts";

const RENEW_MARGIN_MS = 60_000; // renova 1 min antes de expirar

/** O hub respondeu 403: o usuário está logado, mas não tem acesso a este app. */
export class NoAccessError extends Error {}

export type SondoAuth = ReturnType<typeof createSondoAuth>;

export function createSondoAuth({ hubUrl }: { hubUrl: string }) {
  let session: TokenResponse | null = null;
  let expiresAt = 0;
  let pending: Promise<TokenResponse> | null = null;

  async function requestSession(): Promise<TokenResponse> {
    const response = await fetch(`${hubUrl}/api/sso/token`, {
      method: "POST",
      credentials: "include",
    });
    if (response.status === 401) {
      location.assign(
        `${hubUrl}/login?returnTo=${encodeURIComponent(location.href)}`,
      );
      return new Promise(() => {}); // a página está saindo: nada mais deve rodar
    }
    if (response.status === 403)
      throw new NoAccessError("Sem acesso a este app");
    if (!response.ok) throw new Error(`Hub respondeu ${response.status}`);

    session = (await response.json()) as TokenResponse;
    expiresAt = Date.now() + session.expiresIn * 1000;
    return session;
  }

  /** Sessão em cache; só vai ao hub perto de expirar. Chamadas simultâneas dividem a mesma ida. */
  function getSession(): Promise<TokenResponse> {
    if (session && Date.now() < expiresAt - RENEW_MARGIN_MS)
      return Promise.resolve(session);
    pending ??= requestSession().finally(() => {
      pending = null;
    });
    return pending;
  }

  return {
    hubUrl,
    getSession,

    async getAccessToken(): Promise<string> {
      return (await getSession()).accessToken;
    },

    async getApps(): Promise<LauncherApp[]> {
      const response = await fetch(`${hubUrl}/api/me/apps`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(`Hub respondeu ${response.status}`);
      return (await response.json()) as LauncherApp[];
    },

    async logout(): Promise<void> {
      await fetch(`${hubUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      location.assign(`${hubUrl}/login`);
    },
  };
}
