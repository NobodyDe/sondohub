import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import AdminShell from "./components/AdminShell.tsx";
import AppAccessList from "./components/AppAccessList.tsx";
import RemoveUserSection from "./components/RemoveUserSection.tsx";
import RolePicker from "./components/RolePicker.tsx";
import UserProfileHeader from "./components/UserProfileHeader.tsx";
import { FAKE_APPS, FAKE_USERS } from "./fake-users.ts";
import { withAppLevel } from "./user-access.ts";
import type { UserRole } from "@sondohub/contracts";
import type { AdminUser, CatalogApp } from "./types.ts";

export function AdminUserPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // Cópia local para editar. Na integração, cada mudança vira uma chamada à API (useMutation).
  const [user, setUser] = useState<AdminUser | undefined>(() =>
    FAKE_USERS.find((fake) => fake.id === id),
  );
  const apps = FAKE_APPS; // Troca por useQuery(GET /api/admin/apps) na integração.

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
    setUser((current) => current && { ...current, role });
  }

  function changeActive(isActive: boolean) {
    setUser((current) => current && { ...current, isActive });
  }

  function changeAppLevel(app: CatalogApp, level: number | null) {
    setUser((current) => current && withAppLevel(current, app, level));
  }

  function remove() {
    navigate("/admin/usuarios"); // Na integração: DELETE /api/admin/users/:id antes de voltar.
  }

  return (
    <AdminShell>
      <div className="mx-auto flex max-w-[980px] flex-col gap-8">
        <UserProfileHeader user={user} onActiveChange={changeActive} />
        <RolePicker value={user.role} onChange={changeRole} />
        <AppAccessList
          apps={apps}
          grants={user.apps}
          onLevelChange={changeAppLevel}
        />
        <RemoveUserSection onRemove={remove} />
      </div>
    </AdminShell>
  );
}
