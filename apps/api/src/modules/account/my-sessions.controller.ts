import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { clearSessionCookie } from '../sessions/session-cookie.js';
import { SessionsService } from '../sessions/sessions.service.js';

/** Os dispositivos conectados da tela Meu perfil. */
@Controller('me/sessions')
@UseGuards(SessionGuard)
export class MySessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext) {
    const sessions = await this.sessions.listActive(auth.user.id);
    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === auth.sessionId,
    }));
  }

  @Delete(':id')
  @HttpCode(204)
  revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sessions.revokeOwn(auth.user.id, id);
  }

  @Delete()
  @HttpCode(204)
  async revokeAll(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.sessions.revokeAll(auth.user.id);
    clearSessionCookie(res);
  }
}
