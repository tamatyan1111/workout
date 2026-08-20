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
    latest: [],
    ...overrides,
  };
}

describe('buildSetsFromCurrent', () => {
  // buildSetsFromCurrentはexercise.latest(種目ごとの直近の記録)を初期値に使う。
  // exercise.current(サマリーの日付ナビで選んだ日ちょうどの記録)とは別物(2026-08-20)
  it('falls back to 3 blank sets when there is no latest value', () => {
    expect(buildSetsFromCurrent(undefined)).toEqual(emptySets());
    expect(buildSetsFromCurrent(makeExercise({ latest: [] }))).toEqual(emptySets());
  });

  // design.md §2.9: 現在値のグループをそのままセット欄に展開する(ドロップセット対応)
  it('expands each latest-value group into its own sets', () => {
    const exercise = makeExercise({
      latest: [
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
    const exercise = makeExercise({ latest: [{ weight: null, reps: 20, sets: 1 }] });
    expect(buildSetsFromCurrent(exercise)).toEqual([{ weight: '', reps: '20' }]);
  });
});

describe('renderRecordForm', () => {
  it('excludes only discontinued exercises from the dropdown', () => {
    const container = document.createElement('div');
    renderRecordForm(
      container,
      [
        makeExercise({ id: 1, name: 'ベンチプレス' }),
        makeExercise({ id: 2, name: '廃止種目', is_discontinued: true }),
      ],
      () => {}
    );

    const options = Array.from(container.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toContain('ベンチプレス');
    expect(options).not.toContain('廃止種目');
  });

  // design.md §2.3: サイクルの特別扱い(旧"Rest")は廃止したため、それらしい名前のサイクルでも
  // 種目が実在すれば通常通り選択肢に出ることを確認する(回帰テスト)
  it('does not special-case a cycle labeled "Rest"', () => {
    const container = document.createElement('div');
    renderRecordForm(
      container,
      [makeExercise({ id: 1, name: '腹筋ローラー', cycle: { id: 4, label: 'Rest' } })],
      () => {}
    );

    const options = Array.from(container.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toContain('腹筋ローラー');
  });

  it('shows 3 blank set rows by default when there is no latest value', () => {
    const container = document.createElement('div');
    renderRecordForm(container, [makeExercise({ latest: [] })], () => {});

    expect(container.querySelectorAll('.set-row')).toHaveLength(3);
  });

  it('hides the weight input for a weightless exercise', () => {
    const container = document.createElement('div');
    renderRecordForm(container, [makeExercise({ is_weight_based: false })], () => {});

    expect(container.querySelector('input[data-field="weight"]')).toBeNull();
    expect(container.querySelector('input[data-field="reps"]')).not.toBeNull();
  });

  it('shows a message instead of a form when there are no selectable exercises', () => {
    const container = document.createElement('div');
    renderRecordForm(container, [], () => {});

    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain('種目が登録されていません');
  });
});
