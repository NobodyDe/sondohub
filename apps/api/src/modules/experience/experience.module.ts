import { Module } from '@nestjs/common';
import { ExperienceClient } from './experience-client.js';

/** Sem controller: só a conversa com a API do Experience. Quem decide quando chamar é o users. */
@Module({
  providers: [ExperienceClient],
  exports: [ExperienceClient],
})
export class ExperienceModule {}
