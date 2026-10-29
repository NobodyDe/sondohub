import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { hubApi } from "@/lib/api.ts";
import { cropToBlob } from "../crop-image.ts";

type Props = { src: string; onClose: () => void };

export default function AvatarCropDialog({ src, onClose }: Props) {
  const queryClient = useQueryClient();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const save = useMutation({
    mutationFn: async (area: Area) =>
      hubApi.uploadMyAvatar(await cropToBlob(src, area)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] }); // perfil, sidebar e menu
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-background p-6">
        <h2 id="avatar-title" className="text-lg font-bold">
          Ajustar foto
        </h2>

        {/* O Cropper ocupa o pai inteiro: o pai precisa de position e altura. */}
        <div className="relative h-72 overflow-hidden rounded-xl bg-secondary">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        </div>

        <label className="flex items-center gap-3 text-sm font-semibold">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="flex-1 accent-primary"
          />
        </label>

        {save.isError && (
          <p role="alert" className="text-sm font-semibold text-danger-text">
            Não deu para salvar a foto. Use um JPEG ou PNG e tente de novo.
          </p>
        )}

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[10px] border border-input px-4 text-sm font-semibold transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!area || save.isPending}
            onClick={() => area && save.mutate(area)}
            className="h-10 rounded-[10px] bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            Salvar foto
          </button>
        </div>
      </div>
    </div>
  );
}
