import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/session.module.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { DashboardRepository } from './dashboard.repository.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [SessionsModule], // o SessionGuard precisa do SessionsService.
  controllers: [AdminDashboardController],
  providers: [DashboardRepository, DashboardService],
})
export class DashboardModule {}
