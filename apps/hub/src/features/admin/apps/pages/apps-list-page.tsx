import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router";
import { hubApi } from "@/lib/api.ts";
import AppsTable from "../components/AppsTable.tsx";

export function AppsListPage() {
  const { data: apps = [] } = useQuery({
    queryKey: ["admin", "apps"],
    queryFn: hubApi.adminApps,
  });
  const activeCount = apps.filter((app) => app.isActive).length;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-extrabold tracking-tight">
            Catálogo de aplicativos
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {activeCount} de {apps.length} disponíveis para as pessoas
          </p>
        </div>
        <Link
          to="/admin/aplicativos/novo"
          className="flex h-11 items-center gap-2 rounded-[10px] bg-primary px-[18px] text-sm font-bold text-primary-foreground no-underline transition hover:brightness-110"
        >
          <Plus className="size-[18px]" strokeWidth={2.2} aria-hidden />
          Novo aplicativo
        </Link>
      </header>

      <AppsTable apps={apps} />
    </div>
  );
}
