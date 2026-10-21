import type { AdminUser, AppGrant, CatalogApp } from "./types.ts";

/** O nível no app, ou null se não há acesso. */
export function findLevel(grants: AppGrant[], slug: string): number | null {
  return grants.find((grant) => grant.slug === slug)?.level ?? null;
}

/** Devolve a lista nova com o acesso ao app trocado. level null = tira o acesso. */
export function withGrant(grants: AppGrant[], slug: string, level: number | null): AppGrant[] {
  const others = grants.filter((grant) => grant.slug !== slug);
  return level === null ? others : [...others, { slug, level }];
}

/** O mesmo que withGrant, para um usuário já cadastrado (que guarda também o nome do app). */
export function withAppLevel(user: AdminUser, app: CatalogApp, level: number | null): AdminUser {
  const others = user.apps.filter((access) => access.slug !== app.slug);
  if (level === null) return { ...user, apps: others };
  return { ...user, apps: [...others, { slug: app.slug, name: app.name, level }] };
}

/** Ao ligar um app, começa no menor nível: liberar mais é decisão explícita. */
export function lowestLevel(app: CatalogApp): number {
  return Math.min(...app.levels.map((option) => option.level));
}
