import type { AdminUser } from "@sondohub/contracts";

export type UserFilterId = "all" | "master" | "admin" | "no-apps" | "inactive";

type UserFilter = {
  id: UserFilterId;
  label: string;
  matches: (user: AdminUser) => boolean;
};

// Cada filtro carrega a própria regra: para criar um novo, basta mais uma linha aqui.
export const USER_FILTERS: UserFilter[] = [
  { id: "all", label: "Todos", matches: () => true },
  { id: "master", label: "Masters", matches: (user) => user.role === "MASTER" },
  {
    id: "admin",
    label: "Administradores",
    matches: (user) => user.role === "ADMIN",
  },
  {
    id: "no-apps",
    label: "Sem acesso",
    matches: (user) => user.apps.length === 0,
  },
  { id: "inactive", label: "Inativos", matches: (user) => !user.isActive },
];

export function filterUsers(
  users: AdminUser[],
  filterId: UserFilterId,
  query: string,
) {
  const filter =
    USER_FILTERS.find((item) => item.id === filterId) ?? USER_FILTERS[0];
  const term = normalize(query);

  return users.filter(
    (user) =>
      filter.matches(user) &&
      (!term || normalize(`${user.name} ${user.email}`).includes(term)),
  );
}

/** Ignora maiúsculas e acentos: "joao" encontra "João". */
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}
