import { describe, expect, it, vi } from 'vitest';
import { AppEventsService } from './app-events.service.js';

const NOW = new Date('2026-11-13T15:00:00Z');
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);

function setup(lastOpen: { id: bigint; lastSeenAt: Date } | null) {
  const prisma = {
    appEvent: {
      findFirst: vi.fn().mockResolvedValue(lastOpen),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  return { service: new AppEventsService(prisma as never), prisma };
}

describe('AppEventsService.recordOpen', () => {
  it('cria OPEN quando não há abertura anterior', async () => {
    const { service, prisma } = setup(null);

    await service.recordOpen('u1', 'a1', NOW);

    expect(prisma.appEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', applicationId: 'a1', type: 'OPEN' },
    });
  });

  it('só atualiza lastSeenAt dentro de 30 min', async () => {
    const { service, prisma } = setup({ id: 7n, lastSeenAt: minutesAgo(29) });

    await service.recordOpen('u1', 'a1', NOW);

    expect(prisma.appEvent.update).toHaveBeenCalledWith({
      where: { id: 7n },
      data: { lastSeenAt: NOW },
    });
    expect(prisma.appEvent.create).not.toHaveBeenCalled();
  });

  it('cria OPEN novo depois de 30 min', async () => {
    const { service, prisma } = setup({ id: 7n, lastSeenAt: minutesAgo(31) });

    await service.recordOpen('u1', 'a1', NOW);

    expect(prisma.appEvent.create).toHaveBeenCalled();
    expect(prisma.appEvent.update).not.toHaveBeenCalled();
  });
});

describe('AppEventsService.recordClick', () => {
  function setupClick(app: { id: string; isActive: boolean } | null) {
    const prisma = {
      application: { findUnique: vi.fn().mockResolvedValue(app) },
      appEvent: { create: vi.fn().mockResolvedValue(undefined) },
    };
    return { service: new AppEventsService(prisma as never), prisma };
  }

  it('grava CLICK para app ativo', async () => {
    const { service, prisma } = setupClick({ id: 'a1', isActive: true });

    await service.recordClick('u1', 'demo');

    expect(prisma.appEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', applicationId: 'a1', type: 'CLICK' },
    });
  });

  it.each([null, { id: 'a1', isActive: false }])(
    'ignora slug inexistente ou app inativo (%o)',
    async (app) => {
      const { service, prisma } = setupClick(app);

      await expect(service.recordClick('u1', 'demo')).resolves.toBeUndefined();
      expect(prisma.appEvent.create).not.toHaveBeenCalled();
    },
  );
});
