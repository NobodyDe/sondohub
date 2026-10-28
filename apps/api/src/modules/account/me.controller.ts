import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type UpdateProfileInput,
  updateProfileSchema,
} from '@sondohub/contracts';
import type { Response } from 'express';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { ZodValidationPipe } from '../../common/auth/zod-validation.pipe.js';
import { AppsRepository } from '../apps/apps.repository.js';
import { clearSessionCookie } from '../sessions/session-cookie.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { UsersRepository } from '../users/users.repository.js';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    private readonly apps: AppsRepository,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsService,
  ) {}

  /** Quem é o usuário desta sessão. */
  @Get()
  me(@CurrentAuth() auth: AuthContext) {
    return auth.user;
  }

  /** Apps que ele pode acessar, com o nível em cada um. */
  @Get('apps')
  myApps(@CurrentAuth() auth: AuthContext) {
    return this.apps.listForUser(auth.user.id);
  }

  /** O perfil com a data da última edição, para a tela Meu perfil. */
  @Get('profile')
  profile(@CurrentAuth() auth: AuthContext) {
    return this.users.findProfile(auth.user.id);
  }

  @Patch()
  update(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.users.updateProfile(auth.user.id, body);
  }

  /** O Master não se exclui: evita ficar sem ninguém para administrar o painel. */
  @Delete()
  @HttpCode(204)
  async deleteAccount(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (auth.user.role === 'MASTER')
      throw new ForbiddenException(
        'O Master não pode excluir a própria conta.',
      );
    await this.users.delete(auth.user.id);
    clearSessionCookie(res);
  }

  @Get('sessions')
  async mySessions(@CurrentAuth() auth: AuthContext) {
    const sessions = await this.sessions.listActive(auth.user.id);
    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === auth.sessionId,
    }));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  revokeSession(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sessions.revokeOwn(auth.user.id, id);
  }

  @Delete('sessions')
  @HttpCode(204)
  async revokeAllSessions(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.sessions.revokeAll(auth.user.id);
    clearSessionCookie(res);
  }
}
