import type { DashboardBucket, DashboardPeriod } from '@sondohub/contracts';

export type BucketUnit = 'day' | 'week' | 'month';

export type PeriodWindow = {
  /** Meia-noite local do primeiro bucket. */
  start: Date;
  end: Date;
  /** A janela anterior é [previousStart, start), com a mesma duração da atual. */
  previousStart: Date;
  unit: BucketUnit;
  /** 'YYYY-MM-DD' local do início de cada bucket, em ordem. */
  buckets: string[];
};

// shortcut: fuso fixo -03:00 (Brasil sem horário de verão desde 2019); usar Intl se voltar a ter.
const SAO_PAULO_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const PERIODS: Record<DashboardPeriod, { unit: BucketUnit; count: number }> = {
  '7d': { unit: 'day', count: 7 },
  '30d': { unit: 'day', count: 30 },
  '90d': { unit: 'week', count: 13 },
  '12m': { unit: 'month', count: 12 },
};

/** Data do calendário de São Paulo, guardada como meia-noite UTC para fazer contas de dia sem fuso. */
function toLocalDay(instant: Date): Date {
  const shifted = new Date(instant.getTime() + SAO_PAULO_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

function localMidnightToInstant(day: Date): Date {
  return new Date(day.getTime() - SAO_PAULO_OFFSET_MS);
}

function startOfUnit(day: Date, unit: BucketUnit): Date {
  if (unit === 'day') return day;
  if (unit === 'month') return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - daysSinceMonday * DAY_MS);
}

function addUnits(day: Date, unit: BucketUnit, amount: number): Date {
  if (unit === 'month') return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + amount, 1));
  const days = unit === 'week' ? amount * 7 : amount;
  return new Date(day.getTime() + days * DAY_MS);
}

const toKey = (day: Date) => day.toISOString().slice(0, 10);

export function periodWindow(period: DashboardPeriod, now: Date): PeriodWindow {
  const { unit, count } = PERIODS[period];
  const lastBucket = startOfUnit(toLocalDay(now), unit);
  const firstBucket = addUnits(lastBucket, unit, -(count - 1));
  const start = localMidnightToInstant(firstBucket);

  return {
    start,
    end: now,
    previousStart: new Date(start.getTime() - (now.getTime() - start.getTime())),
    unit,
    buckets: Array.from({ length: count }, (_, index) => toKey(addUnits(firstBucket, unit, index))),
  };
}

/** O SQL só devolve buckets com dados; o gráfico precisa de todos, com zero onde não houve nada. */
export function fillBuckets(
  buckets: string[],
  rows: { bucket: string; value: number }[],
): DashboardBucket[] {
  const valueByBucket = new Map(rows.map((row) => [row.bucket, row.value]));
  return buckets.map((start) => ({ start, value: valueByBucket.get(start) ?? 0 }));
}
