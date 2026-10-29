import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AvatarService } from './avatar.service.js';
import { AvatarStorage } from './avatar-storage.js';

/** Sem controller: só a regra da foto. Quem expõe rota é quem importa (hoje, o account). */
@Module({
  imports: [UsersModule],
  providers: [AvatarService, AvatarStorage],
  exports: [AvatarService],
})
export class AvatarModule {}
