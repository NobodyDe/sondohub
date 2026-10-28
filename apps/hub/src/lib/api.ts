import type {
  AdminApp,
  AdminUser,
  AdminUserDetail,
  CreateAppInput,
  CreateUserInput,
  HubProfile,
  LauncherApp,
  LoginInput,
  MyProfile,
  MySession,
  UpdateAppInput,
  UpdateProfileInput,
  UpdateUserInput,
} from "@sondohub/contracts";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`A API respondeu ${status}`);
    this.status = status;
    this.body = body;
  }
}

// O hub fala com a própria API no mesmo origin (/api), então o cookie de sessão vai sozinho.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  // Corpo de erro é opcional: um 502 do proxy pode nem ser JSON.
  if (!response.ok)
    throw new ApiError(
      response.status,
      await response.json().catch(() => null),
    );
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
  adminApps: () => request<AdminApp[]>("/admin/apps"),
  adminApp: (id: string) => request<AdminApp>(`/admin/apps/${id}`),
  createAdminApp: (input: CreateAppInput) =>
    request<AdminApp>("/admin/apps", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAdminApp: (id: string, input: UpdateAppInput) =>
    request<AdminApp>(`/admin/apps/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  myProfile: () => request<MyProfile>("/me/profile"),
  updateMyProfile: (input: UpdateProfileInput) =>
    request<MyProfile>("/me", { method: "PATCH", body: JSON.stringify(input) }),
  deleteMyAccount: () => request<void>("/me", { method: "DELETE" }),
  mySessions: () => request<MySession[]>("/me/sessions"),
  revokeMySession: (id: string) =>
    request<void>(`/me/sessions/${id}`, { method: "DELETE" }),
  revokeAllMySessions: () =>
    request<void>("/me/sessions", { method: "DELETE" }),
};
