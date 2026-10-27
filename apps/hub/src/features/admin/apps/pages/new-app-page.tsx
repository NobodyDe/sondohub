import type { CreateAppInput } from "@sondohub/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import BackLink from "@/components/BackLink.tsx";
import { hubApi } from "@/lib/api.ts";
import { NEW_APP } from "../app-form.ts";
import AppForm from "../components/AppForm.tsx";

export function NewAppPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function create(input: CreateAppInput) {
    await hubApi.createAdminApp(input);
    await queryClient.invalidateQueries({ queryKey: ["admin", "apps"] }); // a lista volta com ele.
    navigate("/admin/aplicativos");
  }

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-8">
      <header className="flex flex-col gap-6">
        <BackLink to="/admin/aplicativos" label="Catálogo" />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Novo aplicativo
          </h1>
          <p className="text-[15px] text-muted-foreground">
            Cadastre o endereço e os níveis. Depois, libere o acesso na tela
            de cada pessoa.
          </p>
        </div>
      </header>
      <AppForm
        defaultValues={NEW_APP}
        isEditing={false}
        submitLabel="Criar aplicativo"
        onSubmit={create}
      />
    </div>
  );
}
