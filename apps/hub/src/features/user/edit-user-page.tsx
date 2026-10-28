import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import BackLink from "@/components/BackLink.tsx";
import Sidebar from "@/features/launcher/components/Sidebar.tsx";
import { ApiError, hubApi } from "@/lib/api.ts";
import DeleteAccountSection from "./components/DeleteAccountSection.tsx";
import DevicesSection from "./components/DevicesSection.tsx";
import NameForm from "./components/NameForm.tsx";
import ProfileHeader from "./components/ProfileHeader.tsx";
import SettingsRow from "./components/SettingsRow.tsx";

export function EditUserPage() {
  const me = useQuery({
    queryKey: ["me", "profile"],
    queryFn: hubApi.myProfile,
    retry: false,
  });

  if (me.error instanceof ApiError && me.error.status === 401)
    return <Navigate to="/login" replace />;
  if (me.isError)
    return (
      <p className="p-8 text-danger-text">
        Não foi possível carregar. Recarregue a página.
      </p>
    );
  if (!me.data) return <p className="p-8 text-muted-foreground">Carregando…</p>;

  const profile = me.data;

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <Sidebar profile={profile} />
      <main className="min-w-0 flex-1 px-6 pt-10 pb-16 md:px-12">
        <div className="mx-auto flex max-w-[860px] flex-col gap-8">
          <BackLink to="/" label="Aplicativos" />
          <ProfileHeader profile={profile} />

          <div>
            <SettingsRow
              title="Nome"
              description="Aparece no SondoHub e nos aplicativos."
            >
              <NameForm name={profile.name} />
            </SettingsRow>

            <SettingsRow
              title="Senha"
              description="Você recebe um link por e-mail para criar uma nova."
            >
              <button
                type="button"
                disabled
                title="Em breve"
                className="h-10 rounded-[10px] border border-input px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Esqueci a senha
              </button>
            </SettingsRow>

            <SettingsRow
              title="Dispositivos conectados"
              description="Onde sua conta está aberta. Saia dos que você não reconhece."
            >
              <DevicesSection />
            </SettingsRow>

            {profile.role !== "MASTER" && (
              <SettingsRow
                title="Excluir conta"
                description="Você perde o acesso a todos os aplicativos. Não dá para desfazer."
              >
                <DeleteAccountSection />
              </SettingsRow>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
