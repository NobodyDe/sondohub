import type { HubProfile } from "@sondohub/contracts";
import { Bot, LogOut, Moon, Settings, Sun, UserRound } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import UserAvatar from "../../../components/UserAvatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu.tsx";
import { useThemeStore } from "../../../stores/theme-store.ts";
import { hubApi } from "@/lib/api.ts";
import SettingsDialog from "@/features/settings/SettingsDialog.tsx";
import { useAssistenteConfig } from "../../assistente/use-assistente-config.ts";

export type AccountMenuProps = {
  profile: HubProfile;
  children?: ReactNode; // conteúdo do botão; sem ele, o ícone de engrenagem
};

// text-foreground vence o estilo global de <a> (azul) nos itens que são Link.
const ITEM_CLASS =
  "rounded-none border-t border-border py-2 text-foreground";

async function logout() {
  try {
    await hubApi.logout();
  } finally {
    location.reload();
  }
}

export default function AccountMenu({ profile, children }: AccountMenuProps) {
  // O modal fica fora do menu: o menu desmonta ao fechar e levaria o modal junto.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const assistantAllowed = useAssistenteConfig().data?.autorizado;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Menu da conta"
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-ink-nav transition-colors hover:bg-hover-strong hover:text-foreground"
        >
          {children ?? <Settings className="size-5" strokeWidth={1.8} aria-hidden />}
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
          <DropdownMenuItem className={ITEM_CLASS} onClick={() => setSettingsOpen(true)}>
            <Settings /> Configurações
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM_CLASS} render={<Link to="/perfil" />}>
            <UserRound /> Meu perfil
          </DropdownMenuItem>
          {assistantAllowed && (
            <DropdownMenuItem className={ITEM_CLASS} render={<Link to="/assistente" />}>
              <Bot /> Assistente
            </DropdownMenuItem>
          )}

          <ThemeToggleItem />

          <DropdownMenuItem className={ITEM_CLASS} onClick={logout}>
            <LogOut /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

function ThemeToggleItem() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const isDark = theme === "dark";

  return (
    <DropdownMenuItem className={ITEM_CLASS} onClick={toggleTheme}>
      {isDark ? <Sun /> : <Moon />}
      {isDark ? "Modo claro" : "Modo escuro"}
    </DropdownMenuItem>
  );
}
