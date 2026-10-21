import { useState } from "react";

export default function RemoveUserSection({ onRemove }: { onRemove: () => void }) {
  // Estado só de tela: a confirmação não interessa a mais ninguém, então mora aqui.
  const [confirming, setConfirming] = useState(false);

  return (
    <section
      aria-labelledby="remove-title"
      className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-danger-border/25 p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="remove-title" className="text-base font-bold text-danger-text">
          Remover usuário
        </h2>
        <p className="text-[13px] text-muted-foreground">
          A pessoa perde o acesso a todos os aplicativos. Não dá para desfazer.
        </p>
      </div>

      {confirming ? (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-danger-text">Tem certeza?</span>
          <button
            type="button"
            onClick={onRemove}
            className="h-10 rounded-[10px] bg-destructive px-4 text-sm font-bold text-white transition hover:brightness-110"
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
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-10 rounded-[10px] border border-danger-border/40 px-4 text-sm font-semibold text-danger-text transition-colors hover:bg-danger-hover"
        >
          Remover
        </button>
      )}
    </section>
  );
}
