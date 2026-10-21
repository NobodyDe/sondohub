import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Campos que podem sair do repositório. password_hash nunca entra aqui. */
export const safeUserSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof safeUserSelect }>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A única consulta que traz o hash da senha: só o login precisa dele. */
  findForLogin(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        ...safeUserSelect,
        passwordHash: true,
        failedLoginCount: true,
        lockedUntil: true,
      },
    });
  }

  async saveLoginAttempts(
    id: string,
    failedLoginCount: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { failedLoginCount, lockedUntil },
    });
  }
}
