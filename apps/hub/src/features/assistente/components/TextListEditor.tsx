import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import Switch from "@/components/Switch.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { AssistenteEntradaTexto } from "../api.ts";
import { errorMessage } from "../error-message.ts";

type Item = { id: string; texto: string; ativo: boolean; origem?: "usuario" | "assistente" };

type Props = {
  queryKey: readonly string[];
  list: () => Promise<Item[]>;
  create: (entrada: AssistenteEntradaTexto) => Promise<Item>;
  edit: (id: string, entrada: AssistenteEntradaTexto) => Promise<Item>;
  remove: (id: string) => Promise<void>;
  /** Limites do servidor: quantidade de itens e tamanho de cada texto. */
  maxItems: number;
  maxLength: number;
  label: string;
  empty: string;
};

/** Lista de textos curtos do usuário (memórias, perguntas rápidas): adicionar, ligar/desligar e apagar. */
export default function TextListEditor({ queryKey, list, create, edit, remove, maxItems, maxLength, label, empty }: Props) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const items = useQuery({ queryKey, queryFn: list });
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const add = useMutation({
    mutationFn: () => create({ texto: text }),
    onSuccess: () => {
      setText("");
      return refresh();
    },
  });
  const toggle = useMutation({ mutationFn: (item: Item) => edit(item.id, { ativo: !item.ativo }), onSettled: refresh });
  const del = useMutation({ mutationFn: remove, onSettled: refresh });

  const error = [add.error, toggle.error, del.error, items.error].find(Boolean);
  const full = (items.data?.length ?? 0) >= maxItems;

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-wrap items-center gap-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim() && !full) add.mutate();
        }}
      >
        <Input
          aria-label={label}
          placeholder={label}
          value={text}
          maxLength={maxLength}
          onChange={(event) => setText(event.target.value)}
          className="h-11 flex-[1_1_260px] rounded-[10px] bg-background"
        />
        <button
          type="submit"
          disabled={!text.trim() || full || add.isPending}
          className="h-11 rounded-[10px] bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          Adicionar
        </button>
      </form>
      <p className="-mt-3 text-[13px] text-muted-foreground">
        {items.data?.length ?? 0} de {maxItems}. Até {maxLength} caracteres cada.
      </p>

      {error != null && (
        <p role="alert" className="text-sm font-semibold text-danger-text">
          {errorMessage(error)}
        </p>
      )}

      {items.isPending ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : items.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-divider rounded-[14px] border border-line-subtle">
          {items.data?.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <p className={`min-w-0 flex-1 text-sm break-words ${item.ativo ? "" : "text-muted-foreground line-through"}`}>
                {item.texto}
                {item.origem === "assistente" && <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground no-underline">guardado pelo assistente</span>}
              </p>
              <Switch checked={item.ativo} onCheckedChange={() => toggle.mutate(item)} label={`Ativar: ${item.texto}`} />
              <button
                type="button"
                aria-label={`Apagar: ${item.texto}`}
                onClick={() => del.mutate(item.id)}
                className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-danger-text transition-colors hover:bg-danger-hover"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
