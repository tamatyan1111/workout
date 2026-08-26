import { deleteBodyWeightLog, editBodyWeightLog, getBodyWeightLogs } from './api';
import type { BodyWeightLog } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const DISPLAY_LIMIT = 8;

// design.md §3「プロフィールタブ」対応。運動タブの「直近の履歴」(recentLogs.ts)と同じ構成・
// 挙動に揃える(2026-08-16、bodyWeight.tsから分離した際に作った独自レイアウトを統一)。
// 編集ボタンは一覧全体で1つだけ置く。押すと全行が同時に入力モードへ切り替わり、各行に削除ボタンが
// 現れ、ボタン自体も「保存」に変わる。もう一度押すと、変更のあった行だけをまとめて送信する。
export async function renderRecentBodyWeights(container: HTMLElement): Promise<void> {
  container.innerHTML = '<p>読み込み中...</p>';
  let logs: BodyWeightLog[];
  try {
    logs = await getBodyWeightLogs(undefined, undefined, DISPLAY_LIMIT);
  } catch (err) {
    container.innerHTML = `<p class="error">直近の履歴の取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    return;
  }

  if (logs.length === 0) {
    container.innerHTML = '<p>記録がありません</p>';
    return;
  }

  // 直近8件を日付・ID降順(新しい→古い)で表示する。APIも同じ降順で返すため、そのまま使う
  // (2026-08-19、recentLogs.tsと同様に新しい記録を上に見たいとの要望を受けて変更)。
  let editing = false;

  draw();

  function draw(): void {
    container.innerHTML = `
      <div class="table-scroll">
        <table class="recent-logs-table">
          <colgroup>
            <col class="col-date" />
            <col class="col-bw-value" /><col class="col-bw-value" />
            <col class="col-actions" />
          </colgroup>
          <thead>
            <tr><th>日付</th><th>体重(kg)</th><th>体脂肪率(%)</th><th></th></tr>
          </thead>
          <tbody>
            ${logs.map((l) => renderRow(l, editing)).join('')}
          </tbody>
        </table>
      </div>
      <button type="button" id="toggle-edit-btn">${editing ? '保存' : '編集'}</button>
      <p id="recent-bw-status"></p>
    `;

    if (editing) {
      logs.forEach((l) => {
        const row = container.querySelector<HTMLTableRowElement>(`tr[data-record-id="${l.id}"]`);
        if (!row) return;
        row.querySelector('.delete-btn')!.addEventListener('click', async () => {
          try {
            await deleteBodyWeightLog(l.id);
            await renderRecentBodyWeights(container);
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
    const statusEl = container.querySelector<HTMLParagraphElement>('#recent-bw-status')!;

    const tasks: (() => Promise<unknown>)[] = [];
    logs.forEach((l) => {
      const row = container.querySelector<HTMLTableRowElement>(`tr[data-record-id="${l.id}"]`);
      if (!row) return;
      const date = row.querySelector<HTMLInputElement>('.edit-date')!.value;
      const weight = row.querySelector<HTMLInputElement>('.edit-weight')!.value;
      const bodyFatPercentage = row.querySelector<HTMLInputElement>('.edit-body-fat')!.value;
      const originalDate = l.logged_date.slice(0, 10);
      const originalWeight = String(l.weight);
      const originalBodyFat = l.body_fat_percentage === null ? '' : String(l.body_fat_percentage);
      if (date !== originalDate || weight !== originalWeight || bodyFatPercentage !== originalBodyFat) {
        tasks.push(() => editBodyWeightLog(l.id, date, weight, bodyFatPercentage));
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
      statusEl.textContent = results.some(
        (r) => r.status === 'rejected' && String(r.reason).includes('duplicate_date')
      )
        ? 'その日付には既に別の記録があります'
        : `${failedCount}件の保存に失敗しました`;
      toggleBtn.disabled = false;
    } else {
      await renderRecentBodyWeights(container);
    }
  }
}

function renderRow(l: BodyWeightLog, editing: boolean): string {
  const dateCell = editing
    ? `<input type="date" class="edit-date" value="${escapeHtml(l.logged_date.slice(0, 10))}" />`
    : escapeHtml(l.logged_date.slice(0, 10));
  const weightCell = editing
    ? `<input type="number" step="0.1" class="edit-weight" value="${escapeHtml(l.weight.toFixed(1))}" />`
    : escapeHtml(l.weight.toFixed(1));
  const bodyFatCell = editing
    ? `<input type="number" step="0.1" class="edit-body-fat" value="${escapeHtml(l.body_fat_percentage !== null ? l.body_fat_percentage.toFixed(1) : '')}" />`
    : escapeHtml(l.body_fat_percentage !== null ? l.body_fat_percentage.toFixed(1) : '-');

  return `
    <tr data-record-id="${l.id}">
      <td>${dateCell}</td>
      <td>${weightCell}</td>
      <td>${bodyFatCell}</td>
      <td class="actions">${editing ? '<button type="button" class="delete-btn danger">削除</button>' : ''}</td>
    </tr>
  `;
}
