import type { AdminUserDetail, UserRole } from "@sondohub/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { hubApi } from "@/lib/api.ts";
import { useDebounceByKey } from "@/lib/use-debounce-by-key.ts";
import AppAccessList from "../../shared/AppAccessList.tsx";
import type { CatalogApp } from "../../shared/types.ts";
import { grantsOf, withAppLevel } from "../../shared/user-access.ts";
import RemoveUserSection from "../components/RemoveUserSection.tsx";
import RolePicker from "../components/RolePicker.tsx";
import UserProfileHeader from "../components/UserProfileHeader.tsx";
import { USERS_LIST_KEY } from "../use-users-page.ts";

const DEBOUNCE_MS = 500; // cliques seguidos no mesmo campo viram uma requisição só.

/** Uma edição: qual campo (key), como a tela fica agora (apply) e a chamada que grava (request). */
type Edit = {
  key: string;
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

  const debounce = useDebounceByKey(DEBOUNCE_MS);

  const save = useMutation({
    mutationKey: userKey, // para contar quantas edições deste usuário estão em andamento.
    scope: { id: `admin-user-${id}` }, // uma requisição por vez, na ordem dos cliques.
    mutationFn: (request: Edit["request"]) => request(),
    onSuccess: (updated) => {
      // Com outra edição na fila ou esperando o debounce, esta resposta já está velha: quem grava é a última.
      if (queryClient.isMutating({ mutationKey: userKey }) === 1 && !debounce.hasPending())
        queryClient.setQueryData(userKey, updated);
    },
    // Falhou: busca de novo o que está no banco, e a tela volta ao que estava salvo.
    onError: () => queryClient.invalidateQueries({ queryKey: userKey }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: USERS_LIST_KEY }),
  });

  const remove = useMutation({
    mutationFn: () => hubApi.deleteAdminUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_LIST_KEY });
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

  /** A tela muda no clique; a gravação espera o usuário parar de mexer naquele campo. */
  async function edit({ key, apply, request }: Edit) {
    await queryClient.cancelQueries({ queryKey: userKey }); // um GET atrasado não desfaz o clique.
    queryClient.setQueryData<AdminUserDetail>(userKey, (current) => current && apply(current));
    debounce.schedule(key, () => save.mutate(request));
  }

  function changeRole(role: UserRole) {
    edit({
      key: "role",
      apply: (current) => ({ ...current, role }),
      request: () => hubApi.updateAdminUser(id, { role }),
    });
  }

  function changeActive(isActive: boolean) {
    edit({
      key: "isActive",
      apply: (current) => ({ ...current, isActive }),
      request: () => hubApi.updateAdminUser(id, { isActive }),
    });
  }

  function changeAppLevel(app: CatalogApp, level: number | null) {
    edit({
      key: `app:${app.slug}`, // o switch e o nível do mesmo app se substituem: vai só o estado final.
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
