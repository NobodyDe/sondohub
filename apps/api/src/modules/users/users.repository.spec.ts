import { describe, expect, it, vi } from 'vitest';
import { UsersRepository } from './users.repository.js';

const CURSOR = '00000000-0000-4000-8000-000000000000';

function setup(rowCount: number) {
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    id: `u${index + 1}`,
    access: [],
  }));
  const prisma = { user: { findMany: vi.fn().mockResolvedValue(rows) } };
  return { repository: new UsersRepository(prisma as never), prisma };
}

describe('UsersRepository.listPage', () => {
  it('pede um a mais e devolve o cursor da próxima página quando ele vem', async () => {
    const { repository, prisma } = setup(6);

    const page = await repository.listPage({ filter: 'all', q: '', take: 5 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 6 }),
    );
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBe('u5');
  });

  it('na última página não devolve cursor', async () => {
    const { repository } = setup(3);

    const page = await repository.listPage({ filter: 'all', q: '', take: 5 });

    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('continua depois do cursor, pulando o próprio cursor', async () => {
    const { repository, prisma } = setup(0);

    await repository.listPage({ filter: 'admin', q: '', take: 10, cursor: CURSOR });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'ADMIN' },
        cursor: { id: CURSOR },
        skip: 1,
      }),
    );
  });
});
