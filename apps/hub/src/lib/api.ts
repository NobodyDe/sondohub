import type {
  AdminUser,
  AdminUserDetail,
  CreateUserInput,
  HubProfile,
  LauncherApp,
  LoginInput,
  UpdateUserInput,
} from "@sondohub/contracts";

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
  adminUsers: () => request<AdminUser[]>("/admin/users"),
  adminUser: (id: string) => request<AdminUserDetail>(`/admin/users/${id}`),
  createAdminUser: (input: CreateUserInput) =>
    request<AdminUserDetail>("/admin/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAdminUser: (id: string, input: UpdateUserInput) =>
    request<AdminUserDetail>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  setAdminUserApp: (id: string, slug: string, level: number) =>
    request<AdminUserDetail>(`/admin/users/${id}/apps/${slug}`, {
      method: "PUT",
      body: JSON.stringify({ level }),
    }),
  removeAdminUserApp: (id: string, slug: string) =>
    request<AdminUserDetail>(`/admin/users/${id}/apps/${slug}`, {
      method: "DELETE",
    }),
  deleteAdminUser: (id: string) =>
    request<void>(`/admin/users/${id}`, { method: "DELETE" }),
};
