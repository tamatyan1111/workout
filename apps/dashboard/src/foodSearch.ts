import { searchFoods } from './api';
import type { CartItem, FoodSearchResult } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 文部科学省「日本食品標準成分表」の食品群18区分(固定・変動しない、sql/schema.sqlのfoodsテーブル参照)
const FOOD_GROUPS: { code: string; name: string }[] = [
  { code: '01', name: '穀類' },
  { code: '02', name: 'いも及びでん粉類' },
  { code: '03', name: '砂糖及び甘味類' },
  { code: '04', name: '豆類' },
  { code: '05', name: '種実類' },
  { code: '06', name: '野菜類' },
  { code: '07', name: '果実類' },
  { code: '08', name: 'きのこ類' },
  { code: '09', name: '藻類' },
  { code: '10', name: '魚介類' },
  { code: '11', name: '肉類' },
  { code: '12', name: '卵類' },
  { code: '13', name: '乳類' },
  { code: '14', name: '油脂類' },
  { code: '15', name: '菓子類' },
  { code: '16', name: 'し好飲料類' },
  { code: '17', name: '調味料及び香辛料類' },
  { code: '18', name: '調理済み流通食品類' },
];

// mealLog.ts・recipes.tsの両方から使う、食品検索→グラム数指定→カートに追加するウィジェット。
// onAddで追加を通知する(カート自体の保持・表示は呼び出し元の責務)。
export function renderFoodSearch(container: HTMLElement, onAdd: (item: CartItem) => void): void {
  container.innerHTML = `
    <form id="food-search-form">
      <label>食品グループ
        <select id="food-search-group">
          <option value="">すべて</option>
          ${FOOD_GROUPS.map((g) => `<option value="${g.code}">${escapeHtml(g.name)}</option>`).join('')}
        </select>
      </label>
      <label>食品名で検索 <input type="text" id="food-search-q" placeholder="例: 白米、にわとり むね" /></label>
      <button type="submit">検索</button>
    </form>
    <p id="food-search-status"></p>
    <div id="food-search-results"></div>
  `;

  const statusEl = container.querySelector<HTMLParagraphElement>('#food-search-status')!;
  const resultsEl = container.querySelector<HTMLElement>('#food-search-results')!;

  container.querySelector<HTMLFormElement>('#food-search-form')!.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = container.querySelector<HTMLInputElement>('#food-search-q')!.value.trim();
    const groupCode = container.querySelector<HTMLSelectElement>('#food-search-group')!.value;
    if (!q && !groupCode) {
      statusEl.textContent = '検索語か食品グループを指定してください';
      return;
    }
    statusEl.textContent = '検索中...';
    try {
      const foods = await searchFoods(q, groupCode || undefined);
      statusEl.textContent = foods.length === 0 ? '該当する食品が見つかりませんでした' : '';
      renderResults(foods);
    } catch (err) {
      statusEl.textContent = `検索に失敗しました: ${errorMessage(err)}`;
    }
  });

  function renderResults(foods: FoodSearchResult[]): void {
    resultsEl.innerHTML = foods
      .map(
        (f, i) => `
      <div class="food-result-row" data-index="${i}">
        <div class="food-result-info">
          <span class="food-result-name">${escapeHtml(f.name)}</span>
          <span class="food-result-detail">
            ${f.kcal_per_100g}kcal / P${f.protein_g_per_100g ?? '—'}g F${f.fat_g_per_100g ?? '—'}g C${f.carb_g_per_100g ?? '—'}g (100gあたり)
            ${f.source === 'custom' ? '<span class="badge">独自食材</span>' : ''}
          </span>
        </div>
        <input type="number" class="food-result-qty" value="100" min="1" step="1" />
        <button type="button" class="add-food-btn link-button">追加</button>
      </div>
    `
      )
      .join('');

    resultsEl.querySelectorAll<HTMLButtonElement>('.add-food-btn').forEach((btn) => {
      const row = btn.closest<HTMLElement>('.food-result-row')!;
      const food = foods[Number(row.dataset.index)];
      btn.addEventListener('click', () => {
        const qty = Number(row.querySelector<HTMLInputElement>('.food-result-qty')!.value);
        if (!qty || qty <= 0) return;
        onAdd({
          ref: { source: food.source, id: food.id },
          name: food.name,
          quantityG: qty,
          kcalPer100g: food.kcal_per_100g,
          proteinPer100g: food.protein_g_per_100g ?? 0,
          fatPer100g: food.fat_g_per_100g ?? 0,
          carbPer100g: food.carb_g_per_100g ?? 0,
        });
      });
    });
  }
}
