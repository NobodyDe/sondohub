import { Module } from '@nestjs/common';
import { AppsModule } from '../apps/apps.module.js';
import { AvatarModule } from '../avatar/avatar.module.js';
import { SessionsModule } from '../sessions/session.module.js';
import { UsersModule } from '../users/users.module.js';
import { MeController } from './me.controller.js';
import { MyAvatarController } from './my-avatar.controller.js';
import { MySessionsController } from './my-sessions.controller.js';

/** As rotas /me: o usuário cuidando da própria conta. A regra fica nos módulos importados. */
@Module({
  imports: [SessionsModule, AppsModule, UsersModule, AvatarModule],
  controllers: [MeController, MySessionsController, MyAvatarController],
})
export class AccountModule {}
