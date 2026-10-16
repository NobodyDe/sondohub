import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { AppsRepository } from '../apps/apps.repository.js';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly apps: AppsRepository) {}

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
}
