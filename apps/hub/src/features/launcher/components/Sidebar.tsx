import type { HubProfile, LauncherApp } from "@sondohub/contracts";
import {
  Blocks,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LayoutGrid,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { NavLink } from "react-router";
import UserAvatar from "../../../components/UserAvatar.tsx";
import { cn } from "../../../lib/utils.ts";
import { usePreferencesStore } from "../../../stores/preferences-store.ts";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_MAX_WIDTH,
  widthFromPointer,
} from "../sidebar-width.ts";
import AccountMenu from "./AccountMenu.tsx";
import HelpDialog from "./HelpDialog.tsx";

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Aplicativos", icon: LayoutGrid },
  { to: "/favoritos", label: "Favoritos", icon: Star },
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
  const width = usePreferencesStore((state) => state.sidebarWidth);
  const setWidth = usePreferencesStore((state) => state.setSidebarWidth);
  const collapsed = width === SIDEBAR_COLLAPSED_WIDTH;

  return (
    <aside
      // Variável CSS em vez de style.width: no celular a sidebar continua ocupando a largura toda.
      style={{ "--sidebar-w": `${width}px` } as CSSProperties}
      className="relative flex w-full shrink-0 flex-col gap-7 border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground md:sticky md:top-0 md:h-svh md:w-(--sidebar-w) md:border-r"
    >
      <Brand collapsed={collapsed} />
      <NavSection title="Principal" items={NAV_ITEMS} collapsed={collapsed}>
        <HelpDialog
          trigger={
            <button
              type="button"
              title={collapsed ? "Ajuda" : undefined}
              className={navItemClass(collapsed)}
            >
              <NavItemContent icon={CircleHelp} label="Ajuda" collapsed={collapsed} />
            </button>
          }
        />
      </NavSection>
      {profile.role === "MASTER" && (
        <NavSection
          title="Administração"
          items={ADMIN_ITEMS}
          collapsed={collapsed}
          showTitle
        />
      )}
      {recentApps.length > 0 && (
        <RecentApps apps={recentApps} collapsed={collapsed} />
      )}
      <UserCard profile={profile} collapsed={collapsed} />

      <ResizeHandle onResize={(x) => setWidth(widthFromPointer(x))} />
      <CollapseButton
        collapsed={collapsed}
        onToggle={() =>
          setWidth(collapsed ? SIDEBAR_MAX_WIDTH : SIDEBAR_COLLAPSED_WIDTH)
        }
      />
    </aside>
  );
}

/** Borda arrastável. A sidebar começa em x = 0, então a posição do mouse já é a largura. */
function ResizeHandle({ onResize }: { onResize: (pointerX: number) => void }) {
  return (
    <div
      aria-hidden // teclado e leitor de tela usam o CollapseButton
      className="absolute inset-y-0 -right-1 hidden w-2 cursor-col-resize transition-colors hover:bg-primary/20 md:block"
      onPointerDown={(event) => {
        event.preventDefault(); // não seleciona texto enquanto arrasta
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          onResize(event.clientX);
      }}
    />
  );
}

type CollapseButtonProps = { collapsed: boolean; onToggle: () => void };

function CollapseButton({ collapsed, onToggle }: CollapseButtonProps) {
  const Icon = collapsed ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
      className="absolute top-7 -right-3 hidden size-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-ink-nav transition-colors hover:text-foreground md:flex"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-2 py-1",
        collapsed && "justify-center px-0",
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-primary">
        <LayoutGrid
          className="size-[18px] text-white"
          strokeWidth={2.2}
          aria-hidden
        />
      </div>
      {!collapsed && (
        <span className="text-xl font-extrabold tracking-tight text-foreground">
          SondoHub
        </span>
      )}
    </div>
  );
}

/** Mesmo visual para links e para o botão de Ajuda. */
function navItemClass(collapsed: boolean, isActive = false) {
  return cn(
    "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] text-ink-nav no-underline transition-colors hover:bg-accent hover:text-foreground",
    collapsed && "justify-center px-0",
    isActive &&
      "bg-sidebar-accent font-semibold text-sidebar-accent-foreground hover:bg-sidebar-accent",
  );
}

type NavItemContentProps = Omit<NavItem, "to"> & { collapsed: boolean };

function NavItemContent({ icon: Icon, label, collapsed }: NavItemContentProps) {
  return (
    <>
      <Icon className="size-5 shrink-0" strokeWidth={1.8} aria-hidden />
      {/* sr-only: o leitor de tela continua lendo o nome no modo só ícones */}
      <span className={cn(collapsed && "sr-only")}>{label}</span>
    </>
  );
}

type NavSectionProps = {
  title: string;
  items: NavItem[];
  collapsed: boolean;
  showTitle?: boolean;
  children?: ReactNode; // itens extras que não são links (ex.: Ajuda)
};

function NavSection({
  title,
  items,
  collapsed,
  showTitle = false,
  children,
}: NavSectionProps) {
  return (
    <nav aria-label={title} className="flex flex-col gap-1">
      {showTitle && !collapsed && (
        <span className="px-3 pb-1.5 text-xs font-semibold tracking-wider text-ink-label uppercase">
          {title}
        </span>
      )}
      {items.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          title={collapsed ? label : undefined}
          className={({ isActive }) => navItemClass(collapsed, isActive)}
        >
          <NavItemContent icon={icon} label={label} collapsed={collapsed} />
        </NavLink>
      ))}
      {children}
    </nav>
  );
}

type RecentAppsProps = { apps: LauncherApp[]; collapsed: boolean };

function RecentApps({ apps, collapsed }: RecentAppsProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {!collapsed && (
        <span className="px-3 text-xs font-semibold tracking-wider text-ink-label uppercase">
          Recentes
        </span>
      )}
      {apps.map((app) => (
        <a
          key={app.slug}
          href={app.url}
          title={collapsed ? app.name : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-ink-nav no-underline transition-colors hover:bg-accent hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <img src={app.iconUrl} alt="" className="size-4 rounded-[4px]" />
          <span className={cn(collapsed && "sr-only")}>{app.name}</span>
        </a>
      ))}
    </div>
  );
}

type UserCardProps = { profile: HubProfile; collapsed: boolean };

function UserCard({ profile, collapsed }: UserCardProps) {
  // Recolhido: só a foto, que vira o botão do menu da conta.
  if (collapsed)
    return (
      <div className="mt-auto flex justify-center">
        <AccountMenu profile={profile}>
          <UserAvatar name={profile.name} url={profile.avatarUrl} />
        </AccountMenu>
      </div>
    );

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
