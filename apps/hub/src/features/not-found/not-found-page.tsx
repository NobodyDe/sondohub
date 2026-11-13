import { Cog } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button.tsx";

/** Qualquer rota que não existe (ainda): mostra que o recurso está sendo construído. */
export function NotFoundPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-6 text-center text-foreground">
      {/* A engrenagem faz o papel do "0" do 404. */}
      <p className="flex items-center text-[clamp(6rem,22vw,11rem)] leading-none font-extrabold tracking-tighter">
        <span className="sr-only">404</span>
        <span aria-hidden>4</span>
        <Cog
          aria-hidden
          strokeWidth={1.6}
          className="mx-[0.04em] size-[0.82em] text-primary motion-safe:animate-[spin_12s_linear_infinite]"
        />
        <span aria-hidden>4</span>
      </p>

      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          Recurso em desenvolvimento
        </h1>
        <p className="text-ink-body">
          Esta página ainda está sendo construída. Enquanto isso, seus
          aplicativos continuam disponíveis no início.
        </p>
      </div>

      <Button size="lg" nativeButton={false} render={<Link to="/" />} className="px-5 no-underline">
        Voltar para os aplicativos
      </Button>
    </main>
  );
}
