import type { CreateAppInput } from "@sondohub/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import BackLink from "@/components/BackLink.tsx";
import { hubApi } from "@/lib/api.ts";
import { toFormValues } from "../app-form.ts";
import AppForm from "../components/AppForm.tsx";
import AppIcon from "../components/AppIcon.tsx";

export function AppDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: app, isPending } = useQuery({
    queryKey: ["admin", "apps", id],
    queryFn: () => hubApi.adminApp(id),
    retry: false, // 404 é resposta, não falha de rede.
  });

  if (isPending) return <p className="text-muted-foreground">Carregando…</p>;

  if (!app)
    return (
      <div className="mx-auto flex max-w-[1240px] flex-col items-start gap-3">
        <h1 className="text-2xl font-bold">Aplicativo não encontrado</h1>
        <Link to="/admin/aplicativos">Voltar para o catálogo</Link>
      </div>
    );

  async function save(input: CreateAppInput) {
    await hubApi.updateAdminApp(id, input);
    // Nome, ícone e níveis aparecem no catálogo, nas telas de usuário e no launcher: tudo busca de novo.
    await queryClient.invalidateQueries();
    navigate("/admin/aplicativos");
  }

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-8">
      <header className="flex flex-col gap-6">
        <BackLink to="/admin/aplicativos" label="Catálogo" />
        <div className="flex flex-wrap items-center gap-5">
          <AppIcon
            name={app.name}
            src={app.iconUrl}
            className="size-[72px] rounded-[18px] text-2xl"
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight">
              {app.name}
            </h1>
            <span className="text-[15px] text-muted-foreground">
              {app.origin} ·{" "}
              {app.userCount === 1
                ? "1 pessoa com acesso"
                : `${app.userCount} pessoas com acesso`}
            </span>
          </div>
        </div>
      </header>
      <AppForm
        key={app.id}
        defaultValues={toFormValues(app)}
        isEditing
        submitLabel="Salvar alterações"
        onSubmit={save}
      />
    </div>
  );
}
