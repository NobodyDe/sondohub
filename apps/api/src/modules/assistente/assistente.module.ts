import { Module } from '@nestjs/common';
import { AppsModule } from '../apps/apps.module.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { SessionsModule } from '../sessions/session.module.js';
import { UsersModule } from '../users/users.module.js';
import { AssistenteController } from './assistente.controller.js';
import { AssistenteGateway } from './assistente.gateway.js';
import { AssistenteRepository } from './assistente.repository.js';
import { AssistenteConsultas } from './consultas.js';
import { AssistenteExecutor } from './executor.js';

/**
 * Assistente de IA (voz e chat). Núcleo e vocabulário portados do SondoView; veja docs/assistente/design.md.
 * Consulta os mesmos serviços das telas (apps, usuários, sessões, painel); nunca recalcula nada.
 */
@Module({
  imports: [SessionsModule, AppsModule, UsersModule, DashboardModule],
  controllers: [AssistenteController],
  providers: [AssistenteRepository, AssistenteConsultas, AssistenteExecutor, AssistenteGateway],
  exports: [AssistenteGateway],
})
export class AssistenteModule {}
