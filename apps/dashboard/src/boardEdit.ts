import { addExercise, deleteExercise, editExercise } from './api';
import type { Cycle, Exercise } from './types';
import { escapeHtml } from 'shared';

// exercises・cycles は呼び出し元(dashboard.ts)で取得済みのものを受け取る。追加・編集・削除が
// 成功したら onChanged を呼び、呼び出し元にページ全体(記録フォームの選択肢等)の再取得を委ねる。
// cyclesは種目が1件も無いものも含む全件(design.md §2.10「get_cycles」)を渡すこと。
//
// 目標値の変更は行ごとの保存ボタンを持たず、最後に1つだけ置いた「保存」ボタンで
// 変更のあった行だけをまとめて送信する。種目の追加も別フォームにはせず、「種目を追加」で
// 同じテーブルに空の行を増やしていく(セット欄の「セットを追加」と同じ考え方)。
export function renderBoardEdit(container: HTMLElement, exercises: Exercise[], cycles: Cycle[], onChanged: () => void): void {
  let newRowKeys: number[] = [];
  let nextKey = 0;

  draw();

  function draw(): void {
    container.innerHTML = `
      <div class="table-scroll">
        <table class="board-edit-table">
          <colgroup>
            <col class="col-cycle" />
            <col class="col-name" />
            <col class="col-target" /><col class="col-target" /><col class="col-target" />
            <col class="col-discontinued" />
            <col class="col-actions" />
          </colgroup>
          <thead>
            <tr><th>サイクル</th><th>種目名</th><th>目標重量(kg)</th><th>目標回数</th><th>目標セット</th><th>廃止</th><th></th></tr>
          </thead>
          <tbody>
            ${exercises.map((e) => renderEditRow(e)).join('')}
            ${newRowKeys.map((key) => renderNewRow(key, cycles)).join('')}
          </tbody>
        </table>
      </div>
      ${
        cycles.length === 0
          ? '<p>サイクルがありません。先に設定画面からサイクルを作成してください。</p>'
          : '<button type="button" id="add-exercise-row-btn" class="link-button">+ 種目を追加</button>'
      }
      <button type="button" id="save-all-btn">保存</button>
      <p id="board-edit-status"></p>
    `;

    exercises.forEach((e) => {
      const row = container.querySelector<HTMLTableRowElement>(`tr[data-id="${e.id}"]`)!;
      row.querySelector('.delete-exercise-btn')!.addEventListener('click', async () => {
        if (!confirm(`種目「${e.name}」を削除しますか？(記録ログは残ります)`)) return;
        try {
          await deleteExercise(e.id);
          onChanged();
        } catch (err) {
          const message = String(err instanceof Error ? err.message : err).includes('has_logs')
            ? 'この種目には記録が紐づいているため削除できません(使わなくなった場合は「廃止」にチェックを入れて保存してください)'
            : `削除に失敗しました: ${String(err instanceof Error ? err.message : err)}`;
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

    container.querySelector('#add-exercise-row-btn')?.addEventListener('click', () => {
      newRowKeys.push(nextKey++);
      draw();
    });

    container.querySelector('#save-all-btn')!.addEventListener('click', () => void saveAll());
  }

  async function saveAll(): Promise<void> {
    const statusEl = container.querySelector<HTMLParagraphElement>('#board-edit-status')!;

    const editTasks: (() => Promise<unknown>)[] = [];
    exercises.forEach((e) => {
      const row = container.querySelector<HTMLTableRowElement>(`tr[data-id="${e.id}"]`);
      if (!row) return;
      const targetWeight = row.querySelector<HTMLInputElement>('.target-weight')!.value;
      const targetReps = row.querySelector<HTMLInputElement>('.target-reps')!.value;
      const targetSets = row.querySelector<HTMLInputElement>('.target-sets')!.value;
      const discontinued = row.querySelector<HTMLInputElement>('.discontinued')!.checked;
      const originalWeight = e.target.weight === null ? '' : String(e.target.weight);
      const originalReps = e.target.reps === null ? '' : String(e.target.reps);
      const originalSets = e.target.sets === null ? '' : String(e.target.sets);
      if (
        targetWeight !== originalWeight ||
        targetReps !== originalReps ||
        targetSets !== originalSets ||
        discontinued !== e.is_discontinued
      ) {
        editTasks.push(() => editExercise(e.id, targetWeight, targetReps, targetSets, discontinued));
      }
    });

    const addTasks: (() => Promise<unknown>)[] = [];
    let validationError = '';
    newRowKeys.forEach((key) => {
      const row = container.querySelector<HTMLTableRowElement>(`tr[data-new-key="${key}"]`);
      if (!row) return;
      const cycleId = Number(row.querySelector<HTMLSelectElement>('.new-cycle')!.value);
      const name = row.querySelector<HTMLInputElement>('.new-name')!.value;
      const targetWeight = row.querySelector<HTMLInputElement>('.new-target-weight')!.value;
      const targetReps = row.querySelector<HTMLInputElement>('.new-target-reps')!.value;
      const targetSets = row.querySelector<HTMLInputElement>('.new-target-sets')!.value;
      // 何も入力していない追加行は無視する(セット欄の未使用行と同じ扱い)
      if (name === '' && targetWeight === '' && targetReps === '' && targetSets === '') return;
      if (name === '' || targetReps === '' || targetSets === '') {
        validationError = '追加する種目は、種目名・目標回数・目標セットを入力してください';
        return;
      }
      addTasks.push(() => addExercise(cycleId, name, targetWeight, targetReps, targetSets));
    });

    if (validationError) {
      statusEl.textContent = validationError;
      return;
    }
    if (editTasks.length === 0 && addTasks.length === 0) {
      statusEl.textContent = '変更はありません';
      return;
    }

    const saveBtn = container.querySelector<HTMLButtonElement>('#save-all-btn')!;
    saveBtn.disabled = true;
    statusEl.textContent = '保存中...';

    const results = await Promise.allSettled([...editTasks, ...addTasks].map((task) => task()));
    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      statusEl.textContent = `${failedCount}件の保存に失敗しました`;
      saveBtn.disabled = false;
    } else {
      statusEl.textContent = '';
      newRowKeys = [];
      onChanged();
    }
  }
}

function renderEditRow(e: Exercise): string {
  return `
    <tr data-id="${e.id}">
      <td>${escapeHtml(e.cycle.label)}</td>
      <td>${escapeHtml(e.name)}</td>
      <td><input type="number" step="0.01" class="target-weight" value="${escapeHtml(e.target.weight === null ? '' : String(e.target.weight))}" /></td>
      <td><input type="number" class="target-reps" value="${escapeHtml(e.target.reps === null ? '' : String(e.target.reps))}" /></td>
      <td><input type="number" class="target-sets" value="${escapeHtml(e.target.sets === null ? '' : String(e.target.sets))}" /></td>
      <td><input type="checkbox" class="discontinued" ${e.is_discontinued ? 'checked' : ''} /></td>
      <td>
        <button type="button" class="delete-exercise-btn">削除</button>
      </td>
    </tr>
  `;
}

function renderNewRow(key: number, cycles: Cycle[]): string {
  return `
    <tr data-new-key="${key}">
      <td>
        <select class="new-cycle">
          ${cycles.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </td>
      <td><input type="text" class="new-name" placeholder="種目名" /></td>
      <td><input type="number" step="0.01" class="new-target-weight" /></td>
      <td><input type="number" class="new-target-reps" /></td>
      <td><input type="number" class="new-target-sets" /></td>
      <td></td>
      <td>
        <button type="button" class="remove-new-row-btn">削除</button>
      </td>
    </tr>
  `;
}
