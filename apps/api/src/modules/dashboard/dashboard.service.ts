import { Injectable } from '@nestjs/common';
import type {
  AdminDashboard,
  DashboardPeriod,
  DashboardRankedUser,
  DashboardRanking,
} from '@sondohub/contracts';
import {
  type AppEventRow,
  DashboardRepository,
} from './dashboard.repository.js';
import { fillBuckets, periodWindow, type PeriodWindow } from './period-window.js';

const RANKING_SIZE = 6;
const INACTIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const MOBILE_AGENT = /Mobi|Android|iPhone|iPad/i;

/** Monta o painel: cada método privado cuida de um pedaço da resposta, e get() só junta os pedaços. */
@Injectable()
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async get(period: DashboardPeriod, now = new Date()): Promise<AdminDashboard> {
    const window = periodWindow(period, now);
    const [accounts, logins, sessions, newUsers, apps, grants, loginHeatmap, rankings] =
      await Promise.all([
        this.accounts(now),
        this.logins(window),
        this.sessions(now),
        this.newUsers(window),
        this.apps(window),
        this.grants(window),
        this.loginHeatmap(window),
        this.rankings(window, now),
      ]);

    return { period, ...accounts, logins, sessions, newUsers, ...apps, grants, loginHeatmap, ...rankings };
  }

  private async accounts(now: Date) {
    const year = periodWindow('12m', now);
    const [counts, createdRows, inactive30d] = await Promise.all([
      this.repository.countUsers(),
      this.repository.usersCreatedBy(year.unit, year.start, now),
      this.repository.inactiveSince(new Date(now.getTime() - INACTIVE_AFTER_MS)),
    ]);

    return {
      users: { active: counts.active, total: counts.total, createdByMonth: fillBuckets(year.buckets, createdRows) },
      // Ativação olha só contas ativas: conta desativada não é alguém que deixou de entrar.
      activation: { everLoggedIn: counts.everLoggedIn, total: counts.active },
      attention: { inactive30d, withoutApps: counts.withoutApps, deactivated: counts.deactivated },
    };
  }

  private async logins({ unit, start, end, previousStart, buckets }: PeriodWindow) {
    const [rows, total, previous] = await Promise.all([
      this.repository.loginsBy(unit, start, end),
      this.repository.countLogins(start, end),
      this.repository.countLogins(previousStart, start),
    ]);
    return { total, previous, series: fillBuckets(buckets, rows) };
  }

  private async sessions(now: Date) {
    return countDevices(await this.repository.openSessionsUserAgents(now));
  }

  private async newUsers({ unit, start, end, previousStart, buckets }: PeriodWindow) {
    const [rows, previous] = await Promise.all([
      this.repository.usersCreatedBy(unit, start, end),
      this.repository.countUsersCreated(previousStart, start),
    ]);
    return { series: fillBuckets(buckets, rows), previous };
  }

  private async apps({ start, end, previousStart }: PeriodWindow) {
    const [appUsers, current, previous] = await Promise.all([
      this.repository.usersPerApp(),
      this.repository.appEventsPerApp(start, end),
      this.repository.appEventsPerApp(previousStart, start),
    ]);
    const countOf = (rows: AppEventRow[], slug: string, type: AppEventRow['type']) =>
      rows.find((row) => row.slug === slug && row.type === type)?.value ?? 0;

    return {
      appUsers,
      appUsage: appUsers.map(({ slug, name }) => ({
        slug,
        name,
        opens: countOf(current, slug, 'OPEN'),
        previousOpens: countOf(previous, slug, 'OPEN'),
        clicks: countOf(current, slug, 'CLICK'),
        previousClicks: countOf(previous, slug, 'CLICK'),
      })),
    };
  }

  private async grants({ unit, start, end, previousStart, buckets }: PeriodWindow) {
    // A janela anterior usa a mesma consulta: os dois totais contam o mesmo conjunto (só apps ativos).
    const [rows, previousRows] = await Promise.all([
      this.repository.grantsBy(unit, start, end),
      this.repository.grantsBy(unit, previousStart, start),
    ]);
    const previous = previousRows.reduce((sum, row) => sum + row.value, 0);
    const series = buckets.map((bucket) => ({
      start: bucket,
      bySlug: Object.fromEntries(
        rows.filter((row) => row.bucket === bucket).map((row) => [row.slug, row.value]),
      ),
    }));
    return { series, previous };
  }

  private async loginHeatmap({ start, end }: PeriodWindow) {
    const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const { dow, hour, value } of await this.repository.loginHeatmap(start, end)) {
      heatmap[dow][hour] = value;
    }
    return heatmap;
  }

  private async rankings({ start, end }: PeriodWindow, now: Date) {
    const [logins, sessions] = await Promise.all([
      this.repository.loginCountPerUser(start, end),
      this.repository.openSessionsPerUser(now),
    ]);
    return { loginRanking: toRanking(logins), sessionRanking: toRanking(sessions) };
  }
}

/** O repositório devolve em ordem alfabética; o sort é estável, então empates continuam por nome. */
function toRanking(users: DashboardRankedUser[]): DashboardRanking {
  return {
    top: [...users].sort((a, b) => b.value - a.value).slice(0, RANKING_SIZE),
    bottom: [...users].sort((a, b) => a.value - b.value).slice(0, RANKING_SIZE),
  };
}

function countDevices(sessions: { userId: string; userAgent: string | null }[]) {
  const mobile = sessions.filter((session) => MOBILE_AGENT.test(session.userAgent ?? '')).length;
  return {
    open: sessions.length,
    people: new Set(sessions.map((session) => session.userId)).size,
    desktop: sessions.length - mobile,
    mobile,
  };
}
