import { Module } from '@nestjs/common';
import { AppsModule } from '../apps/apps.module.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { SessionsModule } from '../sessions/session.module.js';
import { AdminUsersService } from '../users/admin-users.service.js';
import { UsersModule } from '../users/users.module.js';
import { AssistenteController } from './assistente.controller.js';
import { AssistenteGateway } from './assistente.gateway.js';
import { AssistenteRepository } from './assistente.repository.js';
import { AssistenteConsultas } from './consultas.js';
import { AssistenteExecutor } from './executor.js';
import { AssistenteFederacaoService } from './federacao/federacao.service.js';
import { ADMIN_USERS_WRITER } from './propostas/proposta.types.js';
import { AssistentePropostasService } from './propostas/propostas.service.js';

/**
 * Assistente de IA (voz e chat). Núcleo e vocabulário portados do SondoView; veja docs/assistente/design.md.
 * Inclui subpastas escaláveis:
 * - `propostas/`: escrita administrativa com confirmação visual (Human-in-the-Loop).
 * - `federacao/`: consulta federada estilo MCP HTTP aos aplicativos filhos.
 */
@Module({
  imports: [SessionsModule, AppsModule, UsersModule, DashboardModule],
  controllers: [AssistenteController],
  providers: [
    AssistenteRepository,
    AssistenteConsultas,
    { provide: ADMIN_USERS_WRITER, useExisting: AdminUsersService },
    AssistentePropostasService,
    AssistenteFederacaoService,
    AssistenteExecutor,
    AssistenteGateway,
  ],
  exports: [AssistenteGateway],
})
export class AssistenteModule {}
