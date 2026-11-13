import type { UserFilterId } from "@sondohub/contracts";

// A regra de cada filtro fica na API (users.repository.ts); aqui só o rótulo do botão.
export const USER_FILTERS: { id: UserFilterId; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "master", label: "Masters" },
  { id: "admin", label: "Administradores" },
  { id: "no-apps", label: "Sem acesso" },
  { id: "inactive", label: "Inativos" },
];
