import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate } from "react-router";
import { ApiError, hubApi } from "../../lib/api.ts";
import Banner from "./components/Banner.tsx";
import Header from "./components/Header.tsx";
import MainContent from "./components/MainContent.tsx";
import Sidebar from "./components/Sidebar.tsx";
import type { LauncherApp } from "@sondohub/contracts";
import type { AppView } from "./types/types.ts";

async function logout() {
  await hubApi.logout();
  location.assign("/login");
}

type AppDetails = Pick<AppView, "description" | "category">;

// Provisório: sai daqui quando o contrato LauncherApp trouxer esses campos.
const APP_DETAILS: Record<string, AppDetails> = {
  demo: {
    description: "Aplicativo teste para o sondohub",
    category: "Engenharia",
  },
  gemeo: {
    description: "Plataforma de monitoramento inteligente",
    category: "BIM",
  },
};

const DEFAULT_DETAILS: AppDetails = { description: "", category: "Outros" };

function toAppViews(apps: LauncherApp[], favorites: string[]): AppView[] {
  return apps.map((app) => ({
    ...app,
    ...(APP_DETAILS[app.slug] ?? DEFAULT_DETAILS),
    isFavorite: favorites.includes(app.slug),
  }));
}

export function LauncherPage() {
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const me = useQuery({ queryKey: ["me"], queryFn: hubApi.me, retry: false });
  const apps = useQuery({
    queryKey: ["my-apps"],
    queryFn: hubApi.myApps,
    enabled: me.isSuccess,
  });

  if (me.error instanceof ApiError && me.error.status === 401)
    return <Navigate to="/login" replace />;
  if (me.isError)
    return (
      <p className="p-8 text-red-600">
        Não foi possível carregar. Recarregue a página.
      </p>
    );
  if (!me.data) return <p className="p-8 text-slate-500">Carregando…</p>;

  function toggleFavorite(slug: string) {
    setFavorites((current) =>
      current.includes(slug)
        ? current.filter((favorite) => favorite !== slug)
        : [...current, slug],
    );
  }

  const appViews = apps.data ? toAppViews(apps.data, favorites) : [];

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <Sidebar profile={me.data} />

      <main className="min-w-0 flex-1 px-6 pt-10 pb-16 md:px-12">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-8">
          <Header query={query} onQueryChange={setQuery} onLogout={logout} />

          {apps.isPending && (
            <p className="text-muted-foreground">Carregando aplicativos…</p>
          )}
          {apps.isError && (
            <p className="text-danger-text">
              Não foi possível carregar os aplicativos.
            </p>
          )}
          {apps.data && (
            <MainContent
              apps={appViews}
              query={query}
              onToggleFavorite={toggleFavorite}
            />
          )}

          <Banner userName={me.data.name} />
        </div>
      </main>
    </div>
  );
}
