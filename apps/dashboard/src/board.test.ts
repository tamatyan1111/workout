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
    latest: [],
    ...overrides,
  };
}

describe('renderBoard', () => {
  it('groups exercises under their cycle heading, using the label from the API response', () => {
    const container = document.createElement('div');
    renderBoard(container, [
      makeExercise({ id: 1, cycle: { id: 1, label: 'Push' }, name: 'ベンチプレス', current: [{ weight: 60, reps: 10, sets: 1 }] }),
      makeExercise({ id: 2, cycle: { id: 3, label: 'Legs' }, name: 'スクワット', current: [{ weight: 60, reps: 10, sets: 1 }] }),
    ]);

    expect(container.textContent).toContain('Push');
    expect(container.textContent).toContain('Legs');
    expect(container.textContent).toContain('ベンチプレス');
    expect(container.textContent).toContain('スクワット');
  });

  it('excludes discontinued exercises', () => {
    const container = document.createElement('div');
    renderBoard(container, [
      makeExercise({ is_discontinued: true, name: '廃止種目', current: [{ weight: 60, reps: 10, sets: 1 }] }),
    ]);

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

  it('shows a message when there are no exercises', () => {
    const container = document.createElement('div');
    renderBoard(container, []);

    expect(container.textContent).toContain('まだ種目が登録されていません');
  });

  // 2026-08-20: 記録がない日には種目名だけの行を並べず、代わりにメッセージを出す
  it('hides exercises with no records for the currently viewed day', () => {
    const container = document.createElement('div');
    renderBoard(container, [makeExercise({ name: 'ベンチプレス', current: [] })]);

    expect(container.textContent).not.toContain('ベンチプレス');
    expect(container.textContent).toContain('この日の記録はありません');
  });

  // 2026-08-20: 「Pushをしていないのにそのカードを出す必要はない」との指摘を受けて、
  // 記録の無いサイクルはカードごと(見出しも)非表示にする
  it('hides an entire cycle card when nothing was recorded that day, even if another cycle was', () => {
    const container = document.createElement('div');
    renderBoard(container, [
      makeExercise({ id: 1, cycle: { id: 1, label: 'Push' }, name: 'ベンチプレス', current: [] }),
      makeExercise({ id: 2, cycle: { id: 2, label: 'Legs' }, name: 'スクワット', current: [{ weight: 60, reps: 10, sets: 1 }] }),
    ]);

    expect(container.textContent).not.toContain('Push');
    expect(container.textContent).not.toContain('ベンチプレス');
    expect(container.textContent).toContain('Legs');
    expect(container.textContent).toContain('スクワット');
  });

  // 2026-08-20: 目標は実績と同じ行に並べず、トグルで開閉する別テーブルに分離した
  it('hides target values until the toggle button is clicked', () => {
    const container = document.createElement('div');
    renderBoard(container, [
      makeExercise({ current: [{ weight: 60, reps: 10, sets: 1 }], target: { weight: 80, reps: 5, sets: 3 } }),
    ]);

    expect(container.textContent).not.toContain('80.0');

    container.querySelector<HTMLButtonElement>('.toggle-target-btn')!.click();

    expect(container.textContent).toContain('80.0');
  });
});
