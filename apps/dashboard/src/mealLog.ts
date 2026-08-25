import {
  addMeal,
  addMealFavorite,
  addMealFromRecipe,
  addMealItemFromRecipe,
  deleteMealFavorite,
  getEatingOutMeals,
  getMealFavorites,
  getRecipes,
  uploadMealPhoto,
} from './api';
import { todayStr } from './date';
import { renderFoodSearch } from './foodSearch';
import type { CartItem, EatingOutMeal, MealFavorite, MealItem, MealType, Recipe } from './types';
import { escapeHtml } from 'shared';

// 外食メニューは「材料が分からない、1食分の実値のみ」なので、quantity_gは常にこの固定値
// (100)で送る。100gあたり×quantity_g/100という既存の計算式をそのまま使い回すための内部的な
// 取り決めで、ユーザーには「1食分」としてのみ見せる(php/private/queries.phpのresolve_food_source参照)。
const EATING_OUT_FIXED_QUANTITY_G = 100;

// php/private/queries.phpのeating_out_meal_display_name()と同じ組み立て方(design.md §2.20)
function eatingOutDisplayName(meal: EatingOutMeal): string {
  return meal.shop_name ? `${meal.shop_name} - ${meal.name}` : meal.name;
}

type CartEntry = { kind: 'item'; item: CartItem } | { kind: 'recipe'; recipeId: number; recipeName: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

export function itemKcal(item: MealItem): number {
  return (item.kcal_per_100g * item.quantity_g) / 100;
}

// design.md §2.15「meals/meal_items」・§3「食事タブ」対応。
// 食事区分を選び、食品・レシピを検索して選択リストに追加していき、まとめて保存する
// (グラフ・直近の履歴は運動タブと同じ構成にするため、mealGraph.ts・recentMeals.tsに分離)。
export function renderMealLog(container: HTMLElement, onSaved: () => void): void {
  let recipes: Recipe[] = [];
  let eatingOutMeals: EatingOutMeal[] = [];
  let favorites: MealFavorite[] = [];
  let cart: CartEntry[] = [];
  let loggedDate = todayStr();
  let mealType: MealType = 'breakfast';
  let photoFile: File | null = null;
  let photoPreviewUrl: string | null = null;

  container.innerHTML = '<p>読み込み中...</p>';

  void Promise.all([getRecipes(), getEatingOutMeals(), getMealFavorites()])
    .then(([r, e, f]) => {
      recipes = r;
      eatingOutMeals = e;
      favorites = f;
      draw();
    })
    .catch((err) => {
      container.innerHTML = `<p class="error">読み込みに失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    });

  // 食品検索の「☆よく使うに登録」から呼ばれる。登録後は一覧を再取得してチップを更新する
  async function saveFavorite(ref: { source: 'master' | 'custom'; id: number }, quantityG: number): Promise<void> {
    const statusEl = container.querySelector<HTMLParagraphElement>('#food-search-status');
    try {
      await addMealFavorite(ref, quantityG);
      favorites = await getMealFavorites();
      draw();
    } catch (err) {
      if (statusEl) statusEl.textContent = `よく使う内容への登録に失敗しました: ${errorMessage(err)}`;
    }
  }

  function draw(): void {
    container.innerHTML = `
      <form id="meal-header-form">
        <div class="field-row">
          <label class="field">日付 <input type="date" id="meal-date" value="${loggedDate}" /></label>
          <label class="field">区分
            <select id="meal-type-select">
              ${(Object.keys(MEAL_TYPE_LABELS) as MealType[])
                .map((t) => `<option value="${t}" ${t === mealType ? 'selected' : ''}>${escapeHtml(MEAL_TYPE_LABELS[t])}</option>`)
                .join('')}
            </select>
          </label>
          <div class="field" id="meal-photo-field">${photoFieldInnerHtml()}</div>
        </div>
      </form>

      ${
        favorites.length > 0
          ? `
        <h4>よく使う</h4>
        <div class="favorite-chips">
          ${favorites
            .map(
              (f) => `
            <span class="favorite-chip">
              <button type="button" class="favorite-chip-add" data-id="${f.id}">${escapeHtml(f.name)} ${f.quantity_g}g</button>
              <button type="button" class="favorite-chip-remove" data-id="${f.id}" aria-label="よく使う内容から削除" title="よく使う内容から削除">×</button>
            </span>
          `
            )
            .join('')}
        </div>
      `
          : ''
      }

      <h4>食品を検索して追加</h4>
      <div id="meal-food-search"></div>

      ${
        recipes.length > 0
          ? `
        <h4>レシピから追加</h4>
        <div class="recipe-quick-add">
          <select id="meal-recipe-select">
            ${recipes.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
          </select>
          <button type="button" id="add-recipe-to-cart-btn" class="link-button">追加</button>
        </div>
      `
          : ''
      }

      ${
        eatingOutMeals.length > 0
          ? `
        <h4>外食から追加</h4>
        <div class="recipe-quick-add">
          <select id="meal-eating-out-select">
            ${eatingOutMeals.map((m) => `<option value="${m.id}">${escapeHtml(eatingOutDisplayName(m))}</option>`).join('')}
          </select>
          <button type="button" id="add-eating-out-to-cart-btn" class="link-button">追加</button>
        </div>
      `
          : ''
      }

      <h4>選択リスト</h4>
      <ul id="meal-cart-list"></ul>
      <p id="meal-cart-total"></p>
      <button type="button" id="save-meal-btn">この内容で保存</button>
      <p id="meal-save-status"></p>
    `;

    container.querySelector<HTMLInputElement>('#meal-date')!.addEventListener('change', (ev) => {
      loggedDate = (ev.target as HTMLInputElement).value;
    });
    container.querySelector<HTMLSelectElement>('#meal-type-select')!.addEventListener('change', (ev) => {
      mealType = (ev.target as HTMLSelectElement).value as MealType;
    });

    renderFoodSearch(
      container.querySelector<HTMLElement>('#meal-food-search')!,
      (item) => {
        cart.push({ kind: 'item', item });
        renderCart();
      },
      (ref, quantityG) => void saveFavorite(ref, quantityG)
    );

    if (favorites.length > 0) {
      container.querySelectorAll<HTMLButtonElement>('.favorite-chip-add').forEach((btn) => {
        const favorite = favorites.find((f) => f.id === Number(btn.dataset.id));
        if (!favorite) return;
        btn.addEventListener('click', () => {
          cart.push({
            kind: 'item',
            item: {
              ref: { source: favorite.source, id: favorite.food_id },
              name: favorite.name,
              quantityG: favorite.quantity_g,
              kcalPer100g: favorite.kcal_per_100g,
              proteinPer100g: favorite.protein_g_per_100g,
              fatPer100g: favorite.fat_g_per_100g,
              carbPer100g: favorite.carb_g_per_100g,
            },
          });
          renderCart();
        });
      });
      container.querySelectorAll<HTMLButtonElement>('.favorite-chip-remove').forEach((btn) => {
        const id = Number(btn.dataset.id);
        btn.addEventListener('click', async () => {
          try {
            await deleteMealFavorite(id);
            favorites = favorites.filter((f) => f.id !== id);
            draw();
          } catch (err) {
            alert(`削除に失敗しました: ${errorMessage(err)}`);
          }
        });
      });
    }

    if (recipes.length > 0) {
      container.querySelector('#add-recipe-to-cart-btn')!.addEventListener('click', () => {
        const select = container.querySelector<HTMLSelectElement>('#meal-recipe-select')!;
        const recipe = recipes.find((r) => r.id === Number(select.value));
        if (!recipe) return;
        cart.push({ kind: 'recipe', recipeId: recipe.id, recipeName: recipe.name });
        renderCart();
      });
    }

    if (eatingOutMeals.length > 0) {
      container.querySelector('#add-eating-out-to-cart-btn')!.addEventListener('click', () => {
        const select = container.querySelector<HTMLSelectElement>('#meal-eating-out-select')!;
        const meal = eatingOutMeals.find((m) => m.id === Number(select.value));
        if (!meal) return;
        cart.push({
          kind: 'item',
          item: {
            ref: { source: 'eating_out', id: meal.id },
            name: eatingOutDisplayName(meal),
            quantityG: EATING_OUT_FIXED_QUANTITY_G,
            kcalPer100g: meal.kcal,
            proteinPer100g: meal.protein_g,
            fatPer100g: meal.fat_g,
            carbPer100g: meal.carb_g,
          },
        });
        renderCart();
      });
    }

    renderCart();
    wirePhotoField();

    container.querySelector('#save-meal-btn')!.addEventListener('click', saveCart);
  }

  function photoFieldInnerHtml(): string {
    return `
      <span>&nbsp;</span>
      ${
        photoFile
          ? `
        <div class="photo-draft-preview">
          <img class="photo-draft-thumb" src="${photoPreviewUrl}" alt="選択した写真のプレビュー" />
          <label class="link-button upload-photo-label">変更<input type="file" id="meal-photo-input" accept="image/jpeg,image/png,image/webp" hidden /></label>
          <button type="button" id="remove-photo-btn" class="remove-photo-btn">取り消す</button>
        </div>
      `
          : `
        <label class="link-button upload-photo-label">写真を追加<input type="file" id="meal-photo-input" accept="image/jpeg,image/png,image/webp" hidden /></label>
      `
      }
    `;
  }

  function wirePhotoField(): void {
    container.querySelector<HTMLInputElement>('#meal-photo-input')!.addEventListener('change', (ev) => {
      setPhotoFile((ev.target as HTMLInputElement).files?.[0] ?? null);
    });
    container.querySelector('#remove-photo-btn')?.addEventListener('click', () => {
      setPhotoFile(null);
    });
  }

  // 選択中の写真を差し替える(取り消す場合はnullを渡す)。プレビュー用のobject URLは
  // 差し替え/取り消しのたびに古いものを解放する
  function setPhotoFile(file: File | null): void {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      photoPreviewUrl = null;
    }
    photoFile = file;
    photoPreviewUrl = file ? URL.createObjectURL(file) : null;
    container.querySelector<HTMLElement>('#meal-photo-field')!.innerHTML = photoFieldInnerHtml();
    wirePhotoField();
  }

  function renderCart(): void {
    const listEl = container.querySelector<HTMLElement>('#meal-cart-list')!;
    const totalEl = container.querySelector<HTMLElement>('#meal-cart-total')!;
    if (cart.length === 0) {
      listEl.innerHTML = '<li>選択リストは空です</li>';
      totalEl.textContent = '';
      return;
    }
    listEl.innerHTML = cart
      .map((entry, i) =>
        entry.kind === 'item'
          ? `<li>${escapeHtml(entry.item.name)} ${entry.item.ref.source === 'eating_out' ? '1食分' : `${entry.item.quantityG}g`} (${Math.round((entry.item.kcalPer100g * entry.item.quantityG) / 100)}kcal, P${((entry.item.proteinPer100g * entry.item.quantityG) / 100).toFixed(1)}g / F${((entry.item.fatPer100g * entry.item.quantityG) / 100).toFixed(1)}g / C${((entry.item.carbPer100g * entry.item.quantityG) / 100).toFixed(1)}g) <button type="button" class="remove-cart-entry" data-index="${i}">削除</button></li>`
          : `<li>${escapeHtml(entry.recipeName)}(レシピ) <button type="button" class="remove-cart-entry" data-index="${i}">削除</button></li>`
      )
      .join('');
    listEl.querySelectorAll<HTMLButtonElement>('.remove-cart-entry').forEach((btn) => {
      btn.addEventListener('click', () => {
        cart.splice(Number(btn.dataset.index), 1);
        renderCart();
      });
    });

    const itemEntries = cart.filter((e): e is { kind: 'item'; item: CartItem } => e.kind === 'item').map((e) => e.item);
    if (itemEntries.length > 0) {
      const totals = itemEntries.reduce(
        (sum, item) => ({
          kcal: sum.kcal + (item.kcalPer100g * item.quantityG) / 100,
          carb: sum.carb + (item.carbPer100g * item.quantityG) / 100,
          protein: sum.protein + (item.proteinPer100g * item.quantityG) / 100,
          fat: sum.fat + (item.fatPer100g * item.quantityG) / 100,
        }),
        { kcal: 0, carb: 0, protein: 0, fat: 0 }
      );
      totalEl.textContent = `合計: ${Math.round(totals.kcal)}kcal (P${totals.protein.toFixed(1)}g / F${totals.fat.toFixed(1)}g / C${totals.carb.toFixed(1)}g)`;
    } else {
      totalEl.textContent = '';
    }
  }

  async function saveCart(): Promise<void> {
    const statusEl = container.querySelector<HTMLParagraphElement>('#meal-save-status')!;
    if (cart.length === 0) {
      statusEl.textContent = '選択リストが空です';
      return;
    }
    statusEl.textContent = '保存中...';
    try {
      const itemEntries = cart.filter((e): e is { kind: 'item'; item: CartItem } => e.kind === 'item').map((e) => e.item);
      const recipeEntries = cart.filter((e): e is { kind: 'recipe'; recipeId: number; recipeName: string } => e.kind === 'recipe');

      let mealId: number;
      if (itemEntries.length > 0) {
        mealId = (await addMeal(loggedDate, mealType, itemEntries)).id;
      } else {
        const first = recipeEntries.shift()!;
        mealId = (await addMealFromRecipe(loggedDate, mealType, first.recipeId)).id;
      }
      for (const r of recipeEntries) {
        await addMealItemFromRecipe(mealId, r.recipeId);
      }
      if (photoFile) {
        await uploadMealPhoto(mealId, photoFile);
      }

      cart = [];
      renderCart();
      setPhotoFile(null);
      statusEl.textContent = '保存しました';
      onSaved();
    } catch (err) {
      statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
    }
  }
}
