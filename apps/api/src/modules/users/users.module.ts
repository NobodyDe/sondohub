import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/session.module.js';
import { AdminUsersController } from './admin-users.controller.js';
import { UsersRepository } from './users.repository.js';
import { AdminUsersService } from './admin-users.service.js';
import { AppsModule } from '../apps/apps.module.js';

@Module({
  imports: [SessionsModule, AppsModule],
  controllers: [AdminUsersController],
  providers: [UsersRepository, AdminUsersService],
  exports: [UsersRepository],
})
export class UsersModule {}
