import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { hubApi } from "@/lib/api.ts";
import { useThemeStore } from "@/stores/theme-store.ts";
import { BrandPanel } from "./brand-panel.tsx";
import { LoginForm } from "./login-form.tsx";
import { safeReturnTo } from "./safe-return-to.ts";

async function continueTo(returnTo: string | null) {
  const target = safeReturnTo(returnTo, await hubApi.myApps());
  location.assign(target ?? "/");
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  // Já tem sessão? Não pede a senha de novo: segue direto para onde ia.
  useEffect(() => {
    hubApi.me().then(
      () => continueTo(returnTo),
      () => {},
    );
  }, [returnTo]);

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <BrandPanel />
      <main className="relative flex flex-1 items-start justify-center px-6 pt-20 pb-12 lg:min-h-svh lg:items-center lg:px-10 lg:py-12">
        <ThemeToggle />
        <LoginForm className="w-full max-w-[400px]" onSuccess={() => continueTo(returnTo)} />
      </main>
    </div>
  );
}

function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const isDark = theme === "dark";
  const label = isDark ? "Ativar modo claro" : "Ativar modo escuro";

  return (
    <Button
      variant="outline"
      size="icon"
      className="absolute top-5 right-5 size-11 rounded-[10px] lg:top-6 lg:right-6 [&_svg:not([class*='size-'])]:size-5"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
