import type { AdminUserDetail, UserRole } from "@sondohub/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { hubApi } from "@/lib/api.ts";
import AppAccessList from "../../shared/AppAccessList.tsx";
import type { CatalogApp } from "../../shared/types.ts";
import { grantsOf, withAppLevel } from "../../shared/user-access.ts";
import RemoveUserSection from "../components/RemoveUserSection.tsx";
import RolePicker from "../components/RolePicker.tsx";
import UserProfileHeader from "../components/UserProfileHeader.tsx";

const USERS_LIST_KEY = ["admin", "users"];

/** Uma edição: como a tela fica agora (apply) e a chamada que grava (request). */
type Edit = {
  apply: (user: AdminUserDetail) => AdminUserDetail;
  request: () => Promise<AdminUserDetail>;
};

export function UserDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userKey = ["admin", "users", id];

  const { data: user, isPending } = useQuery({
    queryKey: userKey,
    queryFn: () => hubApi.adminUser(id),
    retry: false, // 404 é resposta, não falha de rede: mostra "não encontrado" na hora.
  });

  const save = useMutation({
    mutationKey: userKey, // para contar quantas edições deste usuário estão em andamento.
    scope: { id: `admin-user-${id}` }, // uma requisição por vez, na ordem dos cliques.
    mutationFn: ({ request }: Edit) => request(),
    // Roda no clique, antes da requisição: a tela muda na hora.
    onMutate: async ({ apply }) => {
      await queryClient.cancelQueries({ queryKey: userKey }); // um GET atrasado não desfaz o clique.
      queryClient.setQueryData<AdminUserDetail>(
        userKey,
        (current) => current && apply(current),
      );
    },
    onSuccess: (updated) => {
      // Com outra edição na fila, esta resposta já está velha: quem grava é a última.
      if (queryClient.isMutating({ mutationKey: userKey }) === 1)
        queryClient.setQueryData(userKey, updated);
    },
    // Falhou: busca de novo o que está no banco, e a tela volta ao que estava salvo.
    onError: () => queryClient.invalidateQueries({ queryKey: userKey }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: USERS_LIST_KEY, exact: true }),
  });

  const remove = useMutation({
    mutationFn: () => hubApi.deleteAdminUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_LIST_KEY, exact: true });
      navigate("/admin/usuarios");
    },
  });

  if (isPending) return <p className="text-muted-foreground">Carregando…</p>;

  if (!user)
    return (
      <div className="mx-auto flex max-w-[980px] flex-col items-start gap-3">
        <h1 className="text-2xl font-bold">Usuário não encontrado</h1>
        <Link to="/admin/usuarios">Voltar para a lista</Link>
      </div>
    );

  function changeRole(role: UserRole) {
    save.mutate({
      apply: (current) => ({ ...current, role }),
      request: () => hubApi.updateAdminUser(id, { role }),
    });
  }

  function changeActive(isActive: boolean) {
    save.mutate({
      apply: (current) => ({ ...current, isActive }),
      request: () => hubApi.updateAdminUser(id, { isActive }),
    });
  }

  function changeAppLevel(app: CatalogApp, level: number | null) {
    save.mutate({
      apply: (current) => withAppLevel(current, app.slug, level),
      request: () =>
        level === null
          ? hubApi.removeAdminUserApp(id, app.slug)
          : hubApi.setAdminUserApp(id, app.slug, level),
    });
  }

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-8">
      <UserProfileHeader user={user} onActiveChange={changeActive} />
      {(save.error || remove.error) && (
        <p role="alert" className="text-sm font-semibold text-danger-text">
          Não deu para salvar. A tela voltou ao que está gravado.
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
  );
}
