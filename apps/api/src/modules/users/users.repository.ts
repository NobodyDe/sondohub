import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  AdminUser,
  AdminUserDetail,
  AppLevel,
  UpdateUserInput,
} from '@sondohub/contracts';

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

  async listAll(): Promise<AdminUser[]> {
    const users = await this.prisma.user.findMany({
      select: {
        ...safeUserSelect,
        access: {
          select: {
            level: true,
            application: { select: { slug: true, name: true } },
          },
          orderBy: { application: { name: 'asc' } },
        },
      },
      orderBy: { name: 'asc' },
    });

    return users.map(({ access, ...user }) => ({
      ...user,
      apps: access.map(({ level, application }) => ({ ...application, level })),
    }));
  }

  /** Um usuário e TODOS os apps ativos, dizendo em quais ele entra e com que nível. */
  async findDetail(id: string): Promise<AdminUserDetail | null> {
    const [user, apps] = await Promise.all([
      this.prisma.user.findUnique({ where: { id }, select: safeUserSelect }),
      this.prisma.application.findMany({
        where: { isActive: true },
        select: {
          slug: true,
          name: true,
          levels: true,
          // Só o acesso deste usuário: volta [] (sem acesso) ou [{ level }].
          access: { where: { userId: id }, select: { level: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    if (!user) return null;

    return {
      ...user,
      apps: apps.map(({ access, levels, ...app }) => ({
        ...app,
        levels: levels as AppLevel[], // coluna Json: o Prisma não sabe o formato, o seed sabe.
        hasAccess: access.length > 0,
        level: access[0]?.level ?? null,
      })),
    };
  }

  async update(id: string, data: UpdateUserInput): Promise<void> {
    await this.prisma.user.update({ where: { id }, data });
  }

  /** Cria o acesso ou troca o nível: "liberar" e "mudar nível" são a mesma operação. */
  async upsertAccess(
    userId: string,
    applicationId: string,
    level: number,
  ): Promise<void> {
    await this.prisma.userAppAccess.upsert({
      where: { userId_applicationId: { userId, applicationId } },
      update: { level },
      create: { userId, applicationId, level },
    });
  }

  /** deleteMany não quebra se o acesso já não existia: tirar duas vezes dá o mesmo resultado. */
  async deleteAccess(userId: string, applicationId: string): Promise<void> {
    await this.prisma.userAppAccess.deleteMany({
      where: { userId, applicationId },
    });
  }

  /** Sessões e acessos saem junto (onDelete: Cascade no schema). */
  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }
}
