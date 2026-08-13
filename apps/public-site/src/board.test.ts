import { describe, expect, it } from 'vitest';
import type { Exercise } from './types';
import { formatWeight, renderBoard, valueOrDash } from './board';

describe('formatWeight', () => {
  it('formats to 1 decimal place', () => {
    expect(formatWeight(60)).toBe('60.0');
    expect(formatWeight(62.5)).toBe('62.5');
  });

  it('shows a dash for null (weightless exercises)', () => {
    expect(formatWeight(null)).toBe('-');
  });
});

describe('valueOrDash', () => {
  it('stringifies numbers', () => {
    expect(valueOrDash(12)).toBe('12');
    expect(valueOrDash(0)).toBe('0');
  });

  it('shows a dash for null', () => {
    expect(valueOrDash(null)).toBe('-');
  });
});

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    cycle: { id: 1, label: 'Push' },
    is_discontinued: false,
    name: 'ベンチプレス',
    is_weight_based: true,
    target: { weight: 60, reps: 10, sets: 3 },
    current: [],
    ...overrides,
  };
}

describe('renderBoard', () => {
  it('groups exercises under their cycle heading', () => {
    const container = document.createElement('div');
    renderBoard(container, [
      makeExercise({ id: 1, cycle: { id: 1, label: 'Push' }, name: 'ベンチプレス' }),
      makeExercise({ id: 2, cycle: { id: 3, label: 'Legs' }, name: 'スクワット' }),
    ]);

    expect(container.textContent).toContain('サイクル1: Push');
    expect(container.textContent).toContain('サイクル3: Legs');
    expect(container.textContent).toContain('ベンチプレス');
    expect(container.textContent).toContain('スクワット');
  });

  it('excludes discontinued exercises', () => {
    const container = document.createElement('div');
    renderBoard(container, [makeExercise({ is_discontinued: true, name: '廃止種目' })]);

    expect(container.textContent).not.toContain('廃止種目');
  });

  it('renders a row per current-value group (drop sets)', () => {
    const container = document.createElement('div');
    renderBoard(container, [
      makeExercise({
        current: [
          { weight: 60, reps: 3, sets: 1 },
          { weight: 50, reps: 10, sets: 1 },
        ],
      }),
    ]);

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
  });
});
