import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { LoginInput } from '@sondohub/contracts';
import type { Request, Response } from 'express';
import {
  clearSessionCookie,
  setSessionCookie,
} from '../sessions/session-cookie.js';
import { AuthService } from './auth.service.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import type { AuthContext } from '../../common/auth/auth-context.js';

import { SessionsService } from '../sessions/sessions.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.auth.login(body, {
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    setSessionCookie(res, token);
    return user;
  }
  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.sessions.revoke(auth.sessionId);
    clearSessionCookie(res);
  }
}
