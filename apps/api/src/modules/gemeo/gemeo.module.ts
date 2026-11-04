import { Module } from '@nestjs/common';
import { GemeoClient } from './gemeo-client.js';

/** Sem controller: só a conversa com o Gêmeo Digital. Quem decide quando chamar é quem importa (hoje, o users). */
@Module({
  providers: [GemeoClient],
  exports: [GemeoClient],
})
export class GemeoModule {}
