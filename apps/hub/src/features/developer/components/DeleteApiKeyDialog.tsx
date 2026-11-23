import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useState } from "react";
import { DANGER_BUTTON, DIALOG_BACKDROP, DIALOG_POPUP, SECONDARY_BUTTON } from "@/components/dialog-classes.ts";
import { cn } from "@/lib/utils.ts";
import type { ApiKey } from "@sondohub/contracts";
import { useDeleteApiKey } from "../use-api-keys.ts";

type DeleteApiKeyDialogProps = { apiKey: ApiKey | null; onClose: () => void };

/** Confirmação antes de excluir: a exclusão derruba na hora quem usa a chave e não tem volta. */
export default function DeleteApiKeyDialog({ apiKey, onClose }: DeleteApiKeyDialogProps) {
  const remove = useDeleteApiKey();
  // Mantém o nome na tela durante a animação de saída.
  const [shown, setShown] = useState(apiKey);
  if (apiKey && apiKey !== shown) setShown(apiKey);

  async function confirm() {
    if (!apiKey) return;
    try {
      await remove.mutateAsync(apiKey.id);
      onClose();
    } catch {
      // A mensagem aparece pelo remove.isError; o modal continua aberto para tentar de novo.
    }
  }

  return (
    <AlertDialog.Root
      open={!!apiKey}
      onOpenChange={(open) => !open && !remove.isPending && onClose()}
      onOpenChangeComplete={(open) => !open && remove.reset()}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={DIALOG_BACKDROP} />
        <AlertDialog.Popup className={cn(DIALOG_POPUP, "max-w-[440px] gap-5 p-7")}>
          <AlertDialog.Title className="text-xl font-bold tracking-tight">
            Excluir a chave {shown?.name}?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-[15px] leading-relaxed text-ink-body">
            Scripts e sistemas que usam esta chave param de funcionar na hora. Não dá para desfazer.
          </AlertDialog.Description>

          {remove.isError && (
            <p role="alert" className="text-sm text-danger-text">
              Não deu para excluir a chave. Tente de novo.
            </p>
          )}

          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <AlertDialog.Close disabled={remove.isPending} className={SECONDARY_BUTTON}>
              Cancelar
            </AlertDialog.Close>
            <button type="button" onClick={confirm} disabled={remove.isPending} className={DANGER_BUTTON}>
              {remove.isPending ? "Excluindo…" : "Excluir chave"}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
