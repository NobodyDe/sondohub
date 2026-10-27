import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router";
import Sidebar from "@/features/launcher/components/Sidebar.tsx";
import { ApiError, hubApi } from "@/lib/api.ts";

/** Rota-mãe do /admin: carrega o perfil, barra quem não pode entrar e desenha a sidebar. A página entra no <Outlet />. */
export default function AdminLayout() {
  const me = useQuery({ queryKey: ["me"], queryFn: hubApi.me, retry: false });

  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />;
  if (me.isError) return <p className="p-8 text-danger-text">Não foi possível carregar. Recarregue a página.</p>;
  if (!me.data) return <p className="p-8 text-muted-foreground">Carregando…</p>;
  // Só esconde a tela; quem protege de verdade é a API.
  if (me.data.role !== "MASTER") return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <Sidebar profile={me.data} />
      <main className="min-w-0 flex-1 px-6 pt-10 pb-16 md:px-12">
        <Outlet />
      </main>
    </div>
  );
}
