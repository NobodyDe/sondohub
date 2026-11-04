import { Module } from '@nestjs/common';
import { GemeoClient } from './gemeo-client.js';
import { GemeoUsersRepository } from './gemeo-users.repository.js';
import { GemeoUsersController } from './gemeo-users.controller.js';

/** Sem controller: só a conversa com o Gêmeo Digital. Quem decide quando chamar é quem importa (hoje, o users). */
@Module({
  controllers: [GemeoUsersController],
  providers: [GemeoClient, GemeoUsersRepository],
  exports: [GemeoClient],
})
export class GemeoModule {}
