import { renderCustomFoods } from './customFoods';
import { renderMealLog } from './mealLog';
import { renderNutritionSummary } from './nutritionSummary';
import { renderRecipes } from './recipes';

// design.md §3「食事タブ」対応。BMI/TDEE/目標のサマリー・食事ログ・レシピ管理・
// 独自食材管理をまとめて1つのタブにする(管理表タブの構成にならい、セクションを縦に並べる)。
export function renderNutrition(container: HTMLElement): void {
  container.innerHTML = `
    <h2>栄養サマリー・目標</h2>
    <div id="nutrition-summary"><p>読み込み中...</p></div>
    <h2>食事ログ</h2>
    <div id="meal-log"><p>読み込み中...</p></div>
    <h2>レシピ管理</h2>
    <div id="recipes"><p>読み込み中...</p></div>
    <h2>独自食材管理</h2>
    <div id="custom-foods"><p>読み込み中...</p></div>
  `;

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
