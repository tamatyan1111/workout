import type { Exercise } from './types';
import { CYCLE_LABELS, escapeHtml } from 'shared';

// exercises は呼び出し元(main.ts)で取得済みのものを受け取る(グラフタブと二重取得しない)
export function renderBoard(container: HTMLElement, exercises: Exercise[]): void {
  container.innerHTML = renderCycles(exercises);
}

function renderCycles(exercises: Exercise[]): string {
  const active = exercises.filter((e) => !e.is_discontinued);
  return [1, 2, 3, 4]
    .map((cycle) => {
      const cycleExercises = active.filter((e) => e.cycle.id === cycle);
      if (cycleExercises.length === 0) return '';
      return `
        <section class="cycle-block">
          <h2>サイクル${cycle}: ${CYCLE_LABELS[cycle] ?? cycle}</h2>
          ${renderTable(cycleExercises)}
        </section>
      `;
    })
    .join('');
}

function renderTable(exercises: Exercise[]): string {
  return `
    <table class="board-table">
      <colgroup>
        <col class="col-name" />
        <col class="col-value" /><col class="col-value" /><col class="col-value" />
        <col class="col-value" /><col class="col-value" /><col class="col-value" />
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2">種目名</th>
          <th colspan="3">現在</th>
          <th colspan="3">目標</th>
        </tr>
        <tr>
          <th>重量(kg)</th><th>回数</th><th>セット</th>
          <th>重量(kg)</th><th>回数</th><th>セット</th>
        </tr>
      </thead>
      <tbody>
        ${exercises.map((e) => renderRowGroup(e)).join('')}
      </tbody>
    </table>
  `;
}

function renderRowGroup(e: Exercise): string {
  const lineCount = Math.max(e.current.length, 1);

  const targetWeight = formatWeight(e.target.weight);
  const targetReps = valueOrDash(e.target.reps);
  const targetSets = valueOrDash(e.target.sets);

  const lines = Array.from({ length: lineCount }, (_, i) => {
    const group = e.current[i];
    return {
      weight: group ? formatWeight(group.weight) : '-',
      reps: group ? String(group.reps) : '-',
      sets: group ? String(group.sets) : '-',
    };
  });

  return lines
    .map((line, i) => {
      const nameCell = i === 0 ? `<td rowspan="${lineCount}">${escapeHtml(e.name)}</td>` : '';
      const targetCells =
        i === 0
          ? `
            <td rowspan="${lineCount}">${escapeHtml(targetWeight)}</td>
            <td rowspan="${lineCount}">${escapeHtml(targetReps)}</td>
            <td rowspan="${lineCount}">${escapeHtml(targetSets)}</td>
          `
          : '';
      return `
        <tr>
          ${nameCell}
          <td>${escapeHtml(line.weight)}</td>
          <td>${escapeHtml(line.reps)}</td>
          <td>${escapeHtml(line.sets)}</td>
          ${targetCells}
        </tr>
      `;
    })
    .join('');
}

export function valueOrDash(v: number | null): string {
  return v === null ? '-' : String(v);
}

// 重量は小数点1桁で表記を統一する(design.md §3)。重量なし種目はダッシュ表示。
export function formatWeight(v: number | null): string {
  if (v === null) return '-';
  return v.toFixed(1);
}
