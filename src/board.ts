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

// 休憩(分類がRest)も同じ表の1行として表示する。現在の記録・目標は
// 管理表シート上そもそも "-" や空欄が入っているため、特別扱いは不要(design.md §3)。
function renderTable(rows: BoardRow[]): string {
  return `
    <table class="board-table">
      <colgroup>
        <col class="col-name" />
        <col class="col-current" />
        <col class="col-target" />
        <col class="col-target" />
        <col class="col-target" />
      </colgroup>
      <thead>
        <tr>
          <th>種目名</th>
          <th>現在の記録</th>
          <th>目標重量</th>
          <th>目標回数</th>
          <th>目標セット</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => renderRow(r)).join('')}
      </tbody>
    </table>
  `;
}

function renderRow(r: BoardRow): string {
  const cell = (v: unknown) => escapeHtml(v === undefined || v === null || v === '' ? '-' : String(v));
  return `
    <tr>
      <td>${escapeHtml(String(r['種目名']))}</td>
      <td class="cell-current">${cell(r['現在の記録'])}</td>
      <td>${cell(r['目標重量(kg)'])}</td>
      <td>${cell(r['目標回数'])}</td>
      <td>${cell(r['目標セット'])}</td>
    </tr>
  `;
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
