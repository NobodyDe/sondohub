import { z } from "zod";

// trim/toLowerCase ANTES do .pipe(z.email()): no zod 4 a checagem de formato roda antes
// das transformações encadeadas depois dela, e "  Ana@X.com " seria rejeitado.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, "A senha deve ter no minimo 8 caracteres.")
    .max(128, "A senha pode ter no máximo 128 caracteres."),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** O usuário dentro de um app: é o que vai no access token. */
export type SondoUser = {
  id: string;
  name: string;
  email: string;
  picture: string | null;
  level: number;
};

/** Um app no launcher. */
export type LauncherApp = {
  slug: string;
  name: string;
  iconUrl: string;
  url: string;
};

/** Resposta de POST /api/sso/token. */
export type TokenResponse = {
  accessToken: string;
  expiresIn: number;
  user: SondoUser;
};

/** Cargo do usuário no hub. Espelha o enum UserRole do Prisma. */
/** Resposta de GET /api/me (perfil no hub). */
export type HubProfile = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: UserRole;
};

export type AdminUserApp = {
  slug: string;
  name: string;
  level: number;
};

export type AdminUser = HubProfile & {
  isActive: boolean;
  apps: AdminUserApp[];
};

/** Um nível de permissão, como vem da coluna applications.levels. */
export type AppLevel = { level: number; label: string };

/** Um app do catálogo visto de um usuário: os níveis do app e o nível dele (null = sem acesso). */
export type AdminUserAppAccess = {
  slug: string;
  name: string;
  levels: AppLevel[];
  hasAccess: boolean;
  level: number | null;
};

/** Resposta de GET /api/admin/users/:id e das rotas que editam o usuário. */
export type AdminUserDetail = HubProfile & {
  isActive: boolean;
  apps: AdminUserAppAccess[];
};

/** Cargo do usuário no hub. Espelha o enum UserRole do Prisma. */
export const userRoleSchema = z.enum(["MASTER", "ADMIN", "USER"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Body de PATCH /api/admin/users/:id. Manda só o que mudou. */
export const updateUserSchema = z.object({
  role: userRoleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Body de PUT /api/admin/users/:id/apps/:slug. */
export const appAccessSchema = z.object({ level: z.number().int().positive() });
export type AppAccessInput = z.infer<typeof appAccessSchema>;
