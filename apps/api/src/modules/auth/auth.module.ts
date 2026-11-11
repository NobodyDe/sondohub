import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { MailModule } from '../mail/mail.module.js';
import { SessionsModule } from '../sessions/session.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordResetController } from './password-reset.controller.js';
import { PasswordResetService } from './password-reset.service.js';

@Module({
  imports: [
    UsersModule,
    SessionsModule,
    MailModule,
    // 10 chamadas por minuto, por IP e por rota. Só vale onde o ThrottlerGuard é usado.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
  ],
  controllers: [AuthController, PasswordResetController],
  providers: [AuthService, PasswordResetService],
})
export class AuthModule {}
