import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/session.module.js';
import { AdminUsersController } from './admin-users.controller.js';
import { UsersRepository } from './users.repository.js';

@Module({
  imports: [SessionsModule],
  controllers: [AdminUsersController],
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
