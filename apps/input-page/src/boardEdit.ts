import { addExercise, deleteExercise, editExercise } from './api';
import type { Exercise } from './types';
import { CYCLE_LABELS, escapeHtml } from 'shared';

// exercises は呼び出し元(main.ts)で取得済みのものを受け取る。追加・編集・削除が成功したら
// onChanged を呼び、呼び出し元にページ全体(記録フォームの選択肢等)の再取得を委ねる。
export function renderBoardEdit(container: HTMLElement, exercises: Exercise[], onChanged: () => void): void {
  const editable = exercises.filter((e) => e.cycle.label !== 'Rest');

  container.innerHTML = `
    <table class="board-edit-table">
      <thead>
        <tr><th>サイクル</th><th>種目名</th><th>目標重量</th><th>目標回数</th><th>目標セット</th><th>廃止</th><th></th></tr>
      </thead>
      <tbody>
        ${editable.map((e) => renderEditRow(e)).join('')}
      </tbody>
    </table>

    <h3>種目を追加</h3>
    <form id="add-exercise-form">
      <label>サイクル
        <select id="new-cycle" required>
          ${[1, 2, 3]
            .map((c) => `<option value="${c}">サイクル${c}: ${escapeHtml(CYCLE_LABELS[c])}</option>`)
            .join('')}
        </select>
      </label>
      <label>種目名 <input type="text" id="new-name" required /></label>
      <label>目標重量(kg) <input type="number" step="0.01" id="new-target-weight" /></label>
      <label>目標回数 <input type="number" id="new-target-reps" required /></label>
      <label>目標セット <input type="number" id="new-target-sets" required /></label>
      <button type="submit">追加</button>
      <p id="add-exercise-status"></p>
    </form>
  `;

  editable.forEach((e) => {
    const row = container.querySelector<HTMLTableRowElement>(`tr[data-id="${e.id}"]`)!;

    row.querySelector('.save-btn')!.addEventListener('click', async () => {
      const targetWeight = row.querySelector<HTMLInputElement>('.target-weight')!.value;
      const targetReps = row.querySelector<HTMLInputElement>('.target-reps')!.value;
      const targetSets = row.querySelector<HTMLInputElement>('.target-sets')!.value;
      const discontinued = row.querySelector<HTMLInputElement>('.discontinued')!.checked;
      try {
        await editExercise(e.id, targetWeight, targetReps, targetSets, discontinued);
        alert('更新しました');
        onChanged();
      } catch (err) {
        alert(`更新に失敗しました: ${String(err)}`);
      }
    });

    row.querySelector('.delete-exercise-btn')!.addEventListener('click', async () => {
      if (!confirm(`種目「${e.name}」を削除しますか？(記録ログは残ります)`)) return;
      try {
        await deleteExercise(e.id);
        onChanged();
      } catch (err) {
        const message = String(err).includes('has_logs')
          ? 'この種目には記録が紐づいているため削除できません(使わなくなった場合は「廃止」にチェックを入れて保存してください)'
          : `削除に失敗しました: ${String(err)}`;
        alert(message);
      }
    });
  });

  container.querySelector('#add-exercise-form')!.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const statusEl = container.querySelector<HTMLParagraphElement>('#add-exercise-status')!;
    const cycleId = Number(container.querySelector<HTMLSelectElement>('#new-cycle')!.value);
    const name = container.querySelector<HTMLInputElement>('#new-name')!.value;
    const targetWeight = container.querySelector<HTMLInputElement>('#new-target-weight')!.value;
    const targetReps = container.querySelector<HTMLInputElement>('#new-target-reps')!.value;
    const targetSets = container.querySelector<HTMLInputElement>('#new-target-sets')!.value;
    statusEl.textContent = '送信中...';
    try {
      await addExercise(cycleId, name, targetWeight, targetReps, targetSets);
      onChanged();
    } catch (err) {
      statusEl.textContent = `追加に失敗しました: ${String(err)}`;
    }
  });
}

function renderEditRow(e: Exercise): string {
  const cycleId = e.cycle.id;
  return `
    <tr data-id="${e.id}">
      <td>${escapeHtml(CYCLE_LABELS[cycleId] ?? String(cycleId))}</td>
      <td>${escapeHtml(e.name)}</td>
      <td><input type="number" step="0.01" class="target-weight" value="${escapeHtml(e.target.weight === null ? '' : String(e.target.weight))}" /></td>
      <td><input type="number" class="target-reps" value="${escapeHtml(e.target.reps === null ? '' : String(e.target.reps))}" /></td>
      <td><input type="number" class="target-sets" value="${escapeHtml(e.target.sets === null ? '' : String(e.target.sets))}" /></td>
      <td><input type="checkbox" class="discontinued" ${e.is_discontinued ? 'checked' : ''} /></td>
      <td>
        <button type="button" class="save-btn">保存</button>
        <button type="button" class="delete-exercise-btn">削除</button>
      </td>
    </tr>
  `;
}
