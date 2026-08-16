import type { Exercise } from './types';
import { escapeHtml } from 'shared';

// exercises は呼び出し元(dashboard.ts)で取得済みのものを受け取る(グラフセクションと二重取得しない)。
// design.md §2.3: サイクルはユーザーごとに自由なため、[1,2,3,4]のような固定反復はせず、
// 実際に種目が属しているサイクルをid昇順(作成順)でグルーピングして表示する。
export function renderBoard(container: HTMLElement, exercises: Exercise[]): void {
  container.innerHTML = renderCycles(exercises);
}

function renderCycles(exercises: Exercise[]): string {
  const active = exercises.filter((e) => !e.is_discontinued);
  const cycleIds = [...new Set(active.map((e) => e.cycle.id))].sort((a, b) => a - b);

  if (cycleIds.length === 0) {
    return '<p>まだ種目が登録されていません。「種目管理」から追加してください。</p>';
  }

  return cycleIds
    .map((cycleId) => {
      const cycleExercises = active.filter((e) => e.cycle.id === cycleId);
      const label = cycleExercises[0].cycle.label;
      return `
        <section class="cycle-block">
          <h3>${escapeHtml(label)}</h3>
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
        <col />
        <col class="col-weight" /><col class="col-count" /><col class="col-count-sets" />
        <col class="col-weight col-group-target" /><col class="col-count col-group-target" /><col class="col-count-sets col-group-target" />
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2">種目名</th>
          <th colspan="3">現在</th>
          <th colspan="3" class="col-group-target col-group-target-start col-group-target-end">目標</th>
        </tr>
        <tr>
          <th>重量(kg)</th><th>回数</th><th class="col-group-end">セット</th>
          <th class="col-group-target col-group-target-start">重量(kg)</th><th class="col-group-target">回数</th><th class="col-group-target col-group-target-end">セット</th>
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
            <td rowspan="${lineCount}" class="col-group-target col-group-target-start">${escapeHtml(targetWeight)}</td>
            <td rowspan="${lineCount}" class="col-group-target">${escapeHtml(targetReps)}</td>
            <td rowspan="${lineCount}" class="col-group-target col-group-target-end">${escapeHtml(targetSets)}</td>
          `
          : '';
      return `
        <tr>
          ${nameCell}
          <td>${escapeHtml(line.weight)}</td>
          <td>${escapeHtml(line.reps)}</td>
          <td class="col-group-end">${escapeHtml(line.sets)}</td>
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
