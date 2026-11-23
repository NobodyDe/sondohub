import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { KeyRound, Moon, Settings2, Sun, SquareCode, X, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { DIALOG_BACKDROP, DIALOG_POPUP, ICON_BUTTON, PRIMARY_BUTTON } from "@/components/dialog-classes.ts";
import { keyStatus } from "@/features/developer/api-keys.ts";
import { useApiKeys } from "@/features/developer/use-api-keys.ts";
import { cn } from "@/lib/utils.ts";
import { useThemeStore } from "@/stores/theme-store.ts";

type TabId = "general" | "developer";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "Geral", icon: Settings2 },
  { id: "developer", label: "Desenvolvedor", icon: SquareCode },
];

type SettingsDialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Configurações do SondoHub: abas à esquerda, conteúdo à direita. No celular as abas viram uma linha. */
export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP} />
        <Dialog.Popup className={cn(DIALOG_POPUP, "h-[min(600px,calc(100svh-2rem))] max-w-[860px]")}>
          <Tabs.Root defaultValue="general" orientation="vertical" className="flex min-h-0 flex-1 flex-col md:flex-row">
            <div className="flex shrink-0 flex-col gap-4 border-line-divider bg-sunken p-4 max-md:border-b md:w-[220px] md:border-r">
              <div className="flex items-center justify-between">
                <Dialog.Title className="px-2 text-base font-bold">Configurações</Dialog.Title>
                <Dialog.Close aria-label="Fechar" className={cn(ICON_BUTTON, "md:hidden")}>
                  <X className="size-5" aria-hidden />
                </Dialog.Close>
              </div>
              <Tabs.List className="flex gap-1 md:flex-col">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <Tabs.Tab
                    key={id}
                    value={id}
                    className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm text-ink-nav outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-sidebar-accent data-active:font-semibold data-active:text-sidebar-accent-foreground"
                  >
                    <Icon className="size-[18px] shrink-0" strokeWidth={1.8} aria-hidden />
                    {label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto p-6 md:p-8">
              <Dialog.Close aria-label="Fechar" className={cn(ICON_BUTTON, "absolute top-4 right-4 max-md:hidden")}>
                <X className="size-5" aria-hidden />
              </Dialog.Close>
              <Tabs.Panel value="general" className="outline-none">
                <GeneralTab />
              </Tabs.Panel>
              <Tabs.Panel value="developer" className="outline-none">
                <DeveloperTab onNavigate={() => onOpenChange(false)} />
              </Tabs.Panel>
            </div>
          </Tabs.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TabHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1 pr-10">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function GeneralTab() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const options = [
    { id: "light", label: "Claro", icon: Sun },
    { id: "dark", label: "Escuro", icon: Moon },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <TabHeading title="Geral" description="Como o SondoHub aparece para você neste navegador." />
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-divider pt-6">
        <div className="flex flex-col gap-0.5">
          <span id="theme-label" className="text-sm font-semibold">
            Tema
          </span>
          <span className="text-[13px] text-muted-foreground">Vale para todas as telas do SondoHub.</span>
        </div>
        <div role="radiogroup" aria-labelledby="theme-label" className="flex rounded-[10px] bg-card p-1">
          {options.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={theme === id}
              onClick={() => theme !== id && toggleTheme()}
              className={cn(
                "flex h-9 items-center gap-2 rounded-[8px] px-3.5 text-sm font-semibold text-ink-nav transition-colors hover:text-foreground",
                theme === id && "bg-background text-foreground shadow-sm",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DeveloperTab({ onNavigate }: { onNavigate: () => void }) {
  const keys = useApiKeys();
  const active = keys.data?.filter((key) => keyStatus(key) === "active").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <TabHeading title="Desenvolvedor" description="Recursos para integrar sistemas ao SondoHub." />

      <section className="flex flex-col gap-4 rounded-2xl border border-line-subtle p-5">
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
            <KeyRound className="size-5" strokeWidth={1.8} aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">Chaves de API</h3>
            <p className="text-sm leading-relaxed text-ink-body">
              Crie chaves para scripts e sistemas de outras empresas conversarem com o SondoHub. Cada chave age como
              você.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-divider pt-4">
          <span className="text-[13px] text-muted-foreground">
            {keys.isPending ? "Carregando…" : active === 1 ? "1 chave ativa" : `${active} chaves ativas`}
          </span>
          <Link to="/desenvolvedor/chaves" onClick={onNavigate} className={cn(PRIMARY_BUTTON, "h-10 text-primary-foreground no-underline hover:text-primary-foreground")}>
            Gerenciar chaves de API
          </Link>
        </div>
      </section>
    </div>
  );
}
