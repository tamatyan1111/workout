import { addEatingOutMeal, deleteEatingOutMeal, editEatingOutMeal, getEatingOutMeals } from './api';
import type { EatingOutMeal } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §2.20「eating_out_meals テーブル」対応。材料は分からないが名前と総量の栄養値だけ
// 分かる食事(外食・コンビニ惣菜等)を、1食分の実値のまま登録・編集・削除する。
// レシピと同じく「1人前固定」(量の調整はしない)ため、custom_foods.tsと違いg数の入力欄はない。
export function renderEatingOut(container: HTMLElement, onChanged: () => void): void {
  let meals: EatingOutMeal[] = [];
  let editingId: number | null = null;

  refresh();

  function refresh(): void {
    container.innerHTML = '<p>読み込み中...</p>';
    void getEatingOutMeals()
      .then((m) => {
        meals = m;
        draw();
      })
      .catch((err) => {
        container.innerHTML = `<p class="error">外食メニューの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
      });
  }

  function draw(): void {
    container.innerHTML = `
      <table class="custom-food-table">
        <thead><tr><th>名前</th><th>カロリー</th><th>炭水化物</th><th>タンパク質</th><th>脂質</th><th></th></tr></thead>
        <tbody id="eating-out-rows"></tbody>
      </table>
      <button type="button" id="new-eating-out-btn" class="link-button">+ 外食メニューを追加</button>
      <div id="eating-out-form-wrap"></div>
    `;

    renderRows();
    container.querySelector('#new-eating-out-btn')!.addEventListener('click', () => {
      editingId = -1;
      renderForm(null);
    });
  }

  function renderRows(): void {
    const rowsEl = container.querySelector<HTMLElement>('#eating-out-rows')!;
    if (meals.length === 0) {
      rowsEl.innerHTML = '<tr><td colspan="6">登録されている外食メニューはありません</td></tr>';
      return;
    }
    rowsEl.innerHTML = meals
      .map(
        (m) => `
      <tr data-id="${m.id}">
        <td>${escapeHtml(m.name)}</td>
        <td>${m.kcal}kcal</td>
        <td>${m.carb_g}g</td>
        <td>${m.protein_g}g</td>
        <td>${m.fat_g}g</td>
        <td>
          <button type="button" class="edit-eating-out-btn">編集</button>
          <button type="button" class="delete-eating-out-btn danger">削除</button>
        </td>
      </tr>
    `
      )
      .join('');

    meals.forEach((m) => {
      const row = rowsEl.querySelector<HTMLTableRowElement>(`tr[data-id="${m.id}"]`)!;
      row.querySelector('.edit-eating-out-btn')!.addEventListener('click', () => {
        editingId = m.id;
        renderForm(m);
      });
      row.querySelector('.delete-eating-out-btn')!.addEventListener('click', async () => {
        if (!confirm(`「${m.name}」を削除しますか?`)) return;
        try {
          await deleteEatingOutMeal(m.id);
          refresh();
          onChanged();
        } catch (err) {
          alert(`削除に失敗しました: ${errorMessage(err)}`);
        }
      });
    });
  }

  function renderForm(meal: EatingOutMeal | null): void {
    const wrapEl = container.querySelector<HTMLElement>('#eating-out-form-wrap')!;
    wrapEl.innerHTML = `
      <form id="eating-out-form">
        <div class="field-row">
          <label class="field">名前 <input type="text" id="eo-name" value="${escapeHtml(meal?.name ?? '')}" required /></label>
          <label class="field">カロリー(kcal) <input type="number" step="0.1" id="eo-kcal" value="${meal?.kcal ?? ''}" required /></label>
        </div>
        <div class="field-row">
          <label class="field">炭水化物(g) <input type="number" step="0.1" id="eo-carb" value="${meal?.carb_g ?? ''}" required /></label>
          <label class="field">タンパク質(g) <input type="number" step="0.1" id="eo-protein" value="${meal?.protein_g ?? ''}" required /></label>
          <label class="field">脂質(g) <input type="number" step="0.1" id="eo-fat" value="${meal?.fat_g ?? ''}" required /></label>
        </div>
        <p class="field-note">1食分として実際に食べた分の値をそのまま入力してください(量の調整はしません)</p>
        <button type="submit">保存</button>
        <button type="button" id="cancel-eating-out-btn">キャンセル</button>
        <p id="eating-out-status"></p>
      </form>
    `;

    wrapEl.querySelector('#cancel-eating-out-btn')!.addEventListener('click', () => {
      editingId = null;
      wrapEl.innerHTML = '';
    });

    wrapEl.querySelector<HTMLFormElement>('#eating-out-form')!.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const statusEl = wrapEl.querySelector<HTMLParagraphElement>('#eating-out-status')!;
      const name = wrapEl.querySelector<HTMLInputElement>('#eo-name')!.value;
      const kcal = wrapEl.querySelector<HTMLInputElement>('#eo-kcal')!.value;
      const protein = wrapEl.querySelector<HTMLInputElement>('#eo-protein')!.value;
      const fat = wrapEl.querySelector<HTMLInputElement>('#eo-fat')!.value;
      const carb = wrapEl.querySelector<HTMLInputElement>('#eo-carb')!.value;
      statusEl.textContent = '保存中...';
      try {
        if (editingId === -1) {
          await addEatingOutMeal(name, kcal, protein, fat, carb);
        } else {
          await editEatingOutMeal(editingId!, name, kcal, protein, fat, carb);
        }
        editingId = null;
        refresh();
        onChanged();
      } catch (err) {
        statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
      }
    });
  }
}
