import { Search } from "lucide-react";
import { Input } from "../../../components/ui/input.tsx";
import { cn } from "../../../lib/utils.ts";
import { USER_FILTERS, type UserFilterId } from "../user-filters.ts";

type UsersToolbarProps = {
  filter: UserFilterId;
  onFilterChange: (filter: UserFilterId) => void;
  query: string;
  onQueryChange: (query: string) => void;
};

export default function UsersToolbar({ filter, onFilterChange, query, onQueryChange }: UsersToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Filtrar usuários" className="flex flex-wrap gap-2">
        {USER_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => onFilterChange(id)}
            className={cn(
              "h-9 rounded-full border border-input px-4 text-sm font-semibold text-ink-nav transition-colors hover:border-line-hover",
              filter === id && "border-primary bg-primary text-primary-foreground hover:border-primary",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="relative w-full sm:w-[280px]">
        <span className="sr-only">Buscar usuário</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar por nome ou e-mail"
          className="h-10 rounded-[10px] bg-card pl-10"
        />
      </label>
    </div>
  );
}
