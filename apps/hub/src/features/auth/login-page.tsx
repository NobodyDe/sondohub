import { GalleryVerticalEnd } from "lucide-react";
import { LoginForm } from "./login-form.tsx";
import { safeReturnTo } from "./safe-return-to.ts";
import { ApiError, hubApi } from "@/lib/api.ts";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

async function continueTo(returnTo: string | null) {
  const target = safeReturnTo(returnTo, await hubApi.myApps());
  location.assign(target ?? "/");
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Já tem sessão? Não pede a senha de novo: segue direto para onde ia.
  useEffect(() => {
    hubApi.me().then(
      () => continueTo(returnTo),
      () => {},
    );
  }, [returnTo]);

  async function handleSubmit(event: Form<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setSubmitting(true);
    setError("");
    try {
      await hubApi.login({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      await continueTo(returnTo);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Email ou senha inválidos."
          : "Não foi possível entrar. Tente de novo.",
      );
      setSubmitting(false);
    }
  }
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex items-center gap-2 font-medium">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GalleryVerticalEnd className="size-4" />
            </div>
            SondoHub
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <img
          src="/placeholder.svg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  );
}
