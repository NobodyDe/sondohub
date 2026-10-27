import type { AdminApp, AppLevel } from "@sondohub/contracts";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils.ts";
import AppIcon from "./AppIcon.tsx";

export default function AppsTable({ apps }: { apps: AdminApp[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line-subtle bg-sidebar">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line-divider text-xs font-bold tracking-wider text-ink-label uppercase">
            <th className="px-5 py-3.5 font-bold">Aplicativo</th>
            <th className="px-5 py-3.5 font-bold">Níveis</th>
            <th className="px-5 py-3.5 font-bold">Pessoas</th>
            <th className="px-5 py-3.5 font-bold">Status</th>
            <th className="w-12 px-5 py-3.5">
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <AppRow key={app.id} app={app} />
          ))}
        </tbody>
      </table>

      {apps.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          Nenhum aplicativo ainda. Cadastre o primeiro em “Novo aplicativo”.
        </p>
      )}
    </div>
  );
}

function AppRow({ app }: { app: AdminApp }) {
  return (
    <tr className="relative border-b border-line-divider/60 transition-colors last:border-b-0 hover:bg-card">
      <td className="px-5 py-3.5">
        <div
          className={cn(
            "flex items-center gap-3",
            !app.isActive && "opacity-60",
          )}
        >
          <AppIcon
            name={app.name}
            src={app.iconUrl}
            className="size-9 rounded-[10px] text-[13px]"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            {/* O ::after estica o link pela linha inteira: clicar em qualquer ponto abre o app. */}
            <Link
              to={`/admin/aplicativos/${app.id}`}
              className="text-sm font-semibold text-foreground no-underline outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
            >
              {app.name}
            </Link>
            <span className="truncate text-[13px] text-muted-foreground">
              {app.url}
            </span>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <LevelsSummary levels={app.levels} />
      </td>
      <td className="px-5 py-3.5 text-[13px] text-ink-body">
        {app.userCount === 1 ? "1 pessoa" : `${app.userCount} pessoas`}
      </td>
      <td className="px-5 py-3.5">
        <span className="flex items-center gap-2 text-[13px] text-ink-body">
          <span
            className={cn(
              "size-2 rounded-full",
              app.isActive ? "bg-online" : "bg-ink-placeholder",
            )}
            aria-hidden
          />
          {app.isActive ? "Ativo" : "Inativo"}
        </span>
      </td>
      <td className="px-5 py-3.5 text-ink-placeholder">
        <ChevronRight className="size-[18px]" aria-hidden />
      </td>
    </tr>
  );
}

/** Os rótulos do menor para o maior nível: lê como a escada que são. */
function LevelsSummary({ levels }: { levels: AppLevel[] }) {
  return (
    <ol className="flex flex-wrap gap-1">
      {levels.map((option) => (
        <li
          key={option.level}
          className="rounded-md border border-line-subtle px-2 py-0.5 text-xs font-semibold text-ink-body"
        >
          {option.label}
        </li>
      ))}
    </ol>
  );
}
