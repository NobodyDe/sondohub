import type { Area } from "react-easy-crop";

const SIZE = 512;

/** Recorta a área escolhida no editor e devolve um JPEG 512×512 pronto para enviar. */
export async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const image = new Image();
  image.src = src;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  canvas
    .getContext("2d")!
    .drawImage(image, area.x, area.y, area.width, area.height, 0, 0, SIZE, SIZE);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao recortar."))),
      "image/jpeg",
      0.9,
    ),
  );
}
