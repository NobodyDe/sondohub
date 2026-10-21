import { Module } from '@nestjs/common';
import { AppsModule } from '../apps/apps.module.js';
import { SessionsModule } from '../sessions/session.module.js';
import { JwksController } from './jwks.controller.js';
import { SsoController } from './sso.controller.js';
import { SsoService } from './sso.service.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [AppsModule, SessionsModule],
  controllers: [SsoController, JwksController],
  providers: [SsoService, TokenService],
})
export class SsoModule {}
