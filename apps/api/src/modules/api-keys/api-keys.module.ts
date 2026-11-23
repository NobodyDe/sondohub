import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/session.module.js';
import { ApiKeysService } from './api-keys.service.js';
import { MyApiKeysController } from './my-api-keys.controller.js';

/** Chaves de API: /me/api-keys. SessionsModule entra pelo SessionGuard e pelo hashToken. */
@Module({
  imports: [SessionsModule],
  providers: [ApiKeysService],
  controllers: [MyApiKeysController],
})
export class ApiKeysModule {}
