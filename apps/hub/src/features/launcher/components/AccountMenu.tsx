import type { HubProfile } from "@sondohub/contracts";
import { Moon, Settings, Sun, UserRound } from "lucide-react";
import { Link } from "react-router";
import UserAvatar from "../../../components/UserAvatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu.tsx";
import { useThemeStore } from "../../../stores/theme-store.ts";

export default function AccountMenu({ profile }: { profile: HubProfile }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu da conta"
        className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-ink-nav transition-colors hover:bg-hover-strong hover:text-foreground"
      >
        <Settings className="size-5" strokeWidth={1.8} aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="end" className="w-72">
        <div className="flex items-center gap-3 p-2">
          <UserAvatar name={profile.name} url={profile.avatarUrl} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">
              {profile.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {profile.email}
            </span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/conta" />}>
          <Settings /> Configurações
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/perfil" />}>
          <UserRound /> Meu perfil
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        <ThemeToggleItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggleItem() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const isDark = theme === "dark";

  return (
    <DropdownMenuItem onClick={toggleTheme}>
      {isDark ? <Sun /> : <Moon />}
      {isDark ? "Modo claro" : "Modo escuro"}
    </DropdownMenuItem>
  );
}
