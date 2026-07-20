import { getBoard } from './api';
import type { BoardRow } from './types';

const CYCLE_LABELS: Record<number, string> = {
  1: 'サイクル1: Push',
  2: 'サイクル2: Pull',
  3: 'サイクル3: Legs',
  4: 'サイクル4: Rest',
};

export async function renderBoard(container: HTMLElement): Promise<void> {
  container.innerHTML = '<p>読み込み中...</p>';
  try {
    const rows = await getBoard();
    container.innerHTML = renderCycles(rows);
  } catch (err) {
    container.innerHTML = `<p class="error">管理表の取得に失敗しました: ${escapeHtml(String(err))}</p>`;
  }
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

// 休憩(分類がRest)も同じ表の1行として表示する。重量・回数・セットは
// 管理表シート上そもそも "-" が入っているため、特別扱いは不要(design.md §3)。
function renderTable(rows: BoardRow[]): string {
  return `
    <table class="board-table">
      <thead>
        <tr>
          <th>種目名</th>
          <th>現在重量</th>
          <th>現在回数</th>
          <th>現在セット</th>
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
      <td>${cell(r['現在重量(kg)'])}</td>
      <td>${cell(r['現在回数'])}</td>
      <td>${cell(r['現在セット'])}</td>
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
