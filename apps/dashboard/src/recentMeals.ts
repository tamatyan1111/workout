import {
  deleteMeal,
  deleteMealItem,
  deleteMealItemGroup,
  deleteMealPhoto,
  editMeal,
  editMealItem,
  getMeals,
  mealPhotoUrl,
  uploadMealPhoto,
} from './api';
import { itemKcal, MEAL_TYPE_LABELS } from './mealLog';
import { renderFoodSearch } from './foodSearch';
import type { Meal, MealItem, MealType } from './types';
import { escapeHtml } from 'shared';

// 運動タブの「直近の履歴」(DISPLAY_LIMIT、recentLogs.ts)と件数を揃える
// (2026-08-19、「同じ分だけ載せて」との要望を受けて3件から変更。単位はセット数と
// 食事カードの件数で異なるが、表示件数の目安として揃える)。
const RECENT_MEALS_LIMIT = 8;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 写真サムネイルのクリック時に、画面全体に原寸大表示するためのオーバーレイ(クリックで閉じる)
function openLightbox(src: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `<img src="${src}" alt="食事の写真(拡大)" />`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

type Macros = { kcal: number; carb: number; protein: number; fat: number };

function itemMacros(item: MealItem): Macros {
  return {
    kcal: itemKcal(item),
    carb: (item.carb_g_per_100g * item.quantity_g) / 100,
    protein: (item.protein_g_per_100g * item.quantity_g) / 100,
    fat: (item.fat_g_per_100g * item.quantity_g) / 100,
  };
}

function sumMacros(items: MealItem[]): Macros {
  return items.reduce(
    (sum, i) => {
      const m = itemMacros(i);
      return { kcal: sum.kcal + m.kcal, carb: sum.carb + m.carb, protein: sum.protein + m.protein, fat: sum.fat + m.fat };
    },
    { kcal: 0, carb: 0, protein: 0, fat: 0 }
  );
}

// design.md §3「食事タブ」対応。運動タブの「直近の履歴」と同じく、期間指定のグラフとは
// 独立して常に直近N件だけを表示する(2026-08-16、名称・カード構成を運動タブに統一)。
// 編集ボタンは食事ごとに1つ(運動タブと同じ考え方)。押すとその食事の食材が表形式で
// 編集可能になり、食材の追加もそこから行える。食材そのものの変更(食品の差し替え)は
// 行が長くなりすぎないよう、行ごとの「食材を変更」リンクで折りたたんでおく
// (2026-08-16、一覧を箇条書きから表に変更・PFCをグラム単位で追加)。
// onChanged: 摂取カロリー・PFCに影響する変更(追加・削除・分量編集)があった場合のみ呼ぶ
// (グラフ画面の再取得用。写真の追加/削除はカロリーに影響しないため呼ばない)。
export async function renderRecentMeals(container: HTMLElement, onChanged: () => void): Promise<void> {
  container.innerHTML = '<p>読み込み中...</p>';
  let meals: Meal[];
  try {
    meals = await getMeals(undefined, undefined, RECENT_MEALS_LIMIT);
  } catch (err) {
    container.innerHTML = `<p class="error">直近の履歴の取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    return;
  }

  if (meals.length === 0) {
    container.innerHTML = '<p>記録がありません</p>';
    return;
  }

  let editingMealId: number | null = null;
  let changingFoodItemId: number | null = null;
  // 中身(写真・食材一覧)は開くまで表示しない(2026-08-19、件数を増やした際に
  // 一覧が縦に長くなりすぎないようにするための要望)。カードごとに開閉を独立管理する。
  const openMealIds = new Set<number>();

  draw();

  function draw(): void {
    const sorted = [...meals].sort((a, b) => (a.logged_date < b.logged_date ? 1 : -1));
    container.innerHTML = sorted.map((m) => renderMealCard(m, openMealIds.has(m.id), editingMealId === m.id)).join('');

    container.querySelectorAll<HTMLElement>('.meal-card').forEach((card) => {
      const mealId = Number(card.dataset.mealId);
      const meal = meals.find((mm) => mm.id === mealId)!;

      card.querySelector('.toggle-open-meal-btn')!.addEventListener('click', () => {
        if (openMealIds.has(mealId)) {
          openMealIds.delete(mealId);
        } else {
          openMealIds.add(mealId);
        }
        draw();
      });

      card.querySelector('.toggle-edit-meal-btn')!.addEventListener('click', () => {
        editingMealId = editingMealId === mealId ? null : mealId;
        openMealIds.add(mealId);
        changingFoodItemId = null;
        draw();
      });

      card.querySelector('.delete-meal-btn')!.addEventListener('click', async () => {
        if (!confirm('この食事記録をまとめて削除しますか?')) return;
        try {
          await deleteMeal(mealId);
          onChanged();
          await renderRecentMeals(container, onChanged);
        } catch (err) {
          alert(`削除に失敗しました: ${errorMessage(err)}`);
        }
      });

      card.querySelector('.save-meal-header-btn')?.addEventListener('click', async () => {
        const statusEl = card.querySelector<HTMLParagraphElement>('.meal-header-status')!;
        const loggedDate = card.querySelector<HTMLInputElement>('.edit-meal-date')!.value;
        const mealType = card.querySelector<HTMLSelectElement>('.edit-meal-type')!.value as MealType;
        statusEl.textContent = '保存中...';
        try {
          await editMeal(mealId, loggedDate, mealType);
          onChanged();
          await renderRecentMeals(container, onChanged);
        } catch (err) {
          statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
        }
      });

      // 写真関連の要素はカードが開いているときしか描画されない
      const photoStatusEl = card.querySelector<HTMLParagraphElement>('.photo-status');
      card.querySelector<HTMLImageElement>('.meal-photo-thumb')?.addEventListener('click', () => {
        openLightbox(mealPhotoUrl(mealId));
      });
      card.querySelector<HTMLInputElement>('.upload-photo-input')?.addEventListener('change', async (ev) => {
        const file = (ev.target as HTMLInputElement).files?.[0];
        if (!file) return;
        if (photoStatusEl) photoStatusEl.textContent = 'アップロード中...';
        try {
          await uploadMealPhoto(mealId, file);
          await renderRecentMeals(container, onChanged);
        } catch (err) {
          if (photoStatusEl) photoStatusEl.textContent = `アップロードに失敗しました: ${errorMessage(err)}`;
        }
      });
      card.querySelector('.delete-photo-btn')?.addEventListener('click', async () => {
        if (!confirm('写真を削除しますか?')) return;
        try {
          await deleteMealPhoto(mealId);
          await renderRecentMeals(container, onChanged);
        } catch (err) {
          if (photoStatusEl) photoStatusEl.textContent = `削除に失敗しました: ${errorMessage(err)}`;
        }
      });

      card.querySelectorAll<HTMLElement>('.delete-group-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const batchId = btn.dataset.batchId!;
          try {
            await deleteMealItemGroup(batchId);
            onChanged();
            await renderRecentMeals(container, onChanged);
          } catch (err) {
            alert(`削除に失敗しました: ${errorMessage(err)}`);
          }
        });
      });

      card.querySelectorAll<HTMLElement>('.item-row').forEach((row) => {
        const itemId = Number(row.dataset.itemId);
        const item = meal.items.find((i) => i.id === itemId)!;

        row.querySelector('.delete-item-btn')?.addEventListener('click', async () => {
          try {
            await deleteMealItem(itemId);
            onChanged();
            await renderRecentMeals(container, onChanged);
          } catch (err) {
            alert(`削除に失敗しました: ${errorMessage(err)}`);
          }
        });
        row.querySelector('.save-item-qty-btn')?.addEventListener('click', async () => {
          const qty = row.querySelector<HTMLInputElement>('.edit-item-qty')!.value;
          const ref =
            item.master_food_id !== null
              ? { source: 'master' as const, id: item.master_food_id }
              : { source: 'custom' as const, id: item.custom_food_id! };
          try {
            await editMealItem(itemId, ref, qty);
            onChanged();
            await renderRecentMeals(container, onChanged);
          } catch (err) {
            alert(`保存に失敗しました: ${errorMessage(err)}`);
          }
        });
        row.querySelector('.toggle-change-food-btn')?.addEventListener('click', () => {
          changingFoodItemId = changingFoodItemId === itemId ? null : itemId;
          draw();
        });
      });

      const changeFoodSearchEl = card.querySelector<HTMLElement>('.change-food-search');
      if (changeFoodSearchEl && changingFoodItemId !== null) {
        const statusEl = card.querySelector<HTMLParagraphElement>('.edit-item-status')!;
        renderFoodSearch(changeFoodSearchEl, (newItem) => {
          void (async () => {
            statusEl.textContent = '保存中...';
            try {
              await editMealItem(changingFoodItemId!, newItem.ref, String(newItem.quantityG));
              onChanged();
              await renderRecentMeals(container, onChanged);
            } catch (err) {
              statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
            }
          })();
        });
      }
    });
  }

  function renderMealCard(m: Meal, open: boolean, editing: boolean): string {
    const groups = new Map<string, MealItem[]>();
    const ungrouped: MealItem[] = [];
    m.items.forEach((item) => {
      if (item.recipe_batch_id) {
        const g = groups.get(item.recipe_batch_id) ?? [];
        groups.set(item.recipe_batch_id, [...g, item]);
      } else {
        ungrouped.push(item);
      }
    });
    const totals = sumMacros(m.items);

    // 中身(写真・食材一覧)は開いているときだけ描画する(2026-08-19、件数を増やしたのに
    // 合わせて、一覧が縦に長くなりすぎないよう開閉式にした)。
    const body = !open
      ? ''
      : `
        <div class="meal-photo">
          ${m.photo_path ? `<img class="meal-photo-thumb" src="${mealPhotoUrl(m.id)}" alt="食事の写真" />` : ''}
          <label class="link-button upload-photo-label">
            ${m.photo_path ? '写真を差し替え' : '写真を追加'}
            <input type="file" class="upload-photo-input" accept="image/jpeg,image/png,image/webp" hidden />
          </label>
          ${m.photo_path ? '<button type="button" class="delete-photo-btn danger">写真を削除</button>' : ''}
          <p class="photo-status"></p>
        </div>
        <div class="table-scroll">
          <table class="meal-items-table">
            <colgroup>
              <col />
              <col class="col-qty" /><col class="col-macro" /><col class="col-macro" /><col class="col-macro" /><col class="col-macro" />
              <col class="col-item-actions" />
            </colgroup>
            <thead>
              <tr><th>食材名</th><th>重量(g)</th><th>カロリー</th><th>たんぱく質</th><th>脂質</th><th>炭水化物</th><th></th></tr>
            </thead>
            <tbody>
              ${[...groups.entries()]
                .map(([batchId, items]) => {
                  // まとめて削除は編集中だけ必要な操作のため、そのときだけ小さな行を出す。
                  // どの料理由来かは各食材の行自体に「レシピ名 - 食材名」で書くので、
                  // 見出し行にレシピ名を重ねて書く必要はない(2026-08-18、くくりが
                  // 分かりにくいとの指摘を受けて、食材の行ごとにレシピ名を明記する方式に変更)
                  const headerRow = editing
                    ? `
                <tr class="group-header-row" data-batch-id="${escapeHtml(batchId)}">
                  <td colspan="6"></td>
                  <td><button type="button" class="delete-group-btn danger" data-batch-id="${escapeHtml(batchId)}">まとめて削除</button></td>
                </tr>
              `
                    : '';
                  const itemRows = items.map((item) => renderItemRow(item, editing, changingFoodItemId === item.id)).join('');
                  return headerRow + itemRows;
                })
                .join('')}
              ${ungrouped.map((item) => renderItemRow(item, editing, changingFoodItemId === item.id)).join('')}
            </tbody>
          </table>
        </div>
      `;

    return `
      <div class="meal-card" data-meal-id="${m.id}">
        <div class="meal-card-header">
          <button type="button" class="toggle-open-meal-btn">
            <span class="meal-card-chevron">${open ? '▼' : '▶'}</span>
            ${escapeHtml(m.logged_date)} ${escapeHtml(MEAL_TYPE_LABELS[m.meal_type])}
          </button>
          <span>${Math.round(totals.kcal)}kcal (P${totals.protein.toFixed(1)}g / F${totals.fat.toFixed(1)}g / C${totals.carb.toFixed(1)}g)</span>
          <span>
            <button type="button" class="toggle-edit-meal-btn">${editing ? '閉じる' : '編集'}</button>
            <button type="button" class="delete-meal-btn danger">記録ごと削除</button>
          </span>
        </div>
        ${
          editing
            ? `
          <div class="field meal-edit-header">
            <input type="date" class="edit-meal-date" value="${escapeHtml(m.logged_date)}" />
            <select class="edit-meal-type">
              ${(Object.keys(MEAL_TYPE_LABELS) as MealType[])
                .map((t) => `<option value="${t}" ${t === m.meal_type ? 'selected' : ''}>${escapeHtml(MEAL_TYPE_LABELS[t])}</option>`)
                .join('')}
            </select>
            <button type="button" class="save-meal-header-btn">保存</button>
          </div>
          <p class="meal-header-status"></p>
        `
            : ''
        }
        ${body}
      </div>
    `;
  }

  function renderItemRow(item: MealItem, editing: boolean, changingFood: boolean): string {
    const m = itemMacros(item);
    const isEatingOut = item.eating_out_meal_id !== null;
    // レシピ経由・外食経由の食材は、由来(レシピ名/店名)を1行目に小さく、食材名/料理名を
    // 2行目に表示する(2026-08-19、食材名の後ろに添えるだけだと由来と食材名の境目が
    // 分かりにくいとの指摘を受けて、上下2段に変更。背景色によるまとまりの表現は維持する)
    const sourceLabel = item.recipe_name ?? item.eating_out_shop_name;
    const displayName = sourceLabel
      ? `<span class="item-source-label">${escapeHtml(sourceLabel)}</span><br />${escapeHtml(item.food_name)}`
      : escapeHtml(item.food_name);
    if (!editing) {
      return `
        <tr class="item-row" data-item-id="${item.id}">
          <td>${displayName}</td>
          <td>${isEatingOut ? '1食分' : `${item.quantity_g}g`}</td>
          <td>${Math.round(m.kcal)}kcal</td>
          <td>${m.protein.toFixed(1)}g</td>
          <td>${m.fat.toFixed(1)}g</td>
          <td>${m.carb.toFixed(1)}g</td>
          <td></td>
        </tr>
      `;
    }
    // 外食は「1食分固定」(レシピと同じ考え方)のため、分量編集・食材の差し替えUIは出さず削除のみ許可する
    if (isEatingOut) {
      return `
        <tr class="item-row" data-item-id="${item.id}">
          <td>${displayName}</td>
          <td>1食分</td>
          <td>${Math.round(m.kcal)}kcal</td>
          <td>${m.protein.toFixed(1)}g</td>
          <td>${m.fat.toFixed(1)}g</td>
          <td>${m.carb.toFixed(1)}g</td>
          <td class="item-actions">
            <button type="button" class="delete-item-btn danger">削除</button>
          </td>
        </tr>
      `;
    }
    const editRow = `
      <tr class="item-row" data-item-id="${item.id}">
        <td>${displayName}</td>
        <td><input type="number" class="edit-item-qty" value="${item.quantity_g}" min="1" step="1" /></td>
        <td>${Math.round(m.kcal)}kcal</td>
        <td>${m.protein.toFixed(1)}g</td>
        <td>${m.fat.toFixed(1)}g</td>
        <td>${m.carb.toFixed(1)}g</td>
        <td class="item-actions">
          <button type="button" class="save-item-qty-btn">保存</button>
          <button type="button" class="delete-item-btn danger">削除</button>
          <button type="button" class="toggle-change-food-btn link-button">${changingFood ? '閉じる' : '食材を変更'}</button>
        </td>
      </tr>
    `;
    const changeFoodRow = changingFood
      ? `
      <tr class="change-food-row">
        <td colspan="7">
          <p class="field-note">食材そのものを変更する場合は、下で検索して選び直してください</p>
          <div class="change-food-search"></div>
          <p class="edit-item-status"></p>
        </td>
      </tr>
    `
      : '';
    return editRow + changeFoodRow;
  }
}
