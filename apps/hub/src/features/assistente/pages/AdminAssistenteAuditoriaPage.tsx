import { useQuery } from "@tanstack/react-query";
import BackLink from "@/components/BackLink.tsx";
import { cn } from "@/lib/utils.ts";
import { assistenteApi } from "../api.ts";
import { errorMessage } from "../error-message.ts";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });

/** Últimas chamadas de ferramenta do assistente (90 dias). Só Master. */
export function AdminAssistenteAuditoriaPage() {
  const records = useQuery({ queryKey: ["assistente", "auditoria"], queryFn: () => assistenteApi.auditoria(100) });

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-8">
      <BackLink to="/admin/assistente" label="Assistente" />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Auditoria do assistente</h1>
        <p className="text-sm text-muted-foreground">As 100 últimas chamadas de ferramenta, de todos os usuários, dos últimos 90 dias.</p>
      </header>

      {records.isError ? (
        <p role="alert" className="text-danger-text">
          {errorMessage(records.error)}
        </p>
      ) : records.isPending ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : records.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma chamada registrada ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-divider rounded-[14px] border border-line-subtle">
          {records.data.map((record) => (
            <li key={record.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono font-semibold">{record.ferramenta}</span>
                {record.bloqueada && <span className="rounded-md bg-danger-hover px-1.5 py-0.5 text-xs font-semibold text-danger-text">bloqueada</span>}
                <span className="text-muted-foreground">{record.usuarioNome}</span>
                <time className="ml-auto text-xs text-muted-foreground" dateTime={record.createdAt}>
                  {dateTime.format(new Date(record.createdAt))}
                </time>
              </div>
              {record.argumentos && <Detail label="Pedido" value={record.argumentos} />}
              {record.resultado && <Detail label="Resposta" value={record.resultado} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p className={cn("text-[13px] break-words text-muted-foreground")}>
      <span className="font-semibold">{label}:</span> {value}
    </p>
  );
}
