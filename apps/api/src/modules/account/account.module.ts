import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/session.module.js';
import { MeController } from './me.controller.js';
import { AppsModule } from '../apps/apps.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [SessionsModule, AppsModule, UsersModule],
  controllers: [MeController],
})
export class AccountModule {}
