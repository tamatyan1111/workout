import { renderCustomFoods } from './customFoods';
import { renderEatingOut } from './eatingOut';
import { renderMealGraph } from './mealGraph';
import { renderMealLog } from './mealLog';
import { renderNutritionSummary } from './nutritionSummary';
import { renderRecentMeals } from './recentMeals';
import { renderRecipes } from './recipes';
import { initScreenNav } from './screenNav';

// design.md §3「食事タブ」対応。ランディング(サマリー・食事を記録する・直近の履歴)+
// 詳細画面(グラフ確認・レシピ管理・食材管理・外食管理)の構成。運動タブと同じ画面構成・名称に
// 統一するため、実績グラフと直近の履歴をmealLog.tsから分離してある(2026-08-16)。
export function renderNutrition(container: HTMLElement): void {
  container.innerHTML = `
    <div data-screen="landing" class="stack">
      <div class="card">
        <div id="nutrition-summary"><p>読み込み中...</p></div>
      </div>
      <div class="card">
        <h2>食事を記録する</h2>
        <div id="meal-log"><p>読み込み中...</p></div>
      </div>
      <div class="card">
        <h2>直近の履歴</h2>
        <div id="recent-meals"></div>
      </div>
      <div class="link-list">
        <button type="button" class="link-card" data-goto="graph">
          <span>
            <span class="link-title">グラフ確認</span>
            <span class="link-desc">摂取カロリー・PFCの推移</span>
          </span>
          <span class="chev">→</span>
        </button>
        <button type="button" class="link-card" data-goto="recipes">
          <span>
            <span class="link-title">レシピ管理</span>
            <span class="link-desc">よく作る料理をテンプレートとして保存・共有</span>
          </span>
          <span class="chev">→</span>
        </button>
        <button type="button" class="link-card" data-goto="custom-foods">
          <span>
            <span class="link-title">食材管理</span>
            <span class="link-desc">成分表にない食品を自分で登録</span>
          </span>
          <span class="chev">→</span>
        </button>
        <button type="button" class="link-card" data-goto="eating-out">
          <span>
            <span class="link-title">外食管理</span>
            <span class="link-desc">材料は分からないが名前とカロリーが分かる食事を登録</span>
          </span>
          <span class="chev">→</span>
        </button>
      </div>
    </div>
    <div data-screen="graph" hidden>
      <button type="button" class="link-button" data-goto="landing">← 食事に戻る</button>
      <div class="card">
        <h2>グラフ確認</h2>
        <div id="meal-graph"><p>読み込み中...</p></div>
      </div>
    </div>
    <div data-screen="recipes" hidden>
      <button type="button" class="link-button" data-goto="landing">← 食事に戻る</button>
      <div class="card">
        <h2>レシピ管理</h2>
        <div id="recipes"><p>読み込み中...</p></div>
      </div>
    </div>
    <div data-screen="custom-foods" hidden>
      <button type="button" class="link-button" data-goto="landing">← 食事に戻る</button>
      <div class="card">
        <h2>食材管理</h2>
        <div id="custom-foods"><p>読み込み中...</p></div>
      </div>
    </div>
    <div data-screen="eating-out" hidden>
      <button type="button" class="link-button" data-goto="landing">← 食事に戻る</button>
      <div class="card">
        <h2>外食管理</h2>
        <div id="eating-out"><p>読み込み中...</p></div>
      </div>
    </div>
  `;

  initScreenNav(container, 'landing');

  const summaryEl = container.querySelector<HTMLElement>('#nutrition-summary')!;
  const mealLogEl = container.querySelector<HTMLElement>('#meal-log')!;
  const recentMealsEl = container.querySelector<HTMLElement>('#recent-meals')!;
  const mealGraphEl = container.querySelector<HTMLElement>('#meal-graph')!;
  const recipesEl = container.querySelector<HTMLElement>('#recipes')!;
  const customFoodsEl = container.querySelector<HTMLElement>('#custom-foods')!;
  const eatingOutEl = container.querySelector<HTMLElement>('#eating-out')!;

  function refreshSummary(): void {
    renderNutritionSummary(summaryEl);
  }

  function refreshMealLog(): void {
    renderMealLog(mealLogEl, onMealSaved);
  }

  function refreshGraph(): void {
    renderMealGraph(mealGraphEl);
  }

  // 記録の保存・直近の履歴側での削除/分量編集は、いずれもグラフに反映したいため両方呼ぶ
  function onMealSaved(): void {
    refreshSummary();
    void renderRecentMeals(recentMealsEl, refreshGraph);
    refreshGraph();
  }

  // レシピ・独自食材の作成/編集/削除は、食事ログの「レシピから追加」欄が参照する一覧にも
  // 影響するため、記録フォームごと再描画して最新化する(その代わり選択リストの中身は失われる)。
  // 過去の記録はmeal_itemsのスナップショットのため、直近の履歴・グラフへの影響はない。
  function onFoodDataChanged(): void {
    refreshSummary();
    refreshMealLog();
  }

  refreshSummary();
  refreshMealLog();
  void renderRecentMeals(recentMealsEl, refreshGraph);
  refreshGraph();
  renderRecipes(recipesEl, onFoodDataChanged);
  renderCustomFoods(customFoodsEl, onFoodDataChanged);
  renderEatingOut(eatingOutEl, onFoodDataChanged);
}
