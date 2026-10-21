import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";
import Switch from "../../../components/Switch.tsx";
import UserAvatar from "../../../components/UserAvatar.tsx";
import { cn } from "../../../lib/utils.ts";
import { ROLES } from "../roles.ts";
import type { AdminUser } from "../types.ts";

type UserProfileHeaderProps = {
  user: AdminUser;
  onActiveChange: (isActive: boolean) => void;
};

export default function UserProfileHeader({ user, onActiveChange }: UserProfileHeaderProps) {
  const role = ROLES[user.role];

  return (
    <header className="flex flex-col gap-6">
      <Link
        to="/admin/usuarios"
        className="flex items-center gap-2 self-start rounded-[10px] py-2 pr-3 pl-2 text-sm font-semibold text-ink-nav no-underline transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ChevronLeft className="size-[18px]" aria-hidden />
        Usuários
      </Link>

      <div className="flex flex-wrap items-center gap-5">
        <UserAvatar name={user.name} url={user.avatarUrl} className="size-[72px] text-2xl font-extrabold" />
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl font-extrabold tracking-tight">{user.name}</h1>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", role.badgeClassName)}>
              {role.shortLabel}
            </span>
          </div>
          <span className="text-[15px] text-muted-foreground">{user.email}</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-line-subtle px-4 py-3">
          <span className="text-sm font-semibold">Conta ativa</span>
          <Switch checked={user.isActive} onCheckedChange={onActiveChange} label="Conta ativa" />
        </div>
      </div>
    </header>
  );
}
