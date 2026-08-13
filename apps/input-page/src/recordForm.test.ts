import { describe, expect, it } from 'vitest';
import type { Exercise } from './types';
import { buildSetsFromCurrent, emptySets, renderRecordForm } from './recordForm';

describe('emptySets', () => {
  it('defaults to 3 blank sets', () => {
    expect(emptySets()).toEqual([
      { weight: '', reps: '' },
      { weight: '', reps: '' },
      { weight: '', reps: '' },
    ]);
  });

  it('honors a custom count', () => {
    expect(emptySets(1)).toEqual([{ weight: '', reps: '' }]);
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

describe('buildSetsFromCurrent', () => {
  it('falls back to 3 blank sets when there is no current value', () => {
    expect(buildSetsFromCurrent(undefined)).toEqual(emptySets());
    expect(buildSetsFromCurrent(makeExercise({ current: [] }))).toEqual(emptySets());
  });

  // design.md §2.5: 現在値のグループをそのままセット欄に展開する(ドロップセット対応)
  it('expands each current-value group into its own sets', () => {
    const exercise = makeExercise({
      current: [
        { weight: 60, reps: 3, sets: 1 },
        { weight: 50, reps: 10, sets: 2 },
      ],
    });
    expect(buildSetsFromCurrent(exercise)).toEqual([
      { weight: '60', reps: '3' },
      { weight: '50', reps: '10' },
      { weight: '50', reps: '10' },
    ]);
  });

  it('represents a weightless set with an empty weight string', () => {
    const exercise = makeExercise({ current: [{ weight: null, reps: 20, sets: 1 }] });
    expect(buildSetsFromCurrent(exercise)).toEqual([{ weight: '', reps: '20' }]);
  });
});

describe('renderRecordForm', () => {
  it('excludes discontinued exercises and Rest from the exercise dropdown', () => {
    const container = document.createElement('div');
    renderRecordForm(
      container,
      [
        makeExercise({ id: 1, name: 'ベンチプレス' }),
        makeExercise({ id: 2, name: '廃止種目', is_discontinued: true }),
        makeExercise({ id: 3, name: '休憩', cycle: { id: 4, label: 'Rest' } }),
      ],
      () => {}
    );

    const options = Array.from(container.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toContain('ベンチプレス');
    expect(options).not.toContain('廃止種目');
    expect(options).not.toContain('休憩');
  });

  it('shows 3 blank set rows by default when there is no current value', () => {
    const container = document.createElement('div');
    renderRecordForm(container, [makeExercise({ current: [] })], () => {});

    expect(container.querySelectorAll('.set-row')).toHaveLength(3);
  });

  it('hides the weight input for a weightless exercise', () => {
    const container = document.createElement('div');
    renderRecordForm(container, [makeExercise({ is_weight_based: false })], () => {});

    expect(container.querySelector('input[data-field="weight"]')).toBeNull();
    expect(container.querySelector('input[data-field="reps"]')).not.toBeNull();
  });
});
