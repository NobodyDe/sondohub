import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DashboardRankedUser } from '@sondohub/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { BucketUnit } from './period-window.js';

export type BucketRow = { bucket: string; value: number };
export type AppEventRow = { slug: string; type: 'OPEN' | 'CLICK'; value: number };

/** As colunas são timestamp sem fuso, gravadas em UTC: converte para o horário de São Paulo antes de agrupar. */
const local = (column: string) =>
  Prisma.sql`(${Prisma.raw(column)} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')`;

/** Parâmetro de data comparável com timestamp sem fuso, independente do fuso da sessão do banco. */
const utc = (date: Date) => Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`;

const bucketOf = (unit: BucketUnit, column: string) =>
  Prisma.sql`to_char(date_trunc(${unit}, ${local(column)}), 'YYYY-MM-DD')`;

/** Uma consulta por método; quem junta tudo é o DashboardService. Contagens com ::int porque bigint não vira JSON. */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countUsers() {
    const [total, active, deactivated, everLoggedIn, withoutApps] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: false } }),
      this.prisma.user.count({ where: { isActive: true, sessions: { some: {} } } }),
      // Mesmo critério do filtro "sem apps" da lista de usuários, para o número bater com a lista.
      this.prisma.user.count({ where: { access: { none: {} } } }),
    ]);
    return { total, active, deactivated, everLoggedIn, withoutApps };
  }

  usersCreatedBy(unit: BucketUnit, from: Date, to: Date) {
    return this.prisma.$queryRaw<BucketRow[]>`
      SELECT ${bucketOf(unit, 'created_at')} AS bucket, count(*)::int AS value
      FROM users
      WHERE created_at >= ${utc(from)} AND created_at < ${utc(to)}
      GROUP BY 1`;
  }

  countUsersCreated(from: Date, to: Date) {
    return this.prisma.user.count({ where: { createdAt: { gte: from, lt: to } } });
  }

  loginsBy(unit: BucketUnit, from: Date, to: Date) {
    return this.prisma.$queryRaw<BucketRow[]>`
      SELECT ${bucketOf(unit, 'created_at')} AS bucket, count(*)::int AS value
      FROM sessions
      WHERE created_at >= ${utc(from)} AND created_at < ${utc(to)}
      GROUP BY 1`;
  }

  countLogins(from: Date, to: Date) {
    return this.prisma.session.count({ where: { createdAt: { gte: from, lt: to } } });
  }

  openSessionsUserAgents(now: Date) {
    return this.prisma.session.findMany({
      where: { revokedAt: null, expiresAt: { gt: now }, user: { isActive: true } },
      select: { userId: true, userAgent: true },
    });
  }

  /** Apps ativos com quantos usuários ativos têm acesso, do maior para o menor. */
  async usersPerApp() {
    const apps = await this.prisma.application.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }, // desempate fixo: a cor de cada app vem da posição na lista
      select: {
        slug: true,
        name: true,
        _count: { select: { access: { where: { user: { isActive: true } } } } },
      },
    });
    return apps
      .map((app) => ({ slug: app.slug, name: app.name, users: app._count.access }))
      .sort((a, b) => b.users - a.users);
  }

  grantsBy(unit: BucketUnit, from: Date, to: Date) {
    return this.prisma.$queryRaw<(BucketRow & { slug: string })[]>`
      SELECT ${bucketOf(unit, 'uaa.granted_at')} AS bucket, a.slug, count(*)::int AS value
      FROM user_app_access uaa
      JOIN applications a ON a.id = uaa.application_id AND a.is_active
      WHERE uaa.granted_at >= ${utc(from)} AND uaa.granted_at < ${utc(to)}
      GROUP BY 1, 2`;
  }

  /** dow 0 = segunda (isodow começa em 1). */
  loginHeatmap(from: Date, to: Date) {
    return this.prisma.$queryRaw<{ dow: number; hour: number; value: number }[]>`
      SELECT extract(isodow FROM ${local('created_at')})::int - 1 AS dow,
             extract(hour FROM ${local('created_at')})::int AS hour,
             count(*)::int AS value
      FROM sessions
      WHERE created_at >= ${utc(from)} AND created_at < ${utc(to)}
      GROUP BY 1, 2`;
  }

  /** Todos os usuários ativos, inclusive quem não entrou na janela (valor 0). */
  loginCountPerUser(from: Date, to: Date) {
    return this.prisma.$queryRaw<DashboardRankedUser[]>`
      SELECT u.id, u.name, u.avatar_url AS "avatarUrl", u.role::text AS role, count(s.id)::int AS value
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id
        AND s.created_at >= ${utc(from)} AND s.created_at < ${utc(to)}
      WHERE u.is_active
      GROUP BY u.id
      ORDER BY u.name`;
  }

  openSessionsPerUser(now: Date) {
    return this.prisma.$queryRaw<DashboardRankedUser[]>`
      SELECT u.id, u.name, u.avatar_url AS "avatarUrl", u.role::text AS role, count(s.id)::int AS value
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id
        AND s.revoked_at IS NULL AND s.expires_at > ${utc(now)}
      WHERE u.is_active
      GROUP BY u.id
      ORDER BY u.name`;
  }

  appEventsPerApp(from: Date, to: Date) {
    return this.prisma.$queryRaw<AppEventRow[]>`
      SELECT a.slug, e.type::text AS type, count(*)::int AS value
      FROM app_events e
      JOIN applications a ON a.id = e.application_id AND a.is_active
      JOIN users u ON u.id = e.user_id AND u.is_active
      WHERE e.created_at >= ${utc(from)} AND e.created_at < ${utc(to)}
      GROUP BY 1, 2`;
  }

  /** Atividade = o mais recente entre o último login e a última vez que um app foi visto. Nunca entrou também conta. */
  async inactiveSince(cutoff: Date): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ value: number }[]>`
      SELECT count(*)::int AS value
      FROM users u
      WHERE u.is_active
        AND coalesce(
          greatest(
            (SELECT max(created_at) FROM sessions WHERE user_id = u.id),
            (SELECT max(last_seen_at) FROM app_events WHERE user_id = u.id)
          ),
          '-infinity'
        ) < ${utc(cutoff)}`;
    return row.value;
  }
}
