import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/session.module.js';
import { AdminUsersController } from './admin-users.controller.js';
import { UsersRepository } from './users.repository.js';
import { AdminUsersService } from './admin-users.service.js';
import { AppsModule } from '../apps/apps.module.js';
import { GemeoModule } from '../gemeo/gemeo.module.js';
import { ExperienceModule } from '../experience/experience.module.js';

@Module({
  imports: [SessionsModule, AppsModule, GemeoModule, ExperienceModule],
  controllers: [AdminUsersController],
  providers: [UsersRepository, AdminUsersService],
  exports: [UsersRepository, AdminUsersService],
})
export class UsersModule {}
