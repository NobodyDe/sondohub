import type { HubProfile, LauncherApp } from "@sondohub/contracts";
import { CircleHelp, LayoutGrid, Settings, Star, type LucideIcon } from "lucide-react";
import { Link, NavLink } from "react-router";
import { cn } from "../../../lib/utils.ts";

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Aplicativos", icon: LayoutGrid },
  { to: "/favoritos", label: "Favoritos", icon: Star },
  { to: "/ajuda", label: "Ajuda", icon: CircleHelp },
];

type SidebarProps = {
  profile: HubProfile;
  recentApps?: LauncherApp[];
};

export default function Sidebar({ profile, recentApps = [] }: SidebarProps) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-7 border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground md:sticky md:top-0 md:h-svh md:w-60 md:border-r">
      <Brand />
      <MainNav />
      {recentApps.length > 0 && <RecentApps apps={recentApps} />}
      <UserCard profile={profile} />
    </aside>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1">
      <div className="flex size-8 items-center justify-center rounded-[9px] bg-g-blue">
        <LayoutGrid className="size-[18px] text-white" strokeWidth={2.2} aria-hidden />
      </div>
      <span className="text-xl font-extrabold tracking-tight text-foreground">SondoHub</span>
    </div>
  );
}

function MainNav() {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] text-ink-nav no-underline transition-colors hover:bg-accent hover:text-foreground",
              isActive && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground hover:bg-sidebar-accent",
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
      <span className="px-3 text-xs font-semibold tracking-wider text-ink-label uppercase">Recentes</span>
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
      <Avatar name={profile.name} url={profile.avatarUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-foreground">{profile.name}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-[7px] rounded-full bg-online" aria-hidden />
          SSO · Sondotecnica
        </span>
      </div>
      <Link
        to="/conta"
        aria-label="Configurações da conta"
        className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-ink-nav transition-colors hover:bg-hover-strong hover:text-foreground"
      >
        <Settings className="size-5" strokeWidth={1.8} aria-hidden />
      </Link>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) return <img src={url} alt="" className="size-10 shrink-0 rounded-full object-cover" />;

  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-g-violet text-sm font-bold text-white">
      {initials(name)}
    </div>
  );
}

/** "Henrique dos Santos" → "HS" (primeira letra do primeiro e do último nome). */
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}
