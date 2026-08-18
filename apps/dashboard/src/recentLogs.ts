import { deleteLog, editLog, getRecentLogs } from './api';
import type { RecentLog } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const DISPLAY_LIMIT = 8;

// design.md §3.3: MySQL移行後はAPI応答が高速なため、楽観的更新(仮ID・裏取り等)は行わず、
// 応答を待ってから画面を更新するシンプルな同期フローにする。
// 直近8件を日付・ID降順(新しい→古い)で表示する。APIも同じ降順で返すため、そのまま使う
// (2026-08-19、新しい記録を上に見たいとの要望を受けて、以前の昇順表示から変更)。
// 編集ボタンは一覧全体で1つだけ置く。押すと全行が同時に入力モードへ切り替わり、各行に削除ボタンが
// 現れ、ボタン自体も「保存」に変わる。もう一度押すと、変更のあった行だけをまとめて送信する
// (boardEdit.tsの「保存」集約と同じ考え方)。
export async function renderRecentLogs(container: HTMLElement): Promise<void> {
  container.innerHTML = '<p>読み込み中...</p>';
  let logs: RecentLog[];
  try {
    logs = await getRecentLogs(DISPLAY_LIMIT);
  } catch (err) {
    container.innerHTML = `<p class="error">直近の履歴の取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    return;
  }

  if (logs.length === 0) {
    container.innerHTML = '<p>記録がありません</p>';
    return;
  }

  let editing = false;

  draw();

  function draw(): void {
    container.innerHTML = `
      <div class="table-scroll">
        <table class="recent-logs-table">
          <colgroup>
            <col class="col-date" />
            <col />
            <col class="col-weight" /><col class="col-count" />
            <col class="col-actions" />
          </colgroup>
          <thead>
            <tr><th>日付</th><th>種目名</th><th>重量(kg)</th><th>回数</th><th></th></tr>
          </thead>
          <tbody>
            ${logs.map((l) => renderRow(l, editing)).join('')}
          </tbody>
        </table>
      </div>
      <button type="button" id="toggle-edit-btn">${editing ? '保存' : '編集'}</button>
      <p id="recent-logs-status"></p>
    `;

    if (editing) {
      logs.forEach((l) => {
        const row = container.querySelector<HTMLTableRowElement>(`tr[data-record-id="${l.id}"]`);
        if (!row) return;
        row.querySelector('.delete-btn')!.addEventListener('click', async () => {
          try {
            await deleteLog(l.id);
            await renderRecentLogs(container);
          } catch (err) {
            alert(`削除に失敗しました: ${errorMessage(err)}`);
          }
        });
      });
    }

    container.querySelector('#toggle-edit-btn')!.addEventListener('click', () => {
      if (!editing) {
        editing = true;
        draw();
        return;
      }
      void saveAll();
    });
  }

  async function saveAll(): Promise<void> {
    const statusEl = container.querySelector<HTMLParagraphElement>('#recent-logs-status')!;

    const tasks: (() => Promise<unknown>)[] = [];
    logs.forEach((l) => {
      const row = container.querySelector<HTMLTableRowElement>(`tr[data-record-id="${l.id}"]`);
      if (!row) return;
      const date = row.querySelector<HTMLInputElement>('.edit-date')!.value;
      const weight = row.querySelector<HTMLInputElement>('.edit-weight')!.value;
      const reps = row.querySelector<HTMLInputElement>('.edit-reps')!.value;
      const originalDate = l.logged_date.slice(0, 10);
      const originalWeight = l.weight === null ? '' : String(l.weight);
      const originalReps = String(l.reps);
      if (date !== originalDate || weight !== originalWeight || reps !== originalReps) {
        tasks.push(() => editLog(l.id, date, weight, reps));
      }
    });

    if (tasks.length === 0) {
      editing = false;
      draw();
      return;
    }

    const toggleBtn = container.querySelector<HTMLButtonElement>('#toggle-edit-btn')!;
    toggleBtn.disabled = true;
    statusEl.textContent = '保存中...';

    const results = await Promise.allSettled(tasks.map((task) => task()));
    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      statusEl.textContent = `${failedCount}件の保存に失敗しました`;
      toggleBtn.disabled = false;
    } else {
      await renderRecentLogs(container);
    }
  }
}

function renderRow(l: RecentLog, editing: boolean): string {
  const dateCell = editing
    ? `<input type="date" class="edit-date" value="${escapeHtml(l.logged_date.slice(0, 10))}" />`
    : escapeHtml(l.logged_date.slice(0, 10));
  const weightCell = editing
    ? `<input type="number" step="0.01" class="edit-weight" value="${escapeHtml(l.weight === null ? '' : String(l.weight))}" />`
    : escapeHtml(l.weight === null ? '-' : String(l.weight));
  const repsCell = editing
    ? `<input type="number" class="edit-reps" value="${escapeHtml(String(l.reps))}" />`
    : escapeHtml(String(l.reps));

  return `
    <tr data-record-id="${l.id}">
      <td>${dateCell}</td>
      <td>${escapeHtml(l.exercise_name)}</td>
      <td>${weightCell}</td>
      <td>${repsCell}</td>
      <td class="actions">${editing ? '<button type="button" class="delete-btn danger">削除</button>' : ''}</td>
    </tr>
  `;
}
