import { z } from "zod";

// trim/toLowerCase ANTES do .pipe(z.email()): no zod 4 a checagem de formato roda antes
// das transformações encadeadas depois dela, e "  Ana@X.com " seria rejeitado.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
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

/** Resposta de GET /api/me (perfil no hub). */
export type HubProfile = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
};
