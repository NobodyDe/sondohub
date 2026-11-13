import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { type DashboardQuery, dashboardQuerySchema } from '@sondohub/contracts';
import { MasterGuard } from '../../common/auth/master.guard.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { ZodValidationPipe } from '../../common/auth/zod-validation.pipe.js';
import { DashboardService } from './dashboard.service.js';

@Controller('admin/dashboard')
@UseGuards(SessionGuard, MasterGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** O painel inteiro de uma vez: nesta escala, ~20 consultas pequenas em paralelo respondem rápido. */
  @Get()
  get(@Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery) {
    return this.dashboard.get(query.period);
  }
}
