import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

type DashboardCardProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Fica à direita do título: um número de destaque ou botões de escolha. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** Moldura de todos os cards do painel: ícone, título, sombra e a textura do utilitário dash-card. */
export default function DashboardCard({
  icon: Icon,
  title,
  subtitle,
  actions,
  className,
  children,
}: DashboardCardProps) {
  return (
    <article
      className={cn(
        "dash-card flex min-w-0 flex-col rounded-2xl border border-border px-5 py-[18px]",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] border border-border bg-muted text-link">
            <Icon className="size-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold">{title}</h2>
            {subtitle && (
              <p className="text-[12.5px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {actions}
      </header>
      {children}
    </article>
  );
}
