import { addCycle, deleteCycle, editCycle } from './api';
import type { Cycle } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §3「運動タブ」対応。サイクル管理(US-13)。boardEdit.tsと同じパターンで、
// 既存行の保存ボタンは持たず末尾に1つだけ置く。新しいサイクルの追加も別フォームにはせず、
// 既存行と同じ見た目の空行をテーブルに増やし、保存ボタンでまとめて送信する。
export function renderCycleManagement(container: HTMLElement, cycles: Cycle[], onChanged: () => void): void {
  let newRowKeys: number[] = [];
  let nextKey = 0;

  draw();

  function draw(): void {
    container.innerHTML = `
      <table class="cycle-table">
        <colgroup><col class="col-label" /><col class="col-actions" /></colgroup>
        <thead><tr><th>サイクル名</th><th></th></tr></thead>
        <tbody>
          ${cycles.map((c) => renderRow(c)).join('')}
          ${newRowKeys.map((key) => renderNewRow(key)).join('')}
        </tbody>
      </table>
      <div class="board-edit-actions">
        <button type="button" id="add-cycle-row-btn" class="link-button">+ サイクルを追加</button>
        <button type="button" id="save-cycles-btn">保存</button>
      </div>
      <p id="cycle-status"></p>
    `;

    const statusEl = container.querySelector<HTMLParagraphElement>('#cycle-status')!;

    cycles.forEach((c) => {
      const row = container.querySelector<HTMLTableRowElement>(`tr[data-id="${c.id}"]`)!;
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

    newRowKeys.forEach((key) => {
      const row = container.querySelector<HTMLTableRowElement>(`tr[data-new-key="${key}"]`)!;
      row.querySelector('.remove-new-row-btn')!.addEventListener('click', () => {
        newRowKeys = newRowKeys.filter((k) => k !== key);
        draw();
      });
    });

    container.querySelector('#add-cycle-row-btn')!.addEventListener('click', () => {
      newRowKeys.push(nextKey++);
      draw();
    });

    container.querySelector('#save-cycles-btn')!.addEventListener('click', () => void saveAll(statusEl));
  }

  async function saveAll(statusEl: HTMLParagraphElement): Promise<void> {
    const editTasks: (() => Promise<unknown>)[] = [];
    cycles.forEach((c) => {
      const row = container.querySelector<HTMLTableRowElement>(`tr[data-id="${c.id}"]`);
      if (!row) return;
      const label = row.querySelector<HTMLInputElement>('.cycle-label')!.value;
      if (label !== c.label) {
        editTasks.push(() => editCycle(c.id, label));
      }
    });

    const addTasks: (() => Promise<unknown>)[] = [];
    newRowKeys.forEach((key) => {
      const row = container.querySelector<HTMLTableRowElement>(`tr[data-new-key="${key}"]`);
      if (!row) return;
      const label = row.querySelector<HTMLInputElement>('.new-cycle-label')!.value;
      if (label === '') return;
      addTasks.push(() => addCycle(label));
    });

    if (editTasks.length === 0 && addTasks.length === 0) {
      statusEl.textContent = '変更はありません';
      return;
    }

    const saveBtn = container.querySelector<HTMLButtonElement>('#save-cycles-btn')!;
    saveBtn.disabled = true;
    statusEl.textContent = '保存中...';

    const results = await Promise.allSettled([...editTasks, ...addTasks].map((task) => task()));
    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      statusEl.textContent = `${failedCount}件の保存に失敗しました`;
      saveBtn.disabled = false;
    } else if (addTasks.length > 0) {
      onChanged();
    } else {
      statusEl.textContent = '保存しました';
      saveBtn.disabled = false;
    }
  }
}

function renderRow(c: Cycle): string {
  return `
    <tr data-id="${c.id}">
      <td><input type="text" class="cycle-label" value="${escapeHtml(c.label)}" /></td>
      <td>
        <button type="button" class="delete-cycle-btn danger">削除</button>
      </td>
    </tr>
  `;
}

function renderNewRow(key: number): string {
  return `
    <tr data-new-key="${key}">
      <td><input type="text" class="new-cycle-label" placeholder="サイクル名" /></td>
      <td>
        <button type="button" class="remove-new-row-btn">削除</button>
      </td>
    </tr>
  `;
}
