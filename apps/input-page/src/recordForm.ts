import { addLog } from './api';
import type { Exercise, SetInput } from './types';
import { CYCLE_LABELS, escapeHtml } from 'shared';

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function emptySets(count = 3): SetInput[] {
  return Array.from({ length: count }, () => ({ weight: '', reps: '' }));
}

// design.md §2.5「現在値」をそのままセット欄の初期値として展開する
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

// 種目ドロップダウンの一番上(サイクル1→2→3の順で最初に出る種目)を返す
function firstExercise(exercises: Exercise[]): Exercise | undefined {
  for (const cycle of [1, 2, 3]) {
    const found = exercises.find((e) => e.cycle.id === cycle);
    if (found) return found;
  }
  return exercises[0];
}

// exercises は呼び出し元(main.ts)で取得済みのものを受け取る(ページ内で二重に取得しない)
// onSaved: 送信・削除が完了した後、一覧を再取得して更新するためのコールバック
export function renderRecordForm(container: HTMLElement, exercises: Exercise[], onSaved: () => void): void {
  // Rest(休憩)と廃止(過去に記録はあるが現在は行っていない種目)は入力対象から除外する
  const selectable = exercises.filter((e) => !e.is_discontinued && e.cycle.label !== 'Rest');

  let sets: SetInput[] = buildSetsFromCurrent(firstExercise(selectable));

  function currentExercise(): Exercise | undefined {
    const select = container.querySelector<HTMLSelectElement>('#record-exercise');
    // 初回描画時はまだ<select>がDOMに無い(またはvalueが未設定)ため、
    // sets の初期値と同じ「先頭の種目」にフォールバックする(これが無いと初回だけ
    // weightless の判定が誤って false になり、重量なし種目でも重量欄が出てしまう)
    if (!select || !select.value) {
      return firstExercise(selectable);
    }
    const id = Number(select.value);
    return selectable.find((e) => e.id === id);
  }

  function draw() {
    const previousValue = container.querySelector<HTMLSelectElement>('#record-exercise')?.value;
    const previousDate = container.querySelector<HTMLInputElement>('#record-date')?.value;
    const exercise = currentExercise();
    const weightless = exercise ? !exercise.is_weight_based : false;
    container.innerHTML = `
      <form id="record-form">
        <label>日付 <input type="date" id="record-date" value="${previousDate || todayStr()}" required /></label>
        <label>種目
          <select id="record-exercise" required>
            ${[1, 2, 3]
              .map((cycle) => {
                const rows = selectable.filter((e) => e.cycle.id === cycle);
                if (rows.length === 0) return '';
                return `
                  <optgroup label="${escapeHtml(`サイクル${cycle}: ${CYCLE_LABELS[cycle] ?? cycle}`)}">
                    ${rows.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')}
                  </optgroup>
                `;
              })
              .join('')}
          </select>
        </label>
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
        statusEl.textContent = `送信に失敗しました: ${String(err)}`;
        submitBtn.disabled = false;
      }
    });
  }

  draw();
}
