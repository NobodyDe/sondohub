import type { ApiKey } from "@sondohub/contracts";
import { Ellipsis, Trash2 } from "lucide-react";
import { ICON_BUTTON } from "@/components/dialog-classes.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { cn } from "@/lib/utils.ts";

export type ApiKeyActionHandlers = {
  onDelete: (key: ApiKey) => void;
};

type ApiKeyActionsProps = ApiKeyActionHandlers & { apiKey: ApiKey; className?: string };

/** Menu "…" da chave. O mesmo na tabela e no painel. */
export default function ApiKeyActions({ apiKey, onDelete, className }: ApiKeyActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Ações da chave ${apiKey.name}`} className={cn(ICON_BUTTON, className)}>
        <Ellipsis className="size-5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-1.5">
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(apiKey)} className="gap-2.5 px-2.5 py-2">
          <Trash2 /> Excluir chave
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
