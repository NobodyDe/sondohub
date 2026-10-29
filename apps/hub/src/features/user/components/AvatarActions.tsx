import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useState } from "react";
import { hubApi } from "@/lib/api.ts";
import AvatarCropDialog from "./AvatarCropDialog.tsx";

export default function AvatarActions({ hasPhoto }: { hasPhoto: boolean }) {
  const queryClient = useQueryClient();
  const [src, setSrc] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: hubApi.removeMyAvatar,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // deixa escolher o mesmo arquivo de novo depois de cancelar
    if (file) setSrc(URL.createObjectURL(file));
  }

  function close() {
    if (src) URL.revokeObjectURL(src); // libera a imagem da memória
    setSrc(null);
  }

  return (
    <div className="mt-1 flex gap-4 text-sm font-semibold">
      {/* O label abre o seletor de arquivos sozinho: sem ref nem .click(). */}
      <label className="cursor-pointer text-link has-[:focus-visible]:underline">
        Trocar foto
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={choose}
          className="sr-only"
        />
      </label>

      {hasPhoto && (
        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="text-danger-text disabled:opacity-50"
        >
          Remover foto
        </button>
      )}

      {src && <AvatarCropDialog src={src} onClose={close} />}
    </div>
  );
}
