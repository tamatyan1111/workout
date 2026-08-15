import { addLog } from './api';
import { todayStr } from './date';
import type { Exercise, SetInput } from './types';
import { escapeHtml } from 'shared';

export function emptySets(count = 3): SetInput[] {
  return Array.from({ length: count }, () => ({ weight: '', reps: '' }));
}

// design.md §2.9「現在値」をそのままセット欄の初期値として展開する
export function buildSetsFromCurrent(exercise: Exercise | undefined): SetInput[] {
  if (!exercise || exercise.current.length === 0) return emptySets();

  const result: SetInput[] = [];
  exercise.current.forEach((group) => {
    for (let i = 0; i < group.sets; i++) {
      result.push({
        weight: group.weight === null ? '' : String(group.weight),
        reps: String(group.reps),
      });
    }
  });
  return result;
}

// exercises は呼び出し元(dashboard.ts)で取得済みのものを受け取る(ページ内で二重に取得しない)
// onSaved: 送信・削除が完了した後、一覧を再取得して更新するためのコールバック
export function renderRecordForm(container: HTMLElement, exercises: Exercise[], onSaved: () => void): void {
  // design.md §2.3: サイクルの特別扱いは廃止したため、除外するのは廃止済み種目のみ
  const selectable = exercises.filter((e) => !e.is_discontinued);
  // get_boardはcycle_id昇順(作成順)で返るため、先頭が「最初のサイクルの最初の種目」になる
  const firstExercise = (): Exercise | undefined => selectable[0];

  let sets: SetInput[] = buildSetsFromCurrent(firstExercise());

  if (selectable.length === 0) {
    container.innerHTML = '<p>まだ種目が登録されていません。「種目を管理する」から追加してください。</p>';
    return;
  }

  function currentExercise(): Exercise | undefined {
    const select = container.querySelector<HTMLSelectElement>('#record-exercise');
    // 初回描画時はまだ<select>がDOMに無い(またはvalueが未設定)ため、
    // sets の初期値と同じ「先頭の種目」にフォールバックする(これが無いと初回だけ
    // weightless の判定が誤って false になり、重量なし種目でも重量欄が出てしまう)
    if (!select || !select.value) {
      return firstExercise();
    }
    const id = Number(select.value);
    return selectable.find((e) => e.id === id);
  }

  function draw() {
    const previousValue = container.querySelector<HTMLSelectElement>('#record-exercise')?.value;
    const previousDate = container.querySelector<HTMLInputElement>('#record-date')?.value;
    const exercise = currentExercise();
    const weightless = exercise ? !exercise.is_weight_based : false;
    const cycleIds = [...new Set(selectable.map((e) => e.cycle.id))].sort((a, b) => a - b);

    container.innerHTML = `
      <form id="record-form">
        <div class="field-row">
          <label class="field">日付 <input type="date" id="record-date" value="${previousDate || todayStr()}" required /></label>
          <label class="field">種目
            <select id="record-exercise" required>
              ${cycleIds
                .map((cycleId) => {
                  const rows = selectable.filter((e) => e.cycle.id === cycleId);
                  return `
                    <optgroup label="${escapeHtml(rows[0].cycle.label)}">
                      ${rows.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')}
                    </optgroup>
                  `;
                })
                .join('')}
            </select>
          </label>
        </div>
        <div id="set-rows">
          ${sets
            .map(
              (s, i) => `
            <div class="set-row">
              <span>セット${i + 1}</span>
              ${weightless ? '' : `<input type="number" step="0.01" placeholder="重量(kg)" data-set="${i}" data-field="weight" value="${escapeHtml(s.weight)}" />`}
              <input type="number" placeholder="回数" data-set="${i}" data-field="reps" value="${escapeHtml(s.reps)}" />
              ${
                i === 0
                  ? `<button type="button" class="copy-above copy-above-placeholder" disabled tabindex="-1" aria-hidden="true">コピー</button>`
                  : `<button type="button" class="copy-above" data-copy="${i}">コピー</button>`
              }
              <button type="button" class="remove-set" data-remove="${i}" ${sets.length <= 1 ? 'disabled' : ''}>削除</button>
            </div>
          `
            )
            .join('')}
        </div>
        <button type="button" id="add-set">セットを追加</button>
        <button type="submit">記録を送信</button>
        <p id="record-status"></p>
      </form>
    `;

    const selectEl = container.querySelector<HTMLSelectElement>('#record-exercise')!;
    if (previousValue) selectEl.value = previousValue;
    selectEl.addEventListener('change', () => {
      // 種目を切り替えたら、その種目の前回の記録内容を入力欄の初期値にする
      sets = buildSetsFromCurrent(currentExercise());
      draw();
    });
    container.querySelector('#add-set')!.addEventListener('click', () => {
      sets.push({ weight: '', reps: '' });
      draw();
    });
    container.querySelectorAll<HTMLButtonElement>('.remove-set').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (sets.length <= 1) return;
        const i = Number(btn.dataset.remove);
        sets.splice(i, 1);
        draw();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('.copy-above').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.copy);
        if (i <= 0) return;
        sets[i] = { ...sets[i - 1] };
        draw();
      });
    });
    container.querySelectorAll<HTMLInputElement>('[data-set]').forEach((input) => {
      input.addEventListener('input', () => {
        const i = Number(input.dataset.set);
        const field = input.dataset.field as 'weight' | 'reps';
        sets[i][field] = input.value;
      });
    });

    const formEl = container.querySelector<HTMLFormElement>('#record-form')!;
    const submitBtn = formEl.querySelector<HTMLButtonElement>('button[type="submit"]')!;

    formEl.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const statusEl = container.querySelector<HTMLParagraphElement>('#record-status')!;
      const date = container.querySelector<HTMLInputElement>('#record-date')!.value;
      const exerciseId = Number(container.querySelector<HTMLSelectElement>('#record-exercise')!.value);

      // 重量・回数がどちらも空欄のセットは、未使用行として無視する(1〜2セットだけの入力を許容するため)
      const filledSets = sets.filter((s) => !(s.weight === '' && s.reps === ''));
      if (filledSets.length === 0) {
        statusEl.textContent = '少なくとも1セットは入力してください';
        return;
      }
      if (filledSets.some((s) => s.reps === '')) {
        statusEl.textContent = '回数は必須です';
        return;
      }
      if (!weightless && filledSets.some((s) => s.weight === '')) {
        statusEl.textContent = '重量は必須です';
        return;
      }

      submitBtn.disabled = true;
      statusEl.textContent = '送信中...';
      try {
        await addLog(exerciseId, date, filledSets);
        statusEl.textContent = '送信しました';
        sets = emptySets();
        draw();
        onSaved();
      } catch (err) {
        statusEl.textContent = `送信に失敗しました: ${String(err instanceof Error ? err.message : err)}`;
        submitBtn.disabled = false;
      }
    });
  }

  draw();
}
