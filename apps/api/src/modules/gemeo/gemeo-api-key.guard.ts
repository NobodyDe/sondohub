import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

/** Chamada servidor → servidor do Gêmeo. Mesma chave que o hub já usa para falar com ele. */
@Injectable()
export class GemeoApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const received = Buffer.from(
      context.switchToHttp().getRequest<Request>().header('x-api-key') ?? '',
    );
    const expected = Buffer.from(env.GDS_APY_KEY);
    // tempo constante: com === dá para descobrir a chave medindo a demora da resposta
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      throw new UnauthorizedException();
    return true;
  }
}
