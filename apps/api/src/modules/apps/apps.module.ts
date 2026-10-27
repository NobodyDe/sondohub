import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/session.module.js';
import { AdminAppsController } from './admin-apps-controller.js';
import { AdminAppsService } from './admin-apps.service.js';
import { AppsRepository } from './apps.repository.js';

@Module({
  imports: [SessionsModule], // o SessionGuard precisa do SessionsService.
  controllers: [AdminAppsController],
  providers: [AppsRepository, AdminAppsService],
  exports: [AppsRepository],
})
export class AppsModule {}
