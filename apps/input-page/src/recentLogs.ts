import { deleteLog, editLog, getRecentLogs } from './api';
import type { RecentLog } from './types';
import { escapeHtml } from 'shared';

// design.md §3.3: MySQL移行後はAPI応答が高速なため、楽観的更新(仮ID・裏取り等)は行わず、
// 応答を待ってから画面を更新するシンプルな同期フローにする。
// 1行ずつ編集/保存すると件数が多いときに時間がかかるため、「まとめて編集」ボタン1つで
// 表示中の全行を同時に入力モードへ切り替え、「保存」ボタン1つでまとめて送信する。
export async function renderRecentLogs(container: HTMLElement): Promise<void> {
  container.innerHTML = '<p>読み込み中...</p>';
  let logs: RecentLog[] = [];
  try {
    logs = await getRecentLogs(20);
  } catch (err) {
    container.innerHTML = `<p class="error">直近の記録の取得に失敗しました: ${escapeHtml(String(err))}</p>`;
    return;
  }

  if (logs.length === 0) {
    container.innerHTML = '<p>記録がありません</p>';
    return;
  }

  container.innerHTML = `
    <button type="button" id="bulk-edit-btn">まとめて編集</button>
    <p id="bulk-status"></p>
    <table class="recent-logs-table">
      <thead>
        <tr><th>日付</th><th>種目</th><th>セット</th><th>重量</th><th>回数</th><th></th></tr>
      </thead>
      <tbody>
        ${logs.map((l) => renderRow(l)).join('')}
      </tbody>
    </table>
  `;

  const statusEl = container.querySelector<HTMLParagraphElement>('#bulk-status')!;
  const bulkBtn = container.querySelector<HTMLButtonElement>('#bulk-edit-btn')!;

  logs.forEach((l) => {
    const row = container.querySelector<HTMLTableRowElement>(`tr[data-record-id="${l.id}"]`);
    if (!row) return;
    row.querySelector('.delete-btn')!.addEventListener('click', async () => {
      const btn = row.querySelector<HTMLButtonElement>('.delete-btn')!;
      btn.disabled = true;
      try {
        await deleteLog(l.id);
        await renderRecentLogs(container);
      } catch (err) {
        alert(`削除に失敗しました: ${String(err)}`);
        btn.disabled = false;
      }
    });
  });

  let editing = false;
  bulkBtn.addEventListener('click', async () => {
    if (!editing) {
      editing = true;
      bulkBtn.textContent = '保存';
      logs.forEach((l) => {
        const row = container.querySelector<HTMLTableRowElement>(`tr[data-record-id="${l.id}"]`);
        if (!row) return;
        row.querySelector('.cell-date')!.innerHTML =
          `<input type="date" class="edit-date" value="${escapeHtml(l.logged_date.slice(0, 10))}" />`;
        row.querySelector('.cell-weight')!.innerHTML =
          `<input type="number" step="0.01" class="edit-weight" value="${escapeHtml(l.weight === null ? '' : String(l.weight))}" />`;
        row.querySelector('.cell-reps')!.innerHTML =
          `<input type="number" class="edit-reps" value="${escapeHtml(String(l.reps))}" />`;
        row.querySelector('.actions')!.innerHTML = '';
      });
      return;
    }

    // 編集モードに入った時点の値と比較し、実際に変更された行だけを送信対象にする
    const edited = logs.map((l) => {
      const row = container.querySelector<HTMLTableRowElement>(`tr[data-record-id="${l.id}"]`);
      const date = row?.querySelector<HTMLInputElement>('.edit-date')?.value ?? l.logged_date.slice(0, 10);
      const weight =
        row?.querySelector<HTMLInputElement>('.edit-weight')?.value ??
        (l.weight === null ? '' : String(l.weight));
      const reps = row?.querySelector<HTMLInputElement>('.edit-reps')?.value ?? String(l.reps);
      return { l, date, weight, reps };
    });
    const changed = edited.filter(({ l, date, weight, reps }) => {
      const originalDate = l.logged_date.slice(0, 10);
      const originalWeight = l.weight === null ? '' : String(l.weight);
      const originalReps = String(l.reps);
      return date !== originalDate || weight !== originalWeight || reps !== originalReps;
    });

    if (changed.length === 0) {
      editing = false;
      bulkBtn.textContent = 'まとめて編集';
      await renderRecentLogs(container);
      return;
    }

    bulkBtn.disabled = true;
    let doneCount = 0;
    statusEl.textContent = `保存中... (0/${changed.length}件)`;

    // 送信対象を1件ずつ待たず並列で送る
    const results = await Promise.allSettled(
      changed.map(async ({ l, date, weight, reps }) => {
        await editLog(l.id, date, weight, reps);
        doneCount++;
        statusEl.textContent = `保存中... (${doneCount}/${changed.length}件)`;
      })
    );

    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      statusEl.textContent = `${failedCount}件の保存に失敗しました(${changed.length - failedCount}件は保存済み)`;
      bulkBtn.disabled = false;
    } else {
      statusEl.textContent = '';
      await renderRecentLogs(container);
    }
  });
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
        <button type="button" class="delete-btn">削除</button>
      </td>
    </tr>
  `;
}
