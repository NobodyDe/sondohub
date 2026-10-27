import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import UserAvatar from "@/components/UserAvatar.tsx";
import { cn } from "@/lib/utils.ts";
import { ROLES } from "../roles.ts";
import type { AdminUser, AdminUserApp } from "@sondohub/contracts";

const APP_COLORS = ["bg-g-deep", "bg-g-royal", "bg-g-azure"];

export default function UsersTable({ users }: { users: AdminUser[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line-subtle bg-sidebar">
      <table className="w-full min-w-[680px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line-divider text-xs font-bold tracking-wider text-ink-label uppercase">
            <th className="px-5 py-3.5 font-bold">Usuário</th>
            <th className="px-5 py-3.5 font-bold">Cargo</th>
            <th className="px-5 py-3.5 font-bold">Aplicativos</th>
            <th className="px-5 py-3.5 font-bold">Status</th>
            <th className="w-12 px-5 py-3.5">
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </tbody>
      </table>

      {users.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
      )}
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const role = ROLES[user.role];

  return (
    <tr className="relative border-b border-line-divider/60 transition-colors last:border-b-0 hover:bg-card">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <UserAvatar name={user.name} url={user.avatarUrl} className="size-9 text-[13px]" />
          <div className="flex min-w-0 flex-col gap-0.5">
            {/* O ::after estica o link pela linha inteira: clicar em qualquer ponto abre o usuário. */}
            <Link
              to={`/admin/usuarios/${user.id}`}
              className="text-sm font-semibold text-foreground no-underline outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
            >
              {user.name}
            </Link>
            <span className="truncate text-[13px] text-muted-foreground">{user.email}</span>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", role.badgeClassName)}>{role.shortLabel}</span>
      </td>
      <td className="px-5 py-3.5">
        <AppsSummary apps={user.apps} />
      </td>
      <td className="px-5 py-3.5">
        <span className="flex items-center gap-2 text-[13px] text-ink-body">
          <span className={cn("size-2 rounded-full", user.isActive ? "bg-online" : "bg-ink-placeholder")} aria-hidden />
          {user.isActive ? "Ativo" : "Inativo"}
        </span>
      </td>
      <td className="px-5 py-3.5 text-ink-placeholder">
        <ChevronRight className="size-[18px]" aria-hidden />
      </td>
    </tr>
  );
}

function AppsSummary({ apps }: { apps: AdminUserApp[] }) {
  if (apps.length === 0) return <span className="text-[13px] text-muted-foreground">Nenhum app</span>;

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex">
        {apps.map((app, index) => (
          <span
            key={app.slug}
            title={app.name}
            className={cn(
              "-mr-1.5 flex size-[22px] items-center justify-center rounded-[7px] border-2 border-sidebar text-[10px] font-bold text-white",
              APP_COLORS[index % APP_COLORS.length],
            )}
          >
            {app.name[0]}
          </span>
        ))}
      </div>
      <span className="ml-1.5 text-[13px] text-ink-body">{apps.length === 1 ? "1 app" : `${apps.length} apps`}</span>
    </div>
  );
}
