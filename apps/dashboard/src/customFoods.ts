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
      <p class="field-note">数値はすべて100gあたりの値です</p>
      <table class="custom-food-table">
        <thead><tr><th>食品名</th><th>カロリー</th><th>たんぱく質</th><th>脂質</th><th>炭水化物</th><th></th></tr></thead>
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
        <td>${f.kcal_per_100g}kcal</td>
        <td>${f.protein_g_per_100g}g</td>
        <td>${f.fat_g_per_100g}g</td>
        <td>${f.carb_g_per_100g}g</td>
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
          <label class="field">カロリー(kcal) <input type="number" step="0.1" id="cf-kcal" value="${food?.kcal_per_100g ?? ''}" required /></label>
        </div>
        <div class="field-row">
          <label class="field">たんぱく質(g) <input type="number" step="0.1" id="cf-protein" value="${food?.protein_g_per_100g ?? ''}" required /></label>
          <label class="field">脂質(g) <input type="number" step="0.1" id="cf-fat" value="${food?.fat_g_per_100g ?? ''}" required /></label>
          <label class="field">炭水化物(g) <input type="number" step="0.1" id="cf-carb" value="${food?.carb_g_per_100g ?? ''}" required /></label>
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

    // たんぱく質・脂質・炭水化物からカロリーを自動計算する(2026-08-26、手入力の手間を
    // 減らしたいとの要望を受けて追加)。カロリー欄を直接編集した後は、その値を尊重して
    // 自動上書きしない(商品表示のカロリーと計算値がわずかに違う場合に合わせられるように)
    const kcalInput = wrapEl.querySelector<HTMLInputElement>('#cf-kcal')!;
    let kcalManuallyEdited = false;
    kcalInput.addEventListener('input', () => {
      kcalManuallyEdited = true;
    });
    ['#cf-protein', '#cf-fat', '#cf-carb'].forEach((selector) => {
      wrapEl.querySelector<HTMLInputElement>(selector)!.addEventListener('input', () => {
        if (kcalManuallyEdited) return;
        const protein = Number(wrapEl.querySelector<HTMLInputElement>('#cf-protein')!.value) || 0;
        const fat = Number(wrapEl.querySelector<HTMLInputElement>('#cf-fat')!.value) || 0;
        const carb = Number(wrapEl.querySelector<HTMLInputElement>('#cf-carb')!.value) || 0;
        kcalInput.value = (protein * 4 + fat * 9 + carb * 4).toFixed(1);
      });
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
