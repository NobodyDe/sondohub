import Switch from "../../../components/Switch.tsx";
import { cn } from "../../../lib/utils.ts";
import { findLevel, lowestLevel } from "../user-access.ts";
import type { AppGrant, CatalogApp } from "../types.ts";

const APP_COLORS = ["bg-g-blue", "bg-g-green", "bg-g-violet", "bg-g-teal"];

type AppAccessListProps = {
  apps: CatalogApp[];
  grants: AppGrant[];
  onLevelChange: (app: CatalogApp, level: number | null) => void;
};

export default function AppAccessList({ apps, grants, onLevelChange }: AppAccessListProps) {
  return (
    <section aria-labelledby="apps-title" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id="apps-title" className="text-lg font-bold">
            Acesso aos aplicativos
          </h2>
          <p className="text-sm text-muted-foreground">Ligue o aplicativo e escolha a permissão.</p>
        </div>
        <span className="text-[13px] text-muted-foreground">
          {grants.length} de {apps.length} liberados
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {apps.map((app, index) => (
          <AppAccessCard
            key={app.slug}
            app={app}
            colorClassName={APP_COLORS[index % APP_COLORS.length]}
            level={findLevel(grants, app.slug)}
            onLevelChange={(level) => onLevelChange(app, level)}
          />
        ))}
      </div>
    </section>
  );
}

type AppAccessCardProps = {
  app: CatalogApp;
  colorClassName: string;
  level: number | null;
  onLevelChange: (level: number | null) => void;
};

function AppAccessCard({ app, colorClassName, level, onLevelChange }: AppAccessCardProps) {
  const hasAccess = level !== null;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[14px] border border-border bg-section p-[18px] transition-opacity",
        !hasAccess && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn("size-10 shrink-0 rounded-[11px]", colorClassName)} aria-hidden />
        <span className="min-w-0 flex-1 text-[15px] font-bold">{app.name}</span>
        <Switch
          checked={hasAccess}
          onCheckedChange={(checked) => onLevelChange(checked ? lowestLevel(app) : null)}
          label={`Acesso ao ${app.name}`}
        />
      </div>

      <div
        role="radiogroup"
        aria-label={`Permissão no ${app.name}`}
        className="grid auto-cols-fr grid-flow-col gap-1 rounded-[10px] bg-background p-1"
      >
        {app.levels.map((option) => (
          <label
            key={option.level}
            className={cn(
              "flex h-[34px] items-center justify-center rounded-lg text-[13px] font-semibold text-ink-body transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              hasAccess ? "cursor-pointer hover:bg-secondary" : "cursor-not-allowed",
              level === option.level && "bg-chip-active text-background hover:bg-chip-active",
            )}
          >
            <input
              type="radio"
              name={`level-${app.slug}`}
              value={option.level}
              checked={level === option.level}
              disabled={!hasAccess}
              onChange={() => onLevelChange(option.level)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
