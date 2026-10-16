import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AccountModule } from './modules/account/account.module.js';

@Module({
  imports: [PrismaModule, AuthModule, AccountModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
