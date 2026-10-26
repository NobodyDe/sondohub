import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import AdminShell from "./components/AdminShell.tsx";
import UsersTable from "./components/UsersTable.tsx";
import UsersToolbar from "./components/UsersToolbar.tsx";
import { FAKE_USERS } from "./fake-users.ts";
import { filterUsers, type UserFilterId } from "./user-filters.ts";
import type { AdminUser } from "./types.ts";
import { hubApi } from "@/lib/api.ts";
import { useQuery } from "@tanstack/react-query";

export function AdminUsersPage() {
  const [filter, setFilter] = useState<UserFilterId>("all");
  const [query, setQuery] = useState("");
  const { data: users = [] } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: hubApi.adminUsers,
  });
  return (
    <AdminShell>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-7">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-extrabold tracking-tight">Usuários</h1>
            <p className="text-[15px] text-muted-foreground">
              {summarize(users)}
            </p>
          </div>
          <Link
            to="/admin/usuarios/novo"
            className="flex h-11 items-center gap-2 rounded-[10px] bg-primary px-[18px] text-sm font-bold text-primary-foreground no-underline transition hover:brightness-110"
          >
            <Plus className="size-[18px]" strokeWidth={2.2} aria-hidden />
            Novo usuário
          </Link>
        </header>

        <UsersToolbar
          filter={filter}
          onFilterChange={setFilter}
          query={query}
          onQueryChange={setQuery}
        />
        <UsersTable users={filterUsers(users, filter, query)} />
      </div>
    </AdminShell>
  );
}

/** "3 usuários · 1 master · 1 administrador" */
function summarize(users: AdminUser[]) {
  const masters = users.filter((user) => user.role === "MASTER").length;
  const admins = users.filter((user) => user.role === "ADMIN").length;
  return [
    plural(users.length, "usuário", "usuários"),
    plural(masters, "master", "masters"),
    plural(admins, "administrador", "administradores"),
  ].join(" · ");
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
