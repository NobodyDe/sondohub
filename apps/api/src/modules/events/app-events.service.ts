import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** 3× o TTL do token (10 min): as renovações de um app aberto caem dentro da janela e não viram abertura nova. */
export const OPEN_DEDUP_MS = 30 * 60 * 1000;

@Injectable()
export class AppEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Uma abertura é uma visita: se o app foi visto há pouco, só estende a visita atual. */
  async recordOpen(
    userId: string,
    applicationId: string,
    now = new Date(),
  ): Promise<void> {
    const last = await this.prisma.appEvent.findFirst({
      where: { userId, applicationId, type: 'OPEN' },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, lastSeenAt: true },
    });

    if (last && now.getTime() - last.lastSeenAt.getTime() < OPEN_DEDUP_MS) {
      await this.prisma.appEvent.update({
        where: { id: last.id },
        data: { lastSeenAt: now },
      });
      return;
    }

    await this.prisma.appEvent.create({
      data: { userId, applicationId, type: 'OPEN' },
    });
  }

  /** Slug desconhecido ou app inativo é ignorado em silêncio: a resposta não revela quais apps existem. */
  async recordClick(userId: string, slug: string): Promise<void> {
    const app = await this.prisma.application.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    });
    if (!app?.isActive) return;

    await this.prisma.appEvent.create({
      data: { userId, applicationId: app.id, type: 'CLICK' },
    });
  }
}
