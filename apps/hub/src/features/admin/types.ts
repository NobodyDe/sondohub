import type { UserRole } from "@sondohub/contracts";

// Provisório: quando a API de administração existir, os tipos abaixo vão para @sondohub/contracts.

/** Acesso a um app: qual app e em que nível. */
export type AppGrant = {
  slug: string;
  level: number;
};

export type AdminUserApp = AppGrant & {
  name: string;
};

/** Um nível de permissão, como vem da coluna applications.levels. */
export type AppLevel = { level: number; label: string };

/** Um app do catálogo, com os níveis que ele oferece. */
export type CatalogApp = {
  slug: string;
  name: string;
  levels: AppLevel[];
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
  apps: AdminUserApp[];
};
