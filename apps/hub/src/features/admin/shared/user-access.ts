import type { AdminUserAppAccess, AdminUserDetail } from "@sondohub/contracts";
import type { AppGrant, CatalogApp } from "./types.ts";

/** O nível no app, ou null se não há acesso. */
export function findLevel(grants: AppGrant[], slug: string): number | null {
  return grants.find((grant) => grant.slug === slug)?.level ?? null;
}

/** Devolve a lista nova com o acesso ao app trocado. level null = tira o acesso. */
export function withGrant(
  grants: AppGrant[],
  slug: string,
  level: number | null,
): AppGrant[] {
  const others = grants.filter((grant) => grant.slug !== slug);
  return level === null ? others : [...others, { slug, level }];
}

/** O mesmo que withGrant, para um usuário já cadastrado (que guarda também o nome do app). */
/** O usuário com o nível do app trocado. level null = sem acesso. */
export function withAppLevel(
  user: AdminUserDetail,
  slug: string,
  level: number | null,
): AdminUserDetail {
  return {
    ...user,
    apps: user.apps.map((app) =>
      app.slug === slug ? { ...app, level, hasAccess: level !== null } : app,
    ),
  };
}

/** Ao ligar um app, começa no menor nível: liberar mais é decisão explícita. */
export function lowestLevel(app: CatalogApp): number {
  return Math.min(...app.levels.map((option) => option.level));
}

/** Só os apps que o usuário tem, no formato que o AppAccessList espera. */
export function grantsOf(apps: AdminUserAppAccess[]): AppGrant[] {
  return apps.flatMap(({ slug, level }) =>
    level === null ? [] : [{ slug, level }],
  );
}
