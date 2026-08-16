import { deleteLog, editLog, getRecentLogs } from './api';
import type { RecentLog } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const DISPLAY_LIMIT = 8;

// design.md §3.3: MySQL移行後はAPI応答が高速なため、楽観的更新(仮ID・裏取り等)は行わず、
// 応答を待ってから画面を更新するシンプルな同期フローにする。
// 直近8件を日付・ID昇順(古い→新しい)で表示する。APIからは新しい順に取得し、表示直前に反転する。
// 編集は行ごとに行い、通常表示では編集/削除ボタンを出さず、「編集」ボタンを押した行だけ
// 入力欄と保存/削除ボタンに切り替わる(誤操作防止と一覧の見やすさのため)。
export async function renderRecentLogs(container: HTMLElement): Promise<void> {
  container.innerHTML = '<p>読み込み中...</p>';
  let logs: RecentLog[];
  try {
    logs = await getRecentLogs(DISPLAY_LIMIT);
  } catch (err) {
    container.innerHTML = `<p class="error">直近の記録の取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    return;
  }

  if (logs.length === 0) {
    container.innerHTML = '<p>記録がありません</p>';
    return;
  }

  logs = [...logs].reverse();

  container.innerHTML = `
    <table class="recent-logs-table">
      <thead>
        <tr><th>日付</th><th>種目</th><th>セット</th><th>重量</th><th>回数</th><th></th></tr>
      </thead>
      <tbody>
        ${logs.map((l) => renderRow(l)).join('')}
      </tbody>
    </table>
    <p id="recent-logs-status"></p>
  `;

  const statusEl = container.querySelector<HTMLParagraphElement>('#recent-logs-status')!;

  logs.forEach((l) => {
    const row = container.querySelector<HTMLTableRowElement>(`tr[data-record-id="${l.id}"]`);
    if (!row) return;
    row.querySelector('.edit-btn')!.addEventListener('click', () => enterEditMode(row, l));
  });

  function enterEditMode(row: HTMLTableRowElement, l: RecentLog): void {
    row.querySelector('.cell-date')!.innerHTML =
      `<input type="date" class="edit-date" value="${escapeHtml(l.logged_date.slice(0, 10))}" />`;
    row.querySelector('.cell-weight')!.innerHTML =
      `<input type="number" step="0.01" class="edit-weight" value="${escapeHtml(l.weight === null ? '' : String(l.weight))}" />`;
    row.querySelector('.cell-reps')!.innerHTML =
      `<input type="number" class="edit-reps" value="${escapeHtml(String(l.reps))}" />`;
    row.querySelector('.actions')!.innerHTML = `
      <button type="button" class="save-btn">保存</button>
      <button type="button" class="delete-btn danger">削除</button>
    `;

    row.querySelector('.save-btn')!.addEventListener('click', async () => {
      const date = row.querySelector<HTMLInputElement>('.edit-date')!.value;
      const weight = row.querySelector<HTMLInputElement>('.edit-weight')!.value;
      const reps = row.querySelector<HTMLInputElement>('.edit-reps')!.value;
      statusEl.textContent = '保存中...';
      try {
        await editLog(l.id, date, weight, reps);
        await renderRecentLogs(container);
      } catch (err) {
        statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
      }
    });
    row.querySelector('.delete-btn')!.addEventListener('click', async () => {
      try {
        await deleteLog(l.id);
        await renderRecentLogs(container);
      } catch (err) {
        alert(`削除に失敗しました: ${errorMessage(err)}`);
      }
    });
  }
}

function renderRow(l: RecentLog): string {
  return `
    <tr data-record-id="${l.id}">
      <td class="cell-date">${escapeHtml(l.logged_date.slice(0, 10))}</td>
      <td>${escapeHtml(l.exercise_name)}</td>
      <td>${escapeHtml(String(l.set_number))}</td>
      <td class="cell-weight">${escapeHtml(l.weight === null ? '-' : String(l.weight))}</td>
      <td class="cell-reps">${escapeHtml(String(l.reps))}</td>
      <td class="actions">
        <button type="button" class="edit-btn">編集</button>
      </td>
    </tr>
  `;
}
