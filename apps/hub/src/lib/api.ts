import type { HubProfile, LauncherApp, LoginInput } from "@sondohub/contracts";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`A API respondeu ${status}`);
    this.status = status;
  }
}

// O hub fala com a própria API no mesmo origin (/api), então o cookie de sessão vai sozinho.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new ApiError(response.status);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const hubApi = {
  login: (input: LoginInput) =>
    request<HubProfile>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<HubProfile>("/me"),
  myApps: () => request<LauncherApp[]>("/me/apps"),
};
