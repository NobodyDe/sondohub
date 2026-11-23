import type { ApiKey, HubProfile } from "@sondohub/contracts";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";
import BackLink from "@/components/BackLink.tsx";
import { PRIMARY_BUTTON } from "@/components/dialog-classes.ts";
import { Input } from "@/components/ui/input.tsx";
import Sidebar from "@/features/launcher/components/Sidebar.tsx";
import { ApiError, hubApi } from "@/lib/api.ts";
import { cn } from "@/lib/utils.ts";
import { type ApiKeyStatus, keyStatus } from "../api-keys.ts";
import ApiKeyDetailsPanel from "../components/ApiKeyDetailsPanel.tsx";
import ApiKeysTable from "../components/ApiKeysTable.tsx";
import CreateApiKeyDialog from "../components/CreateApiKeyDialog.tsx";
import DeleteApiKeyDialog from "../components/DeleteApiKeyDialog.tsx";
import { useApiKeys } from "../use-api-keys.ts";

export function ApiKeysPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: hubApi.me, retry: false });

  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />;
  if (me.isError) return <p className="p-8 text-danger-text">Não foi possível carregar. Recarregue a página.</p>;
  if (!me.data) return <p className="p-8 text-muted-foreground">Carregando…</p>;

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <Sidebar profile={me.data} />
      <main className="min-w-0 flex-1 px-6 pt-10 pb-16 md:px-12">
        <ApiKeysContent profile={me.data} />
      </main>
    </div>
  );
}

type StatusFilter = "all" | ApiKeyStatus;

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "active", label: "Ativas" },
  { id: "expired", label: "Expiradas" },
];

function ApiKeysContent({ profile }: { profile: HubProfile }) {
  const keys = useApiKeys();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ApiKey | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const all = keys.data ?? [];
  const search = query.trim().toLowerCase();
  const visible = all.filter(
    (key) =>
      (filter === "all" || keyStatus(key) === filter) &&
      (!search || key.name.toLowerCase().includes(search) || key.hint.toLowerCase().includes(search)),
  );
  const actions = { onDelete: setDeleting };

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-7">
      <BackLink to="/" label="Aplicativos" />

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex max-w-[640px] flex-col gap-2">
          <h1 className="flex items-center gap-3 text-4xl font-extrabold tracking-tight">
            Chaves de API
            {keys.data && (
              <span className="rounded-full bg-card px-2.5 py-0.5 text-sm font-bold text-ink-body">
                <span className="sr-only">Total: </span>
                {all.length}
              </span>
            )}
          </h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Conecte scripts e sistemas de outras empresas ao SondoHub. Cada chave age como você.
          </p>
        </div>
        {all.length > 0 && (
          <button type="button" onClick={() => setCreating(true)} className={PRIMARY_BUTTON}>
            <Plus className="size-[18px]" strokeWidth={2.2} aria-hidden />
            Criar chave
          </button>
        )}
      </header>

      {keys.isPending && <p className="text-muted-foreground">Carregando chaves…</p>}
      {keys.isError && <p className="text-danger-text">Não foi possível carregar as chaves. Recarregue a página.</p>}

      {keys.data && all.length === 0 && <EmptyState onCreate={() => setCreating(true)} />}

      {all.length > 0 && (
        <>
          <Toolbar filter={filter} onFilterChange={setFilter} query={query} onQueryChange={setQuery} />
          <ApiKeysTable
            keys={visible}
            selectedId={selectedId}
            onSelect={(key) => setSelectedId(key.id)}
            {...actions}
          />
        </>
      )}

      <ApiKeyDetailsPanel keys={visible} owner={profile} selectedId={selectedId} onSelect={setSelectedId} {...actions} />
      <CreateApiKeyDialog
        open={creating}
        onOpenChange={setCreating}
        owner={profile}
        existingNames={all.map((key) => key.name)}
      />
      <DeleteApiKeyDialog apiKey={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line-dashed px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <KeyRound className="size-7" strokeWidth={1.7} aria-hidden />
      </span>
      <div className="flex max-w-[420px] flex-col gap-1.5">
        <h2 className="text-lg font-bold">Nenhuma chave por aqui</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Crie a primeira chave para um script ou sistema de fora acessar o SondoHub em seu nome.
        </p>
      </div>
      <button type="button" onClick={onCreate} className={cn(PRIMARY_BUTTON, "mt-2")}>
        <Plus className="size-[18px]" strokeWidth={2.2} aria-hidden />
        Criar chave
      </button>
    </section>
  );
}

type ToolbarProps = {
  filter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
};

/** Mesmo desenho da barra de usuários: filtros em pílula à esquerda, busca à direita. */
function Toolbar({ filter, onFilterChange, query, onQueryChange }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-2">
        {FILTERS.map(({ id, label }) => (
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
        <span className="sr-only">Buscar chave</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar por nome ou início da chave"
          className="h-10 rounded-[10px] bg-card pl-10"
        />
      </label>
    </div>
  );
}
