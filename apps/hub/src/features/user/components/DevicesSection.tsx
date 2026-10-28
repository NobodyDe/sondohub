import type { MySession } from "@sondohub/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor, Smartphone } from "lucide-react";
import { hubApi } from "@/lib/api.ts";
import { describeDevice } from "../device.ts";
import { formatDateTime } from "../format-date.ts";

const SESSIONS_KEY = ["me", "sessions"];

export default function DevicesSection() {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: hubApi.mySessions,
  });

  const revoke = useMutation({
    mutationFn: (session: MySession) => hubApi.revokeMySession(session.id),
    onSuccess: (_, session) => {
      // Saiu deste aparelho: não há mais sessão aqui.
      if (session.isCurrent) location.assign("/login");
      else queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });
  const revokeAll = useMutation({
    mutationFn: hubApi.revokeAllMySessions,
    onSuccess: () => location.assign("/login"),
  });

  if (sessions.isPending)
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (sessions.isError)
    return (
      <p className="text-sm text-danger-text">
        Não foi possível carregar os dispositivos.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-line-divider rounded-[14px] border border-line-subtle">
        {sessions.data.map((session) => (
          <DeviceRow
            key={session.id}
            session={session}
            onRevoke={() => revoke.mutate(session)}
          />
        ))}
      </ul>
      <button
        type="button"
        onClick={() => revokeAll.mutate()}
        disabled={revokeAll.isPending}
        className="h-10 self-end rounded-[10px] border border-danger-border/40 px-4 text-sm font-semibold text-danger-text transition-colors hover:bg-danger-hover disabled:opacity-50"
      >
        Sair de todos
      </button>
    </div>
  );
}

function DeviceRow({
  session,
  onRevoke,
}: {
  session: MySession;
  onRevoke: () => void;
}) {
  const { browser, system, isMobile } = describeDevice(session.userAgent);

  return (
    <li className="flex items-center gap-4 p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
        {isMobile ? (
          <Smartphone className="size-5" aria-hidden />
        ) : (
          <Monitor className="size-5" aria-hidden />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {browser} no {system}
          {session.isCurrent && (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">
              Este dispositivo
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {session.ip && `IP ${session.ip}, `}conectado em{" "}
          {formatDateTime(session.createdAt)}
        </span>
      </div>
      <button
        type="button"
        onClick={onRevoke}
        className="h-9 rounded-[10px] px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        Sair
      </button>
    </li>
  );
}
