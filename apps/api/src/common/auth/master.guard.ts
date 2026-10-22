import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from './auth-context.js';

/** Barra quem não é MASTER. Precisa rodar depois do SessionGuard, que preenche req.auth. */
@Injectable()
export class MasterGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { auth } = context
      .switchToHttp()
      .getRequest<Request & { auth?: AuthContext }>();
    if (auth?.user.role !== 'MASTER') throw new ForbiddenException();

    return true;
  }
}
