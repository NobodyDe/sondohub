import { Injectable } from '@nestjs/common';
import type {
  AdminApp,
  AppLevel,
  CreateAppInput,
  LauncherApp,
} from '@sondohub/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '@prisma/client';

export type AppData = CreateAppInput & { origin: string };

const adminAppSelect = {
  id: true,
  slug: true,
  name: true,
  iconUrl: true,
  url: true,
  origin: true,
  levels: true,
  isActive: true,
  _count: { select: { access: true } }, // quantas linhas em user_app_access: um COUNT, não a lista.
} satisfies Prisma.ApplicationSelect;

type AdminAppRow = Prisma.ApplicationGetPayload<{
  select: typeof adminAppSelect;
}>;

function toAdminApp({ _count, levels, ...app }: AdminAppRow): AdminApp {
  return { ...app, levels: levels as AppLevel[], userCount: _count.access };
}

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
  async listOrigins(): Promise<string[]> {
    const apps = await this.prisma.application.findMany({
      where: { isActive: true },
      select: { origin: true },
    });
    return apps.map((app) => app.origin);
  }
  findBySlug(slug: string) {
    return this.prisma.application.findUnique({
      where: { slug },
      select: { id: true, levels: true },
    });
  }

  /** Todos os apps, inclusive os inativos: o painel precisa vê-los para reativar. */
  async listAdmin(): Promise<AdminApp[]> {
    const apps = await this.prisma.application.findMany({
      select: adminAppSelect,
      orderBy: { name: 'asc' },
    });
    return apps.map(toAdminApp);
  }

  async findAdminDetail(id: string): Promise<AdminApp | null> {
    const app = await this.prisma.application.findUnique({
      where: { id },
      select: adminAppSelect,
    });
    return app && toAdminApp(app);
  }

  async findIdByOrigin(origin: string): Promise<string | null> {
    const app = await this.prisma.application.findUnique({
      where: { origin },
      select: { id: true },
    });
    return app?.id ?? null;
  }

  /** Grava o app e devolve o id. */
  async create(data: AppData): Promise<string> {
    const app = await this.prisma.application.create({
      data,
      select: { id: true },
    });
    return app.id;
  }

  async update(id: string, data: Omit<AppData, 'slug'>): Promise<void> {
    await this.prisma.application.update({ where: { id }, data });
  }

  /** O maior nível que alguém tem neste app (0 = ninguém tem acesso). */
  async highestLevelInUse(applicationId: string): Promise<number> {
    const { _max } = await this.prisma.userAppAccess.aggregate({
      where: { applicationId },
      _max: { level: true },
    });
    return _max.level ?? 0;
  }
}
