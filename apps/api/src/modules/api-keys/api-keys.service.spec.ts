import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { hashToken } from '../sessions/sessions.service.js';
import { ApiKeysService } from './api-keys.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function setup() {
  const prisma = {
    apiKey: {
      // devolve o que recebeu, como o banco faria
      create: vi.fn(({ data }) => Promise.resolve({ id: 'k1', createdAt: new Date(), lastUsedAt: null, ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const service = new ApiKeysService(prisma as never);
  return { service, prisma };
}

const user = (role: 'MASTER' | 'ADMIN' | 'USER') => ({ id: 'u1', role }) as never;

describe('ApiKeysService', () => {
  it('grava só o hash e devolve o segredo uma vez', async () => {
    const { service, prisma } = setup();
    const { secret } = await service.create(user('USER'), { name: 'erp', expiresInDays: 30 });

    expect(secret).toMatch(/^sk_sondo_[A-Za-z0-9_-]{43}$/);
    const { data } = prisma.apiKey.create.mock.calls[0][0];
    expect(data.keyHash).toBe(hashToken(secret));
    expect(data.hint).toBe(`${secret.slice(0, 12)}...${secret.slice(-4)}`);
    expect(JSON.stringify(data)).not.toContain(secret);
    expect(data.userId).toBe('u1');
  });

  it('não pede o hash de volta na chave criada', async () => {
    const { service, prisma } = setup();
    await service.create(user('USER'), { name: 'erp', expiresInDays: 30 });
    const { select } = prisma.apiKey.create.mock.calls[0][0];
    expect(select).not.toHaveProperty('keyHash');
    expect(select).not.toHaveProperty('userId');
  });

  it('calcula a validade em dias', async () => {
    const { service, prisma } = setup();
    await service.create(user('USER'), { name: 'erp', expiresInDays: 30 });
    const { expiresAt } = prisma.apiKey.create.mock.calls[0][0].data;
    expect(Math.abs(expiresAt.getTime() - (Date.now() + 30 * DAY_MS))).toBeLessThan(5000);
  });

  it('MASTER cria chave sem validade', async () => {
    const { service, prisma } = setup();
    await service.create(user('MASTER'), { name: 'interna', expiresInDays: null });
    expect(prisma.apiKey.create.mock.calls[0][0].data.expiresAt).toBeNull();
  });

  it('recusa chave sem validade para quem não é MASTER', async () => {
    const { service, prisma } = setup();
    await expect(service.create(user('ADMIN'), { name: 'x', expiresInDays: null })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it('revokeOwn filtra pelo dono e ignora já revogada', async () => {
    const { service, prisma } = setup();
    await service.revokeOwn('u1', 'k1');
    expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'k1', userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('listOwn traz só as não revogadas e não pede o hash', async () => {
    const { service, prisma } = setup();
    await service.listOwn('u1');
    const args = prisma.apiKey.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'u1', revokedAt: null });
    expect(args.select).not.toHaveProperty('keyHash');
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });
});
