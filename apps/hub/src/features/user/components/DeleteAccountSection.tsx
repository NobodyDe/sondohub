import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { hubApi } from "@/lib/api.ts";

export default function DeleteAccountSection() {
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: hubApi.deleteMyAccount,
    onSuccess: () => location.assign("/login"),
  });

  if (!confirming)
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="h-10 rounded-[10px] border border-danger-border/40 px-4 text-sm font-semibold text-danger-text transition-colors hover:bg-danger-hover"
      >
        Excluir conta
      </button>
    );

  return (
    <div role="alert" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-danger-text">Tem certeza?</span>
      <button
        type="button"
        onClick={() => remove.mutate()}
        disabled={remove.isPending}
        className="h-10 rounded-[10px] bg-destructive px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        Sim, excluir
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="h-10 rounded-[10px] border border-input px-4 text-sm font-semibold transition-colors hover:bg-secondary"
      >
        Cancelar
      </button>
    </div>
  );
}
