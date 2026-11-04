import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GEMEO_SLUG } from './gemeo-client.js';

@Injectable()
export class GemeoUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Só quem tem acesso ao Gêmeo: a chave dele não lê o perfil de ninguém de fora. */
  findProfiles(ids: string[]) {
    return this.prisma.user.findMany({
      where: {
        id: { in: ids },
        access: { some: { application: { slug: GEMEO_SLUG } } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        isActive: true,
      },
    });
  }
}
