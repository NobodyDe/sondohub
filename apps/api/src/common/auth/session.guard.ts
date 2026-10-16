import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { SessionsService } from '../../modules/sessions/sessions.service.js';
import type { AuthContext } from './auth-context.js';

/** Lê o cookie, valida a sessão no banco e pendura o usuário na requisição (req.auth). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { auth?: AuthContext }>();
    const auth = await this.sessions.validate(
      request.cookies[env.SESSION_COOKIE_NAME],
    );
    if (!auth) throw new UnauthorizedException();

    request.auth = auth;
    return true;
  }
}
