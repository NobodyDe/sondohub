import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../users/users.repository.js';
import { toAvatarWebp } from './avatar-image.js';
import { AvatarStorage } from './avatar-storage.js';

@Injectable()
export class AvatarService {
  constructor(
    private readonly users: UsersRepository,
    private readonly storage: AvatarStorage,
  ) {}

  async replace(userId: string, file: Buffer) {
    const url = await this.storage.save(userId, await toAvatarWebp(file));
    return this.swap(userId, url);
  }

  remove(userId: string) {
    return this.swap(userId, null);
  }

  /** Banco primeiro, arquivo velho depois: se algo falhar no meio, sobra um arquivo órfão, nunca um link quebrado. */
  private async swap(userId: string, url: string | null) {
    const { avatarUrl: old } = await this.users.findProfile(userId);
    const profile = await this.users.setAvatar(userId, url);
    if (old) await this.storage.remove(old);
    return profile;
  }
}
