import { Check, Loader2, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import type { CardPropostaItem } from "./card.types.ts";

type Props = {
  item: CardPropostaItem;
  onConfirmar: (id: string) => void;
  onCancelar: (id: string) => void;
};

/**
 * Card de confirmação visual (Human-in-the-Loop / Generative UI).
 * Nenhuma operação de escrita sugerida pelo assistente acontece sem o clique em Confirmar.
 */
export function CardConfirmacao({ item, onConfirmar, onCancelar }: Props) {
  const { proposta, status, mensagemResultado } = item;
  const pendente = status === "pendente";
  const confirmando = status === "confirmando";

  return (
    <div
      role="region"
      aria-label={`Confirmação: ${proposta.titulo}`}
      className="rounded-xl border border-border bg-background p-3 text-xs shadow-sm"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-foreground">{proposta.titulo}</p>
          <p className="text-muted-foreground">{proposta.descricao}</p>
          <div className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-[11px]">
            <p className="font-medium text-foreground">
              {proposta.usuarioAlvo.nome}{" "}
              <span className="font-normal text-muted-foreground">({proposta.usuarioAlvo.email})</span>
            </p>
            <p className="text-muted-foreground">{proposta.detalhe}</p>
          </div>
        </div>
      </div>

      {pendente || confirmando ? (
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={confirmando}
            onClick={() => onCancelar(proposta.id)}
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="size-3.5" />
            Cancelar
          </button>
          <button
            type="button"
            disabled={confirmando}
            onClick={() => onConfirmar(proposta.id)}
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
          >
            {confirmando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Confirmar
          </button>
        </div>
      ) : (
        <p
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[11px] font-medium",
            status === "confirmada" && "text-foreground",
            status === "cancelada" && "text-muted-foreground",
            status === "erro" && "text-destructive",
          )}
        >
          {status === "confirmada" ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
          {status === "cancelada" ? <X className="size-3.5 shrink-0" /> : null}
          <span>{mensagemResultado}</span>
        </p>
      )}
    </div>
  );
}
