import { Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { SsoService } from './sso.service.js';

@Controller('sso')
@UseGuards(SessionGuard)
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  @Post('token')
  @HttpCode(200)
  issueToken(
    @CurrentAuth() auth: AuthContext,
    @Headers('origin') origin?: string,
  ) {
    return this.sso.issueToken(auth.user, origin);
  }
}
