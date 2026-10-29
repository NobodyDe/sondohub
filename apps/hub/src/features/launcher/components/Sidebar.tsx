import type { HubProfile, LauncherApp } from "@sondohub/contracts";
import {
  Blocks,
  CircleHelp,
  LayoutGrid,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router";
import UserAvatar from "../../../components/UserAvatar.tsx";
import { cn } from "../../../lib/utils.ts";
import AccountMenu from "./AccountMenu.tsx";
import { hubApi } from "@/lib/api.ts";

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Aplicativos", icon: LayoutGrid },
  { to: "/favoritos", label: "Favoritos", icon: Star },
  { to: "/ajuda", label: "Ajuda", icon: CircleHelp },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: "/admin/usuarios", label: "Usuários", icon: Users },
  { to: "/admin/aplicativos", label: "Catálogo", icon: Blocks },
];

type SidebarProps = {
  profile: HubProfile;
  recentApps?: LauncherApp[];
};

export default function Sidebar({ profile, recentApps = [] }: SidebarProps) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-7 border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground md:sticky md:top-0 md:h-svh md:w-60 md:border-r">
      <Brand />
      <NavSection title="Principal" items={NAV_ITEMS} />
      {profile.role === "MASTER" && (
        <NavSection title="Administração" items={ADMIN_ITEMS} showTitle />
      )}
      {recentApps.length > 0 && <RecentApps apps={recentApps} />}
      <UserCard profile={profile} />
    </aside>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1">
      <div className="flex size-8 items-center justify-center rounded-[9px] bg-primary">
        <LayoutGrid
          className="size-[18px] text-white"
          strokeWidth={2.2}
          aria-hidden
        />
      </div>
      <span className="text-xl font-extrabold tracking-tight text-foreground">
        SondoHub
      </span>
    </div>
  );
}

type NavSectionProps = {
  title: string;
  items: NavItem[];
  showTitle?: boolean;
};

function NavSection({ title, items, showTitle = false }: NavSectionProps) {
  return (
    <nav aria-label={title} className="flex flex-col gap-1">
      {showTitle && (
        <span className="px-3 pb-1.5 text-xs font-semibold tracking-wider text-ink-label uppercase">
          {title}
        </span>
      )}
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] text-ink-nav no-underline transition-colors hover:bg-accent hover:text-foreground",
              isActive &&
                "bg-sidebar-accent font-semibold text-sidebar-accent-foreground hover:bg-sidebar-accent",
            )
          }
        >
          <Icon className="size-5" strokeWidth={1.8} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function RecentApps({ apps }: { apps: LauncherApp[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-3 text-xs font-semibold tracking-wider text-ink-label uppercase">
        Recentes
      </span>
      {apps.map((app) => (
        <a
          key={app.slug}
          href={app.url}
          className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-ink-nav no-underline transition-colors hover:bg-accent hover:text-foreground"
        >
          <img src={app.iconUrl} alt="" className="size-4 rounded-[4px]" />
          {app.name}
        </a>
      ))}
    </div>
  );
}

function UserCard({ profile }: { profile: HubProfile }) {
  return (
    <div className="mt-auto flex items-center gap-3 rounded-xl bg-card p-3">
      <UserAvatar name={profile.name} url={profile.avatarUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-foreground">
          {profile.name}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-[7px] rounded-full bg-online" aria-hidden />
          SSO · Sondotecnica
        </span>
      </div>
      <AccountMenu profile={profile} />
    </div>
  );
}
