import {
  type AdminUsersSummary,
  type UserFilterId,
  type UserPageSize,
  userFilterSchema,
} from "@sondohub/contracts";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { hubApi } from "@/lib/api.ts";
import { useDebounceByKey } from "@/lib/use-debounce-by-key.ts";
import { cn } from "@/lib/utils.ts";
import UsersPagination from "../components/UsersPagination.tsx";
import UsersTable from "../components/UsersTable.tsx";
import UsersToolbar from "../components/UsersToolbar.tsx";
import {
  USERS_LIST_KEY,
  USERS_STALE_MS,
  useUsersPage,
} from "../use-users-page.ts";

const SEARCH_DEBOUNCE_MS = 300; // digitar "maria" vira uma requisição, não cinco.

export function UsersListPage() {
  const [searchParams] = useSearchParams();
  // ?filtro= vem de links como os do painel; valor desconhecido cai em "todos".
  const [filter, setFilter] = useState<UserFilterId>(
    () => userFilterSchema.safeParse(searchParams.get("filtro")).data ?? "all",
  );
  const [query, setQuery] = useState(""); // o que está no campo
  const [search, setSearch] = useState(""); // o que já foi para a API
  const [pageSize, setPageSize] = useState<UserPageSize>(10);
  const debounce = useDebounceByKey(SEARCH_DEBOUNCE_MS);
  const page = useUsersPage({ filter, q: search, take: pageSize });
  const { data: summary } = useQuery({
    queryKey: [...USERS_LIST_KEY, "summary"],
    queryFn: hubApi.adminUsersSummary,
    staleTime: USERS_STALE_MS,
  });

  function changeQuery(value: string) {
    setQuery(value);
    debounce.schedule("search", () => setSearch(value.trim()));
  }

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-extrabold tracking-tight">Usuários</h1>
          <p className="text-[15px] text-muted-foreground">
            {summary ? summarize(summary) : " "}
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
        onQueryChange={changeQuery}
      />

      {page.isPending ? (
        <p className="text-muted-foreground">Carregando usuários…</p>
      ) : (
        // Esmaece a página atual enquanto a próxima chega, em vez de piscar a tabela vazia.
        <div className={cn("transition-opacity", page.isChangingPage && "opacity-60")}>
          <UsersTable
            users={page.users}
            footer={
              <UsersPagination
                pageNumber={page.pageNumber}
                hasPrevious={page.hasPrevious}
                hasNext={page.hasNext}
                onPrevious={page.goPrevious}
                onNext={page.goNext}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
              />
            }
          />
        </div>
      )}
    </div>
  );
}

/** "3 usuários · 1 master · 1 administrador" */
function summarize({ total, masters, admins }: AdminUsersSummary) {
  return [
    plural(total, "usuário", "usuários"),
    plural(masters, "master", "masters"),
    plural(admins, "administrador", "administradores"),
  ].join(" · ");
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
