import { describe, expect, it, vi } from 'vitest';
import type { LogRow } from './types';
import { groupByDate, periodRange } from './graph';

describe('periodRange', () => {
  it('returns no bounds for "all"', () => {
    expect(periodRange('all')).toEqual({});
  });

  it('returns a 30-day window ending today', () => {
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(periodRange('30d')).toEqual({ from: '2026-07-16', to: '2026-08-15' });
    vi.useRealTimers();
  });

  it('returns a 3-month window ending today', () => {
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(periodRange('3mo')).toEqual({ from: '2026-05-15', to: '2026-08-15' });
    vi.useRealTimers();
  });
});

function makeLog(overrides: Partial<LogRow> = {}): LogRow {
  return {
    id: 1,
    exercise_id: 1,
    logged_date: '2026-08-01',
    set_number: 1,
    weight: 60,
    reps: 10,
    ...overrides,
  };
}

describe('groupByDate', () => {
  it('groups logs by their date, ignoring a time component', () => {
    const logs = [
      makeLog({ id: 1, logged_date: '2026-08-01T10:00:00' }),
      makeLog({ id: 2, logged_date: '2026-08-01T18:00:00' }),
      makeLog({ id: 3, logged_date: '2026-08-02' }),
    ];
    const grouped = groupByDate(logs);
    expect(Object.keys(grouped)).toEqual(['2026-08-01', '2026-08-02']);
    expect(grouped['2026-08-01']).toHaveLength(2);
    expect(grouped['2026-08-02']).toHaveLength(1);
  });

  it('returns an empty object for no logs', () => {
    expect(groupByDate([])).toEqual({});
  });
});
