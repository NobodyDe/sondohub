import { Search } from "lucide-react";
import { Input } from "../../../components/ui/input.tsx";

type HeaderProps = {
  query: string;
  onQueryChange: (query: string) => void;
};

export default function Header({ query, onQueryChange }: HeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold tracking-tight">Aplicativos</h1>
        <p className="text-[15px] text-muted-foreground">
          Um único login para todas as soluções Sondotecnica.
        </p>
      </div>

      <div className="flex w-full items-center gap-2 sm:w-auto">
        <label className="relative flex-1 sm:w-[300px]">
          <span className="sr-only">Buscar aplicativo</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar aplicativo"
            className="h-11 rounded-xl bg-card pl-10"
          />
        </label>
      </div>
    </header>
  );
}
