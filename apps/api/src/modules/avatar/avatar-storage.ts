import { randomUUID } from 'node:crypto';
import { BlobServiceClient } from '@azure/storage-blob';
import { Injectable } from '@nestjs/common';
import { env } from '../../config/env.js';

@Injectable()
export class AvatarStorage {
  private readonly container = BlobServiceClient.fromConnectionString(
    env.AZURE_STORAGE_CONNECTION_STRING,
  ).getContainerClient(env.AZURE_STORAGE_CONTAINER);

  /** Nome novo a cada upload: a URL muda, então nenhum cache mostra a foto velha. */
  async save(userId: string, webp: Buffer): Promise<string> {
    const blob = this.container.getBlockBlobClient(
      `avatar/${userId}/${randomUUID()}.webp`,
    );
    await blob.uploadData(webp, {
      blobHTTPHeaders: {
        blobContentType: 'image/webp',
        blobCacheControl: 'public, max-age=31536000, immutable',
      },
    });
    return blob.url;
  }

  async remove(url: string): Promise<void> {
    const prefix = `${this.container.url}/`;
    if (!url.startsWith(prefix)) return; // URL de fora do nosso container: não é nossa para apagar
    await this.container
      .getBlobClient(url.slice(prefix.length))
      .deleteIfExists();
  }
}
