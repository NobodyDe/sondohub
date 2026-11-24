import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import BackLink from "@/components/BackLink.tsx";
import Sidebar from "@/features/launcher/components/Sidebar.tsx";
import { ApiError, hubApi } from "@/lib/api.ts";
import { useAssistenteConfig } from "../use-assistente-config.ts";

type Props = {
  title: string;
  description: string;
  back: { to: string; label: string };
  children: ReactNode;
};

/** Moldura das telas pessoais (/assistente/*): sidebar, voltar, título. Quem não está autorizado volta ao início. */
export default function AssistentePageShell({ title, description, back, children }: Props) {
  const me = useQuery({ queryKey: ["me"], queryFn: hubApi.me, retry: false });
  const config = useAssistenteConfig();

  const unauthenticated = [me.error, config.error].some((error) => error instanceof ApiError && error.status === 401);
  if (unauthenticated) return <Navigate to="/login" replace />;
  if (me.isError || config.isError)
    return <p className="p-8 text-danger-text">Não foi possível carregar. Recarregue a página.</p>;
  if (!me.data || !config.data) return <p className="p-8 text-muted-foreground">Carregando…</p>;
  if (!config.data.autorizado) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <Sidebar profile={me.data} />
      <main className="min-w-0 flex-1 px-6 pt-10 pb-16 md:px-12">
        <div className="mx-auto flex max-w-[860px] flex-col gap-8">
          <BackLink to={back.to} label={back.label} />
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </header>
          <div>{children}</div>
        </div>
      </main>
    </div>
  );
}
