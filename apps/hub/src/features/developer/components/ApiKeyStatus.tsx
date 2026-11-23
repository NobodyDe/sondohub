import { cn } from "@/lib/utils.ts";
import { type ApiKeyStatus as Status, STATUS_LABELS } from "../api-keys.ts";

const DOT: Record<Status, string> = {
  active: "bg-online",
  expired: "bg-favorite",
};

/** Ponto colorido e o nome do status, no mesmo formato da tabela de usuários. */
export default function ApiKeyStatus({ status }: { status: Status }) {
  return (
    <span className="flex items-center gap-2 text-[13px] text-ink-body">
      <span className={cn("size-2 shrink-0 rounded-full", DOT[status])} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}
