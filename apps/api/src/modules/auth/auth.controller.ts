import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { LoginInput } from '@sondohub/contracts';
import type { Request, Response } from 'express';
import { setSessionCookie } from '../sessions/session-cookie.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
}
