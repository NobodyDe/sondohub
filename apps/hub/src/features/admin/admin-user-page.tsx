import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import AdminShell from "./components/AdminShell.tsx";
import AppAccessList from "./components/AppAccessList.tsx";
import RemoveUserSection from "./components/RemoveUserSection.tsx";
import RolePicker from "./components/RolePicker.tsx";
import UserProfileHeader from "./components/UserProfileHeader.tsx";
import { grantsOf } from "./user-access.ts";
import { hubApi } from "@/lib/api.ts";
import type { AdminUserDetail, UserRole } from "@sondohub/contracts";
import type { CatalogApp } from "./types.ts";

const USERS_LIST_KEY = ["admin", "users"];

export function AdminUserPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userKey = ["admin", "users", id];

  const { data: user, isPending } = useQuery({
    queryKey: userKey,
    queryFn: () => hubApi.adminUser(id),
    retry: false, // 404 é resposta, não falha de rede: mostra "não encontrado" na hora.
  });

  // Toda edição devolve o usuário atualizado: guardar a resposta no cache já redesenha a tela.
  const save = useMutation({
    mutationFn: (request: () => Promise<AdminUserDetail>) => request(),
    onSuccess: (updated) => {
      queryClient.setQueryData(userKey, updated);
      queryClient.invalidateQueries({ queryKey: USERS_LIST_KEY, exact: true });
    },
  });

  const remove = useMutation({
    mutationFn: () => hubApi.deleteAdminUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_LIST_KEY, exact: true });
      navigate("/admin/usuarios");
    },
  });

  if (isPending)
    return (
      <AdminShell>
        <p className="text-muted-foreground">Carregando…</p>
      </AdminShell>
    );

  if (!user)
    return (
      <AdminShell>
        <div className="mx-auto flex max-w-[980px] flex-col items-start gap-3">
          <h1 className="text-2xl font-bold">Usuário não encontrado</h1>
          <Link to="/admin/usuarios">Voltar para a lista</Link>
        </div>
      </AdminShell>
    );

  function changeRole(role: UserRole) {
    save.mutate(() => hubApi.updateAdminUser(id, { role }));
  }

  function changeActive(isActive: boolean) {
    save.mutate(() => hubApi.updateAdminUser(id, { isActive }));
  }

  function changeAppLevel(app: CatalogApp, level: number | null) {
    save.mutate(() =>
      level === null
        ? hubApi.removeAdminUserApp(id, app.slug)
        : hubApi.setAdminUserApp(id, app.slug, level),
    );
  }

  return (
    <AdminShell>
      <div className="mx-auto flex max-w-[980px] flex-col gap-8">
        <UserProfileHeader user={user} onActiveChange={changeActive} />
        {(save.error || remove.error) && (
          <p role="alert" className="text-sm font-semibold text-danger-text">
            Não deu para salvar. Tente de novo.
          </p>
        )}
        <RolePicker value={user.role} onChange={changeRole} />
        <AppAccessList
          apps={user.apps}
          grants={grantsOf(user.apps)}
          onLevelChange={changeAppLevel}
        />
        <RemoveUserSection onRemove={() => remove.mutate()} />
      </div>
    </AdminShell>
  );
}
