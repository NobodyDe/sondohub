import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { type AppClickInput, appClickSchema } from '@sondohub/contracts';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { ZodValidationPipe } from '../../common/auth/zod-validation.pipe.js';
import { AppEventsService } from './app-events.service.js';

@Controller('events')
@UseGuards(SessionGuard)
export class AppEventsController {
  constructor(private readonly events: AppEventsService) {}

  /** Clique num app do launcher do hub. Chega por sendBeacon, então ninguém lê a resposta. */
  @Post('app-click')
  @HttpCode(204)
  async appClick(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(appClickSchema)) body: AppClickInput,
  ): Promise<void> {
    await this.events.recordClick(auth.user.id, body.slug);
  }
}
