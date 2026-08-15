import { renderCustomFoods } from './customFoods';
import { renderMealLog } from './mealLog';
import { renderNutritionSummary } from './nutritionSummary';
import { renderRecipes } from './recipes';
import { initScreenNav } from './screenNav';

// design.md §3「食事タブ」対応。ランディング(サマリー・食事ログ)+詳細画面
// (レシピ管理・独自食材管理)の構成(UI再設計フェーズ2でランディング/詳細分割)。
export function renderNutrition(container: HTMLElement): void {
  container.innerHTML = `
    <div data-screen="landing">
      <h2>サマリー</h2>
      <div id="nutrition-summary"><p>読み込み中...</p></div>
      <h2>食事ログ</h2>
      <div id="meal-log"><p>読み込み中...</p></div>
      <div class="link-list">
        <button type="button" class="link-card" data-goto="recipes">
          <span>
            <span class="link-title">レシピ管理</span>
            <span class="link-desc">よく作る料理をテンプレートとして保存・共有</span>
          </span>
          <span class="chev">→</span>
        </button>
        <button type="button" class="link-card" data-goto="custom-foods">
          <span>
            <span class="link-title">独自食材を管理する</span>
            <span class="link-desc">成分表にない食品を自分で登録</span>
          </span>
          <span class="chev">→</span>
        </button>
      </div>
    </div>
    <div data-screen="recipes" hidden>
      <button type="button" class="link-button" data-goto="landing">← 食事に戻る</button>
      <h2>レシピ管理</h2>
      <div id="recipes"><p>読み込み中...</p></div>
    </div>
    <div data-screen="custom-foods" hidden>
      <button type="button" class="link-button" data-goto="landing">← 食事に戻る</button>
      <h2>独自食材管理</h2>
      <div id="custom-foods"><p>読み込み中...</p></div>
    </div>
  `;

  initScreenNav(container, 'landing');

  const summaryEl = container.querySelector<HTMLElement>('#nutrition-summary')!;
  const mealLogEl = container.querySelector<HTMLElement>('#meal-log')!;
  const recipesEl = container.querySelector<HTMLElement>('#recipes')!;
  const customFoodsEl = container.querySelector<HTMLElement>('#custom-foods')!;

  function refreshSummary(): void {
    renderNutritionSummary(summaryEl, refreshSummary);
  }

  // レシピ・独自食材の作成/編集/削除は、食事ログの「レシピから追加」欄が参照する一覧にも
  // 影響するため、食事ログごと再描画して最新化する(その代わりカート中身は失われる。
  // 食事ログ自体の保存/削除(refreshMealLogを介さない)ではカートを保持したいので、
  // 食事ログ自身のonChangedにはrefreshSummaryだけを渡す)
  function refreshMealLog(): void {
    renderMealLog(mealLogEl, refreshSummary);
  }

  function onFoodDataChanged(): void {
    refreshSummary();
    refreshMealLog();
  }

  refreshSummary();
  refreshMealLog();
  renderRecipes(recipesEl, onFoodDataChanged);
  renderCustomFoods(customFoodsEl, onFoodDataChanged);
}
