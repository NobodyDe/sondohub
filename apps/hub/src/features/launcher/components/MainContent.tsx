import { ArrowRight, Star } from "lucide-react";
import { cn } from "../../../lib/utils.ts";
import type { AppView } from "../types/types.ts";

type MainContentProps = {
  apps: AppView[];
  query: string;
  onToggleFavorite: (slug: string) => void;
};

export default function MainContent({
  apps,
  query,
  onToggleFavorite,
}: MainContentProps) {
  if (apps.length === 0)
    return (
      <EmptyState
        title="Você não tem acesso a nenhum aplicativo"
        description="Entre em contato com o administrador."
      />
    );

  const visibleApps = filterApps(apps, query);
  if (visibleApps.length === 0)
    return (
      <EmptyState
        title="Nenhum aplicativo encontrado"
        description="Tente buscar por outro nome."
      />
    );

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
      {visibleApps.map((app) => (
        <AppCard
          key={app.slug}
          app={app}
          onToggleFavorite={() => onToggleFavorite(app.slug)}
        />
      ))}
    </ul>
  );
}

type AppCardProps = {
  app: AppView;
  onToggleFavorite: () => void;
};

function AppCard({ app, onToggleFavorite }: AppCardProps) {
  return (
    <li className="relative flex min-h-44 flex-col gap-4 border border-border bg-sidebar p-5 transition hover:-translate-y-0.5 hover:border-line-hover">
      <div className="flex items-center gap-3.5">
        {app.icon ? (
          <span
            className={cn(
              "flex size-13 shrink-0 items-center justify-center rounded-[14px] text-white",
              app.gradient,
            )}
          >
            <app.icon className="size-6" aria-hidden />
          </span>
        ) : (
          <img src={app.iconUrl} alt="" className="size-13 rounded-[14px]" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* O ::after estica o link pelo card inteiro; a estrela fica por cima (z-10). */}
          <a
            href={app.url}
            className="text-[17px] font-bold text-foreground no-underline outline-none after:absolute after:inset-0 after:rounded-[14px] focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {app.name}
          </a>
          <span className="text-xs font-semibold text-muted-foreground">
            {app.category}
          </span>
        </div>
        <FavoriteButton
          appName={app.name}
          isFavorite={app.isFavorite}
          onToggle={onToggleFavorite}
        />
      </div>

      {app.description && (
        <p className="text-sm leading-relaxed text-ink-body">
          {app.description}
        </p>
      )}

      <span className="mt-auto flex items-center gap-1.5 text-[13px] font-semibold text-link">
        Abrir aplicativo
        <ArrowRight className="size-4" aria-hidden />
      </span>
    </li>
  );
}

type FavoriteButtonProps = {
  appName: string;
  isFavorite: boolean;
  onToggle: () => void;
};

function FavoriteButton({
  appName,
  isFavorite,
  onToggle,
}: FavoriteButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isFavorite}
      aria-label={
        isFavorite ? `Remover ${appName} dos favoritos` : `Favoritar ${appName}`
      }
      className="group relative z-10 flex size-9 shrink-0 items-center justify-center rounded-[10px] outline-none transition-colors hover:bg-hover-strong focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Star
        strokeWidth={1.8}
        aria-hidden
        className={cn(
          "size-[18px] transition-colors",
          isFavorite
            ? "fill-favorite text-favorite"
            : "text-muted-foreground group-hover:fill-favorite group-hover:text-favorite",
        )}
      />
    </button>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-line-dashed px-5 py-10 text-center">
      <p className="text-base font-bold">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** Ignora maiúsculas e acentos: "gemeo" encontra "Gêmeo Digital". */
function filterApps(apps: AppView[], query: string) {
  const term = normalize(query);
  if (!term) return apps;
  return apps.filter((app) => normalize(app.name).includes(term));
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}
