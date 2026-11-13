import { describe, expect, it } from 'vitest';
import { fillBuckets, periodWindow } from './period-window.js';

// Sexta-feira, 12h em São Paulo.
const NOW = new Date('2026-11-13T15:00:00Z');

describe('periodWindow', () => {
  it('7d: 7 dias até hoje, começando à meia-noite de São Paulo', () => {
    const window = periodWindow('7d', NOW);

    expect(window.unit).toBe('day');
    expect(window.buckets).toHaveLength(7);
    expect(window.buckets[0]).toBe('2026-11-07');
    expect(window.buckets.at(-1)).toBe('2026-11-13');
    expect(window.start.toISOString()).toBe('2026-11-07T03:00:00.000Z');
    expect(window.end).toBe(NOW);
  });

  it('30d: 30 dias terminando hoje', () => {
    const window = periodWindow('30d', NOW);

    expect(window.unit).toBe('day');
    expect(window.buckets).toHaveLength(30);
    expect(window.buckets[0]).toBe('2026-10-15');
    expect(window.buckets.at(-1)).toBe('2026-11-13');
  });

  it('90d: 13 semanas começando na segunda', () => {
    const window = periodWindow('90d', NOW);

    expect(window.unit).toBe('week');
    expect(window.buckets).toHaveLength(13);
    expect(window.buckets[0]).toBe('2026-08-17');
    expect(window.buckets.at(-1)).toBe('2026-11-09');
  });

  it('12m: 12 meses incluindo o atual', () => {
    const window = periodWindow('12m', NOW);

    expect(window.unit).toBe('month');
    expect(window.buckets).toHaveLength(12);
    expect(window.buckets[0]).toBe('2025-12-01');
    expect(window.buckets.at(-1)).toBe('2026-11-01');
  });

  it('janela anterior tem a mesma duração da atual', () => {
    const window = periodWindow('7d', NOW);

    expect(window.start.getTime() - window.previousStart.getTime()).toBe(
      window.end.getTime() - window.start.getTime(),
    );
  });
});

describe('fillBuckets', () => {
  it('preenche com zero os buckets sem linha', () => {
    expect(fillBuckets(['a', 'b', 'c'], [{ bucket: 'b', value: 4 }])).toEqual([
      { start: 'a', value: 0 },
      { start: 'b', value: 4 },
      { start: 'c', value: 0 },
    ]);
  });
});
