import { describe, expect, it, vi } from 'vitest';
import type { DashboardRankedUser } from '@sondohub/contracts';
import { DashboardService } from './dashboard.service.js';

const NOW = new Date('2026-11-13T15:00:00Z');

const person = (id: string, value: number): DashboardRankedUser => ({
  id,
  name: `Pessoa ${id}`,
  avatarUrl: null,
  role: 'USER',
  value,
});

/** Repositório vazio (banco recém-migrado); cada teste troca só o que precisa. */
function emptyRepository() {
  return {
    countUsers: vi.fn().mockResolvedValue({ active: 0, total: 0, everLoggedIn: 0, deactivated: 0, withoutApps: 0 }),
    usersCreatedBy: vi.fn().mockResolvedValue([]),
    countUsersCreated: vi.fn().mockResolvedValue(0),
    loginsBy: vi.fn().mockResolvedValue([]),
    countLogins: vi.fn().mockResolvedValue(0),
    openSessionsUserAgents: vi.fn().mockResolvedValue([]),
    usersPerApp: vi.fn().mockResolvedValue([]),
    grantsBy: vi.fn().mockResolvedValue([]),
    loginHeatmap: vi.fn().mockResolvedValue([]),
    loginCountPerUser: vi.fn().mockResolvedValue([]),
    openSessionsPerUser: vi.fn().mockResolvedValue([]),
    appEventsPerApp: vi.fn().mockResolvedValue([]),
    inactiveSince: vi.fn().mockResolvedValue(0),
  };
}

function setup(overrides: Partial<ReturnType<typeof emptyRepository>> = {}) {
  const repository = { ...emptyRepository(), ...overrides };
  return new DashboardService(repository as never);
}

describe('DashboardService.get', () => {
  it('preenche buckets vazios com zero', async () => {
    const service = setup({
      usersCreatedBy: vi.fn().mockResolvedValue([{ bucket: '2026-11-10', value: 3 }]),
    });

    const dashboard = await service.get('30d', NOW);

    expect(dashboard.newUsers.series).toHaveLength(30);
    expect(dashboard.newUsers.series.find((b) => b.start === '2026-11-10')?.value).toBe(3);
    expect(dashboard.newUsers.series.filter((b) => b.value === 0)).toHaveLength(29);
  });

  it('ranking bottom inclui quem nunca entrou', async () => {
    const values = [9, 8, 7, 6, 5, 4, 0, 0];
    const service = setup({
      loginCountPerUser: vi.fn().mockResolvedValue(values.map((v, i) => person(`u${i}`, v))),
    });

    const { loginRanking } = await service.get('30d', NOW);

    expect(loginRanking.top).toHaveLength(6);
    expect(loginRanking.top[0].value).toBe(9);
    expect(loginRanking.bottom[0].value).toBe(0);
  });

  it('separa computador e celular', async () => {
    const service = setup({
      openSessionsUserAgents: vi.fn().mockResolvedValue([
        { userId: 'u1', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' },
        { userId: 'u1', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' },
        { userId: 'u2', userAgent: null },
      ]),
    });

    const { sessions } = await service.get('30d', NOW);

    expect(sessions).toEqual({ open: 3, people: 2, desktop: 2, mobile: 1 });
  });

  it('banco vazio devolve zeros', async () => {
    const dashboard = await setup().get('7d', NOW);

    expect(dashboard.loginHeatmap).toHaveLength(7);
    expect(dashboard.loginHeatmap.every((day) => day.length === 24 && day.every((v) => v === 0))).toBe(true);
    expect(dashboard.appUsage).toEqual([]);
    expect(dashboard.logins).toEqual({ total: 0, previous: 0, series: expect.any(Array) });
    expect(dashboard.activation).toEqual({ everLoggedIn: 0, total: 0 });
  });

  it('junta aberturas e cliques por app, inclusive app sem eventos', async () => {
    const appEventsPerApp = vi
      .fn()
      .mockResolvedValueOnce([
        { slug: 'gemeo', name: 'Gêmeo Digital', type: 'OPEN', value: 10 },
        { slug: 'gemeo', name: 'Gêmeo Digital', type: 'CLICK', value: 12 },
      ])
      .mockResolvedValueOnce([{ slug: 'gemeo', name: 'Gêmeo Digital', type: 'OPEN', value: 7 }]);
    const service = setup({
      usersPerApp: vi.fn().mockResolvedValue([
        { slug: 'gemeo', name: 'Gêmeo Digital', users: 5 },
        { slug: 'demo', name: 'App Demo', users: 1 },
      ]),
      appEventsPerApp,
    });

    const { appUsage } = await service.get('30d', NOW);

    expect(appUsage).toEqual([
      { slug: 'gemeo', name: 'Gêmeo Digital', opens: 10, previousOpens: 7, clicks: 12, previousClicks: 0 },
      { slug: 'demo', name: 'App Demo', opens: 0, previousOpens: 0, clicks: 0, previousClicks: 0 },
    ]);
  });

  it('inclusões anteriores usam a mesma consulta da janela atual', async () => {
    const grantsBy = vi
      .fn()
      .mockResolvedValueOnce([{ bucket: '2026-11-10', slug: 'demo', value: 2 }])
      .mockResolvedValueOnce([
        { bucket: '2026-10-01', slug: 'demo', value: 3 },
        { bucket: '2026-10-02', slug: 'gemeo', value: 4 },
      ]);
    const service = setup({ grantsBy });

    const { grants } = await service.get('30d', NOW);

    expect(grants.previous).toBe(7);
  });

  it('heatmap põe cada linha no dia e hora certos', async () => {
    const service = setup({
      loginHeatmap: vi.fn().mockResolvedValue([{ dow: 1, hour: 8, value: 5 }]),
    });

    const { loginHeatmap } = await service.get('30d', NOW);

    expect(loginHeatmap[1][8]).toBe(5);
  });
});
