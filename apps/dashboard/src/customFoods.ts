import { addCustomFood, deleteCustomFood, editCustomFood, getCustomFoods } from './api';
import type { CustomFood } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §2.13「custom_foods テーブル」対応。ユーザーが自分だけの食品(手作り料理の
// 材料・成分表にない商品等)を登録・編集・削除する。§7方針により、登録できるのは
// 「食材」単位のみ(料理はレシピ機能(recipes.ts)側で食材の組み合わせとして表現する)。
export function renderCustomFoods(container: HTMLElement, onChanged: () => void): void {
  let foods: CustomFood[] = [];
  let editingId: number | null = null;

  refresh();

  function refresh(): void {
    container.innerHTML = '<p>読み込み中...</p>';
    void getCustomFoods()
      .then((f) => {
        foods = f;
        draw();
      })
      .catch((err) => {
        container.innerHTML = `<p class="error">独自食材の取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
      });
  }

  function draw(): void {
    container.innerHTML = `
      <table class="custom-food-table">
        <thead><tr><th>食品名</th><th>kcal/100g</th><th>P/100g</th><th>F/100g</th><th>C/100g</th><th></th></tr></thead>
        <tbody id="custom-food-rows"></tbody>
      </table>
      <button type="button" id="new-custom-food-btn" class="link-button">+ 独自食材を追加</button>
      <div id="custom-food-form-wrap"></div>
    `;

    renderRows();
    container.querySelector('#new-custom-food-btn')!.addEventListener('click', () => {
      editingId = -1;
      renderForm(null);
    });
  }

  function renderRows(): void {
    const rowsEl = container.querySelector<HTMLElement>('#custom-food-rows')!;
    if (foods.length === 0) {
      rowsEl.innerHTML = '<tr><td colspan="6">登録されている独自食材はありません</td></tr>';
      return;
    }
    rowsEl.innerHTML = foods
      .map(
        (f) => `
      <tr data-id="${f.id}">
        <td>${escapeHtml(f.name)}</td>
        <td>${f.kcal_per_100g}</td>
        <td>${f.protein_g_per_100g}</td>
        <td>${f.fat_g_per_100g}</td>
        <td>${f.carb_g_per_100g}</td>
        <td>
          <button type="button" class="edit-food-btn">編集</button>
          <button type="button" class="delete-food-btn danger">削除</button>
        </td>
      </tr>
    `
      )
      .join('');

    foods.forEach((f) => {
      const row = rowsEl.querySelector<HTMLTableRowElement>(`tr[data-id="${f.id}"]`)!;
      row.querySelector('.edit-food-btn')!.addEventListener('click', () => {
        editingId = f.id;
        renderForm(f);
      });
      row.querySelector('.delete-food-btn')!.addEventListener('click', async () => {
        if (!confirm(`「${f.name}」を削除しますか?`)) return;
        try {
          await deleteCustomFood(f.id);
          refresh();
          onChanged();
        } catch (err) {
          const message = errorMessage(err).includes('has_recipes')
            ? 'この食材はレシピで使われているため削除できません'
            : `削除に失敗しました: ${errorMessage(err)}`;
          alert(message);
        }
      });
    });
  }

  function renderForm(food: CustomFood | null): void {
    const wrapEl = container.querySelector<HTMLElement>('#custom-food-form-wrap')!;
    wrapEl.innerHTML = `
      <form id="custom-food-form">
        <div class="field-row">
          <label class="field">食品名 <input type="text" id="cf-name" value="${escapeHtml(food?.name ?? '')}" required /></label>
          <label class="field">カロリー(kcal/100g) <input type="number" step="0.1" id="cf-kcal" value="${food?.kcal_per_100g ?? ''}" required /></label>
        </div>
        <div class="field-row">
          <label class="field">タンパク質(g/100g) <input type="number" step="0.1" id="cf-protein" value="${food?.protein_g_per_100g ?? ''}" required /></label>
          <label class="field">脂質(g/100g) <input type="number" step="0.1" id="cf-fat" value="${food?.fat_g_per_100g ?? ''}" required /></label>
          <label class="field">炭水化物(g/100g) <input type="number" step="0.1" id="cf-carb" value="${food?.carb_g_per_100g ?? ''}" required /></label>
        </div>
        <button type="submit">保存</button>
        <button type="button" id="cancel-custom-food-btn">キャンセル</button>
        <p id="custom-food-status"></p>
      </form>
    `;

    wrapEl.querySelector('#cancel-custom-food-btn')!.addEventListener('click', () => {
      editingId = null;
      wrapEl.innerHTML = '';
    });

    wrapEl.querySelector<HTMLFormElement>('#custom-food-form')!.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const statusEl = wrapEl.querySelector<HTMLParagraphElement>('#custom-food-status')!;
      const name = wrapEl.querySelector<HTMLInputElement>('#cf-name')!.value;
      const kcal = wrapEl.querySelector<HTMLInputElement>('#cf-kcal')!.value;
      const protein = wrapEl.querySelector<HTMLInputElement>('#cf-protein')!.value;
      const fat = wrapEl.querySelector<HTMLInputElement>('#cf-fat')!.value;
      const carb = wrapEl.querySelector<HTMLInputElement>('#cf-carb')!.value;
      statusEl.textContent = '保存中...';
      try {
        if (editingId === -1) {
          await addCustomFood(name, kcal, protein, fat, carb);
        } else {
          await editCustomFood(editingId!, name, kcal, protein, fat, carb);
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
