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

/** Um app liberado no cadastro: qual app e em que nível. */
export const appGrantSchema = appAccessSchema.extend({
  slug: z.string().min(1),
});

/** Body de POST /api/admin/users. */
export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Informe o nome completo.")
    .max(120, "Use no máximo 120 caracteres."),
  email: emailSchema,
  role: userRoleSchema,
  apps: z
    .array(appGrantSchema)
    .refine(
      (apps) => new Set(apps.map((app) => app.slug)).size === apps.length,
      "App repetido.",
    ),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Níveis de um app novo. Número maior = mais permissão. */
export const DEFAULT_APP_LEVELS: AppLevel[] = [
  { level: 1, label: "Leitura" },
  { level: 2, label: "Edição" },
  { level: 3, label: "Admin" },
];

/** Ícone de quem não informou um: o favicon.svg na raiz da URL do app. */
export function defaultIconUrl(url: string) {
  return `${url.trim().replace(/\/+$/, "")}/favicon.svg`;
}

// Só http(s): url e iconUrl viram href/src no launcher, e um "javascript:..." ali executaria código.
const httpUrlSchema = z.url({
  protocol: /^https?$/,
  error: "Use um endereço que comece com http:// ou https://.",
});

const appSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Use pelo menos 2 caracteres.")
  .max(40, "Use no máximo 40 caracteres.")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use só letras minúsculas, números e hífen (ex.: gemeo-digital).",
  );

/** Vazio = usar o favicon.svg do app (a API resolve ao gravar). */
const iconUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || httpUrlSchema.safeParse(value).success,
    "Deixe vazio ou use um endereço http:// ou https://.",
  );

const appLevelSchema = z.object({
  level: z.number().int().positive(),
  label: z
    .string()
    .trim()
    .min(1, "Dê um nome ao nível.")
    .max(20, "Use no máximo 20 caracteres."),
});

/** 1, 2, 3… em ordem: o número vai no token e os apps comparam "level >= 2". */
const appLevelsSchema = z
  .array(appLevelSchema)
  .min(1, "O aplicativo precisa de pelo menos um nível.")
  .max(5, "Use no máximo 5 níveis.")
  .refine(
    (levels) => levels.every((option, index) => option.level === index + 1),
    "Os níveis precisam ser 1, 2, 3…, em ordem.",
  );

/** Body de POST /api/admin/apps. A origem não vem da tela: a API tira da URL. */
export const createAppSchema = z.object({
  slug: appSlugSchema,
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do aplicativo.")
    .max(60, "Use no máximo 60 caracteres."),
  url: z.string().trim().pipe(httpUrlSchema),
  iconUrl: iconUrlSchema,
  levels: appLevelsSchema,
  isActive: z.boolean(),
});
export type CreateAppInput = z.infer<typeof createAppSchema>;

/** Body de PUT /api/admin/apps/:id. O app inteiro, menos o slug, que não muda depois de criado. */
export const updateAppSchema = createAppSchema.omit({ slug: true });
export type UpdateAppInput = z.infer<typeof updateAppSchema>;

/** Um app no painel: o que a tela edita, mais a origem e quantas pessoas têm acesso. */
export type AdminApp = LauncherApp & {
  id: string;
  origin: string;
  levels: AppLevel[];
  isActive: boolean;
  userCount: number;
};
