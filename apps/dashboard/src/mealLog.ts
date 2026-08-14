import { Chart, registerables } from 'chart.js';
import {
  addMeal,
  addMealFromRecipe,
  addMealItemFromRecipe,
  deleteMeal,
  deleteMealItem,
  deleteMealItemGroup,
  getMeals,
  getNutritionSummary,
  getRecipes,
} from './api';
import { todayStr } from './date';
import { renderFoodSearch } from './foodSearch';
import { periodRange } from './graph';
import type { CartItem, Meal, MealItem, MealType, NutritionSummary, Recipe } from './types';
import { escapeHtml } from 'shared';

Chart.register(...registerables);

type Period = '30d' | '3mo' | 'all';

type CartEntry = { kind: 'item'; item: CartItem } | { kind: 'recipe'; recipeId: number; recipeName: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

export function itemKcal(item: MealItem): number {
  return (item.kcal_per_100g * item.quantity_g) / 100;
}

// design.md §2.15「meals/meal_items」・§3「食事タブ」対応。
// 食事区分を選び、食品・レシピを検索してカートに追加していき、まとめて保存する。
export function renderMealLog(container: HTMLElement, onChanged: () => void): void {
  let recipes: Recipe[] = [];
  let cart: CartEntry[] = [];
  let loggedDate = todayStr();
  let mealType: MealType = 'breakfast';
  let currentPeriod: Period = '30d';
  let meals: Meal[] = [];
  let summary: NutritionSummary | null = null;
  let calorieChart: Chart | null = null;
  let pfcChart: Chart | null = null;

  container.innerHTML = '<p>読み込み中...</p>';

  void Promise.all([getRecipes(), getNutritionSummary()])
    .then(([r, s]) => {
      recipes = r;
      summary = s;
      draw();
    })
    .catch((err) => {
      container.innerHTML = `<p class="error">読み込みに失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    });

  function draw(): void {
    container.innerHTML = `
      <form id="meal-header-form">
        <label>日付 <input type="date" id="meal-date" value="${loggedDate}" /></label>
        <label>区分
          <select id="meal-type-select">
            ${(Object.keys(MEAL_TYPE_LABELS) as MealType[])
              .map((t) => `<option value="${t}" ${t === mealType ? 'selected' : ''}>${escapeHtml(MEAL_TYPE_LABELS[t])}</option>`)
              .join('')}
          </select>
        </label>
      </form>

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
          <button type="button" id="add-recipe-to-cart-btn">追加</button>
        </div>
      `
          : ''
      }

      <h4>カート</h4>
      <ul id="meal-cart-list"></ul>
      <button type="button" id="save-meal-btn">この内容で保存</button>
      <p id="meal-save-status"></p>

      <h3>実績</h3>
      <div class="period-toggle" role="group">
        <button type="button" data-period="30d" class="active">直近30日</button>
        <button type="button" data-period="3mo">直近3ヶ月</button>
        <button type="button" data-period="all">全期間</button>
      </div>
      <div class="chart-wrap"><canvas id="calorie-chart"></canvas></div>
      <div class="chart-wrap"><canvas id="pfc-chart"></canvas></div>

      <h3>最近の記録</h3>
      <div id="meal-list"><p>読み込み中...</p></div>
    `;

    container.querySelector<HTMLInputElement>('#meal-date')!.addEventListener('change', (ev) => {
      loggedDate = (ev.target as HTMLInputElement).value;
    });
    container.querySelector<HTMLSelectElement>('#meal-type-select')!.addEventListener('change', (ev) => {
      mealType = (ev.target as HTMLSelectElement).value as MealType;
    });

    renderFoodSearch(container.querySelector<HTMLElement>('#meal-food-search')!, (item) => {
      cart.push({ kind: 'item', item });
      renderCart();
    });

    if (recipes.length > 0) {
      container.querySelector('#add-recipe-to-cart-btn')!.addEventListener('click', () => {
        const select = container.querySelector<HTMLSelectElement>('#meal-recipe-select')!;
        const recipe = recipes.find((r) => r.id === Number(select.value));
        if (!recipe) return;
        cart.push({ kind: 'recipe', recipeId: recipe.id, recipeName: recipe.name });
        renderCart();
      });
    }

    renderCart();

    container.querySelector('#save-meal-btn')!.addEventListener('click', saveCart);

    container.querySelectorAll<HTMLButtonElement>('.period-toggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.period-toggle button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.dataset.period as Period;
        void refreshMeals();
      });
    });

    void refreshMeals();
  }

  function renderCart(): void {
    const listEl = container.querySelector<HTMLElement>('#meal-cart-list')!;
    if (cart.length === 0) {
      listEl.innerHTML = '<li>カートは空です</li>';
      return;
    }
    listEl.innerHTML = cart
      .map((entry, i) =>
        entry.kind === 'item'
          ? `<li>${escapeHtml(entry.item.name)} ${entry.item.quantityG}g (${Math.round((entry.item.kcalPer100g * entry.item.quantityG) / 100)}kcal) <button type="button" class="remove-cart-entry" data-index="${i}">削除</button></li>`
          : `<li>${escapeHtml(entry.recipeName)}(レシピ) <button type="button" class="remove-cart-entry" data-index="${i}">削除</button></li>`
      )
      .join('');
    listEl.querySelectorAll<HTMLButtonElement>('.remove-cart-entry').forEach((btn) => {
      btn.addEventListener('click', () => {
        cart.splice(Number(btn.dataset.index), 1);
        renderCart();
      });
    });
  }

  async function saveCart(): Promise<void> {
    const statusEl = container.querySelector<HTMLParagraphElement>('#meal-save-status')!;
    if (cart.length === 0) {
      statusEl.textContent = 'カートが空です';
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

      cart = [];
      statusEl.textContent = '保存しました';
      renderCart();
      await refreshMeals();
      onChanged();
    } catch (err) {
      statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
    }
  }

  async function refreshMeals(): Promise<void> {
    const listEl = container.querySelector<HTMLElement>('#meal-list');
    if (!listEl) return;
    const { from, to } = periodRange(currentPeriod);
    try {
      meals = await getMeals(from, to);
    } catch (err) {
      listEl.innerHTML = `<p class="error">食事ログの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
      return;
    }
    renderCharts();
    renderMealList(listEl);
  }

  function renderCharts(): void {
    const calorieCanvas = container.querySelector<HTMLCanvasElement>('#calorie-chart');
    const pfcCanvas = container.querySelector<HTMLCanvasElement>('#pfc-chart');
    if (!calorieCanvas || !pfcCanvas) return;

    const byDate = new Map<string, MealItem[]>();
    meals.forEach((m) => {
      const items = byDate.get(m.logged_date) ?? [];
      byDate.set(m.logged_date, [...items, ...m.items]);
    });
    const labels = [...byDate.keys()].sort();
    const kcalData = labels.map((d) => Math.round(byDate.get(d)!.reduce((sum, i) => sum + itemKcal(i), 0)));
    const proteinData = labels.map((d) => byDate.get(d)!.reduce((sum, i) => sum + (i.protein_g_per_100g * i.quantity_g) / 100, 0));
    const fatData = labels.map((d) => byDate.get(d)!.reduce((sum, i) => sum + (i.fat_g_per_100g * i.quantity_g) / 100, 0));
    const carbData = labels.map((d) => byDate.get(d)!.reduce((sum, i) => sum + (i.carb_g_per_100g * i.quantity_g) / 100, 0));

    const targetCalories = summary?.goal?.target_calories ?? null;

    calorieChart?.destroy();
    calorieChart = new Chart(calorieCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '摂取カロリー実績(kcal)', data: kcalData, borderColor: '#3b82f6' },
          ...(targetCalories !== null
            ? [
                {
                  label: '目標カロリー(kcal)',
                  data: labels.map(() => targetCalories),
                  borderColor: '#f59e0b',
                  borderDash: [6, 4],
                  // pointRadius 0だと、記録が1日分しかない(点が1つだけ)ときに線を描く2点目が無く、
                  // 目標ラインが完全に見えなくなってしまうため、小さな点を常に表示する
                  pointRadius: 2,
                },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: '摂取カロリーの推移' } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'kcal' } } },
      },
    });

    const targetPfc = summary?.goal?.pfc ?? null;

    pfcChart?.destroy();
    pfcChart = new Chart(pfcCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'タンパク質(g)', data: proteinData, borderColor: '#22c55e' },
          { label: '脂質(g)', data: fatData, borderColor: '#ef4444' },
          { label: '炭水化物(g)', data: carbData, borderColor: '#a855f7' },
          ...(targetPfc?.protein_g !== null && targetPfc?.protein_g !== undefined
            ? [{ label: '目標タンパク質(g)', data: labels.map(() => targetPfc.protein_g), borderColor: '#22c55e', borderDash: [6, 4], pointRadius: 2 }]
            : []),
        ],
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'PFC実績の推移' } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'g' } } },
      },
    });
  }

  function renderMealList(listEl: HTMLElement): void {
    if (meals.length === 0) {
      listEl.innerHTML = '<p>記録がありません</p>';
      return;
    }
    const sorted = [...meals].sort((a, b) => (a.logged_date < b.logged_date ? 1 : -1));
    listEl.innerHTML = sorted
      .map((m) => {
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
        const totalKcal = Math.round(m.items.reduce((sum, i) => sum + itemKcal(i), 0));

        return `
        <div class="meal-card" data-meal-id="${m.id}">
          <div class="meal-card-header">
            <strong>${escapeHtml(m.logged_date)} ${escapeHtml(MEAL_TYPE_LABELS[m.meal_type])}</strong>
            <span>${totalKcal}kcal</span>
            <button type="button" class="delete-meal-btn danger">記録ごと削除</button>
          </div>
          <ul class="meal-item-list">
            ${[...groups.entries()]
              .map(
                ([batchId, items]) => `
              <li class="meal-item-group" data-batch-id="${escapeHtml(batchId)}">
                <span>${escapeHtml(items[0].recipe_name ?? '')}(${items.map((i) => escapeHtml(i.food_name)).join('・')})</span>
                <button type="button" class="delete-group-btn">まとめて削除</button>
              </li>
            `
              )
              .join('')}
            ${ungrouped
              .map(
                (item) => `
              <li class="meal-item-single" data-item-id="${item.id}">
                <span>${escapeHtml(item.food_name)} ${item.quantity_g}g (${Math.round(itemKcal(item))}kcal)</span>
                <button type="button" class="delete-item-btn">削除</button>
              </li>
            `
              )
              .join('')}
          </ul>
        </div>
      `;
      })
      .join('');

    listEl.querySelectorAll<HTMLElement>('.meal-card').forEach((card) => {
      const mealId = Number(card.dataset.mealId);
      card.querySelector('.delete-meal-btn')!.addEventListener('click', async () => {
        if (!confirm('この食事記録をまとめて削除しますか?')) return;
        try {
          await deleteMeal(mealId);
          await refreshMeals();
          onChanged();
        } catch (err) {
          alert(`削除に失敗しました: ${errorMessage(err)}`);
        }
      });
      card.querySelectorAll<HTMLElement>('.meal-item-group').forEach((groupEl) => {
        groupEl.querySelector('.delete-group-btn')!.addEventListener('click', async () => {
          const batchId = groupEl.dataset.batchId!;
          try {
            await deleteMealItemGroup(batchId);
            await refreshMeals();
            onChanged();
          } catch (err) {
            alert(`削除に失敗しました: ${errorMessage(err)}`);
          }
        });
      });
      card.querySelectorAll<HTMLElement>('.meal-item-single').forEach((itemEl) => {
        itemEl.querySelector('.delete-item-btn')!.addEventListener('click', async () => {
          const itemId = Number(itemEl.dataset.itemId);
          try {
            await deleteMealItem(itemId);
            await refreshMeals();
            onChanged();
          } catch (err) {
            alert(`削除に失敗しました: ${errorMessage(err)}`);
          }
        });
      });
    });
  }
}
