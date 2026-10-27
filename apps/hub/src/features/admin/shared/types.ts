import type { AppLevel } from "@sondohub/contracts";

/** Acesso a um app: qual app e em que nível. */
export type AppGrant = {
  slug: string;
  level: number;
};

/** Um app do catálogo, com os níveis que ele oferece. */
export type CatalogApp = {
  slug: string;
  name: string;
  levels: AppLevel[];
};
