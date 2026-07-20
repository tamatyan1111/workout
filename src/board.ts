import type { BoardRow } from './types';

const CYCLE_LABELS: Record<number, string> = {
  1: 'サイクル1: Push',
  2: 'サイクル2: Pull',
  3: 'サイクル3: Legs',
  4: 'サイクル4: Rest',
};

// board は呼び出し元(main.ts)で取得済みのものを受け取る(グラフタブと二重取得しない)
export function renderBoard(container: HTMLElement, rows: BoardRow[]): void {
  container.innerHTML = renderCycles(rows);
}

function renderCycles(rows: BoardRow[]): string {
  return [1, 2, 3, 4]
    .map((cycle) => {
      const cycleRows = rows.filter((r) => Number(r['サイクル']) === cycle);
      if (cycleRows.length === 0) return '';
      return `
        <section class="cycle-block">
          <h2>${CYCLE_LABELS[cycle] ?? `サイクル${cycle}`}</h2>
          ${renderTable(cycleRows)}
        </section>
      `;
    })
    .join('');
}

function renderTable(rows: BoardRow[]): string {
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
          <th>重量</th><th>回数</th><th>セット</th>
          <th>重量</th><th>回数</th><th>セット</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => renderRowGroup(r)).join('')}
      </tbody>
    </table>
  `;
}

// セルの中身を改行で分割する。design.md §2.4: 現在系3列はドロップセット等で複数行になり得る。
function splitLines(v: unknown): string[] {
  const s = v === undefined || v === null ? '' : String(v);
  return s === '' ? [] : s.split('\n');
}

function renderRowGroup(r: BoardRow): string {
  const currentWeight = splitLines(r['現在重量(kg)']);
  const currentReps = splitLines(r['現在回数']);
  const currentSets = splitLines(r['現在セット']);
  const lineCount = Math.max(currentReps.length, 1);

  const targetWeight = valueOrDash(r['目標重量(kg)']);
  const targetReps = valueOrDash(r['目標回数']);
  const targetSets = valueOrDash(r['目標セット']);

  const lines = Array.from({ length: lineCount }, (_, i) => ({
    weight: currentWeight[i] !== undefined ? `${currentWeight[i]}kg` : '-',
    reps: currentReps[i] !== undefined ? `${currentReps[i]}回` : '-',
    sets: currentSets[i] !== undefined ? `${currentSets[i]}セット` : '-',
  }));

  return lines
    .map((line, i) => {
      const nameCell =
        i === 0 ? `<td rowspan="${lineCount}">${escapeHtml(String(r['種目名']))}</td>` : '';
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

function valueOrDash(v: unknown): string {
  return v === undefined || v === null || v === '' ? '-' : String(v);
}

function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}
