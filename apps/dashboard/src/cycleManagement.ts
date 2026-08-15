import { addCycle, deleteCycle, editCycle } from './api';
import type { Cycle } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §3「運動タブ」対応。サイクル管理(US-13)。管理表・記録入力が使うサイクル構成の
// 編集なので運動軸に属する。cyclesは呼び出し元(運動タブ)が既に取得済みのものを受け取り、
// 変更が成功したらonChangedを呼んで呼び出し元に全体再取得を委ねる(boardEdit.tsと同じパターン)。
export function renderCycleManagement(container: HTMLElement, cycles: Cycle[], onChanged: () => void): void {
  container.innerHTML = `
    <table class="cycle-table">
      <thead><tr><th>サイクル名</th><th></th></tr></thead>
      <tbody>
        ${cycles
          .map(
            (c) => `
          <tr data-id="${c.id}">
            <td><input type="text" class="cycle-label" value="${escapeHtml(c.label)}" /></td>
            <td>
              <button type="button" class="save-cycle-btn">保存</button>
              <button type="button" class="delete-cycle-btn">削除</button>
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
    <form id="add-cycle-form">
      <label>新しいサイクル名 <input type="text" id="new-cycle-label" required /></label>
      <button type="submit">追加</button>
    </form>
    <p id="cycle-status"></p>
  `;

  const statusEl = container.querySelector<HTMLParagraphElement>('#cycle-status')!;

  cycles.forEach((c) => {
    const row = container.querySelector<HTMLTableRowElement>(`tr[data-id="${c.id}"]`)!;
    row.querySelector('.save-cycle-btn')!.addEventListener('click', async () => {
      const label = row.querySelector<HTMLInputElement>('.cycle-label')!.value;
      try {
        await editCycle(c.id, label);
        statusEl.textContent = '保存しました';
      } catch (err) {
        statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
      }
    });
    row.querySelector('.delete-cycle-btn')!.addEventListener('click', async () => {
      if (!confirm(`サイクル「${c.label}」を削除しますか?`)) return;
      try {
        await deleteCycle(c.id);
        onChanged();
      } catch (err) {
        const message = errorMessage(err).includes('has_exercises')
          ? 'このサイクルには種目が登録されているため削除できません'
          : `削除に失敗しました: ${errorMessage(err)}`;
        alert(message);
      }
    });
  });

  container.querySelector<HTMLFormElement>('#add-cycle-form')!.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = container.querySelector<HTMLInputElement>('#new-cycle-label')!;
    const label = input.value;
    statusEl.textContent = '追加中...';
    try {
      await addCycle(label);
      onChanged();
    } catch (err) {
      statusEl.textContent = `追加に失敗しました: ${errorMessage(err)}`;
    }
  });
}
