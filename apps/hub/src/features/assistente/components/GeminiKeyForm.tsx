import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, CircleAlert, CircleCheck, Copy, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input.tsx";
import { assistenteApi } from "../api.ts";
import { errorMessage } from "../error-message.ts";
import { useAtualizarConfigAssistente } from "../use-assistente-config.ts";

const MASK = "••••••••••••••••••••";
const BUTTON =
  "flex h-11 items-center gap-1.5 rounded-[10px] border border-input px-3.5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-50";

/** Chave inválida segundo o Gemini: não é erro de HTTP, então não passa por errorMessage. */
class InvalidKeyError extends Error {}

type Props = {
  /** 'global' = chave da empresa (só Master); 'propria' = chave desta pessoa, que vale no lugar da global. */
  scope: "global" | "propria";
  configured: boolean;
};

/** Campo da chave do Gemini: só salva se o Gemini aceitar; permite validar a salva, copiar e remover. */
export default function GeminiKeyForm({ scope, configured }: Props) {
  const [key, setKey] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const updateConfig = useAtualizarConfigAssistente();
  const save = scope === "global" ? assistenteApi.salvarChaveGlobal : assistenteApi.salvarChavePropria;
  const read = scope === "global" ? assistenteApi.chaveGlobal : assistenteApi.chavePropria;
  const typed = key.trim();

  const fail = (error: unknown) =>
    setStatus({ ok: false, text: error instanceof InvalidKeyError ? error.message : errorMessage(error) });

  const validate = useMutation({
    mutationFn: () => assistenteApi.validarChave(scope, typed || undefined),
    onSuccess: (result) => setStatus({ ok: result.valida, text: result.mensagem }),
    onError: fail,
  });

  const store = useMutation({
    mutationFn: async () => {
      const result = await assistenteApi.validarChave(scope, typed);
      if (!result.valida) throw new InvalidKeyError(result.mensagem);
      return save(typed);
    },
    onSuccess: (config) => {
      updateConfig(config);
      setKey("");
      setStatus({ ok: true, text: "Chave salva." });
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: () => save(""),
    onSuccess: (config) => {
      updateConfig(config);
      setConfirming(false);
      setStatus({ ok: true, text: "Chave removida." });
    },
    onError: fail,
  });

  const copy = useMutation({
    mutationFn: async () => navigator.clipboard.writeText(await read()),
    onSuccess: () => setStatus({ ok: true, text: "Chave copiada." }),
    onError: () => setStatus({ ok: false, text: "Não deu para copiar." }),
  });

  const busy = validate.isPending || store.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed && !busy) store.mutate();
        }}
      >
        <Input
          type="password"
          autoComplete="off"
          aria-label="Chave de API do Gemini"
          placeholder="Cole a API key"
          maxLength={200}
          value={key || (configured ? MASK : "")}
          onFocus={(event) => !key && configured && event.currentTarget.select()}
          onChange={(event) => {
            setKey(event.target.value);
            setStatus(null);
          }}
          className="h-11 flex-[1_1_240px] rounded-[10px] bg-background"
        />
        <button
          type="submit"
          disabled={!typed || busy}
          className="flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          <KeyRound className="size-4" aria-hidden />
          {store.isPending ? "Validando…" : "Salvar"}
        </button>
        {(configured || typed) && (
          <button type="button" disabled={busy} onClick={() => validate.mutate()} className={BUTTON}>
            <BadgeCheck className="size-4" aria-hidden /> Validar
          </button>
        )}
        {configured && (
          <button type="button" disabled={busy} onClick={() => copy.mutate()} className={BUTTON} aria-label="Copiar chave">
            <Copy className="size-4" aria-hidden />
          </button>
        )}
        {configured && !confirming && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            aria-label="Remover chave"
            className="flex h-11 items-center rounded-[10px] border border-danger-border/40 px-3.5 text-danger-text transition-colors hover:bg-danger-hover disabled:opacity-50"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </form>

      {confirming && (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-danger-text">Apagar a chave salva?</span>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="h-10 rounded-[10px] bg-destructive px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            Sim, remover
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-10 rounded-[10px] border border-input px-4 text-sm font-semibold transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
        </div>
      )}

      {status && (
        <p
          role="status"
          className={`flex items-center gap-1.5 text-sm font-medium ${status.ok ? "text-emerald-600 dark:text-emerald-400" : "text-danger-text"}`}
        >
          {status.ok ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
          {status.text}
        </p>
      )}
    </div>
  );
}
