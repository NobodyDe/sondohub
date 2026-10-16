import { Injectable } from '@nestjs/common';
import type { LauncherApp } from '@sondohub/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AppsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByOrigin(origin: string) {
    return this.prisma.application.findFirst({
      where: { origin, isActive: true },
    });
  }

  async isActiveOrigin(origin: string): Promise<boolean> {
    return (await this.findActiveByOrigin(origin)) !== null;
  }

  findAccessLevel(userId: string, applicationId: string) {
    return this.prisma.userAppAccess.findUnique({
      where: { userId_applicationId: { userId, applicationId } },
      select: { level: true },
    });
  }

  async listForUser(userId: string): Promise<LauncherApp[]> {
    const accesses = await this.prisma.userAppAccess.findMany({
      where: { userId, application: { isActive: true } },
      select: {
        level: true,
        application: {
          select: { slug: true, name: true, iconUrl: true, url: true },
        },
      },
      orderBy: { application: { name: 'asc' } },
    });
    return accesses.map(
      ({
        level,
        application,
      }: {
        level: number;
        application: LauncherApp;
      }) => ({
        ...application,
        level,
      }),
    );
  }
}
