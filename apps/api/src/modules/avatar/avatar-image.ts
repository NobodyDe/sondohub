import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

const SIZE = 512;
const MAX_PIXELS = 40_000_000; // ~6300×6300: mais que qualquer câmera de celular

/** Confere o formato pelos bytes e recodifica: sai um webp novo, quadrado e sem metadados. */
export async function toAvatarWebp(input: Buffer): Promise<Buffer> {
  const image = sharp(input, { limitInputPixels: MAX_PIXELS });
  const metadata = await image.metadata().catch(() => null); // bytes que não são imagem caem aqui

  if (metadata?.format !== 'jpeg' && metadata?.format !== 'png')
    throw new BadRequestException('Envie uma imagem JPEG ou PNG.');

  return image
    .rotate() // aplica a orientação do EXIF antes de ele ser descartado
    .resize(SIZE, SIZE, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer();
}
