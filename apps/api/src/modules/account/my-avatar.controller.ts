import {
  BadRequestException,
  Controller,
  Delete,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { AvatarService } from '../avatar/avatar.service.js';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // o hub manda ~100 KB já recortado; 2 MB é folga

@Controller('me/avatar')
@UseGuards(SessionGuard)
export class MyAvatarController {
  constructor(private readonly avatar: AvatarService) {}

  /** O multer guarda em memória e responde 413 sozinho se passar do limite. */
  @Put()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } }),
  )
  upload(
    @CurrentAuth() auth: AuthContext,
    @UploadedFile() file: { buffer: Buffer } | undefined, // só o que usamos do arquivo
  ) {
    if (!file) throw new BadRequestException('Envie a imagem no campo "file".');
    return this.avatar.replace(auth.user.id, file.buffer);
  }

  @Delete()
  remove(@CurrentAuth() auth: AuthContext) {
    return this.avatar.remove(auth.user.id);
  }
}
