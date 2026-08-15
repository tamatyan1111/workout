import { getMeals, getNutritionSummary, getRecentLogs } from './api';
import { todayStr } from './date';
import { itemKcal } from './mealLog';
import { escapeHtml } from 'shared';

type TabKey = 'exercise' | 'nutrition' | 'profile';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ロゴタップで戻ってくるホーム画面。3タブそれぞれの「今の状態」を一目で見せ、
// タップで各タブの記録フォームへ直接移動できるようにする(design.md未記載、UI再設計フェーズ2)。
export function renderHome(container: HTMLElement, onGoto: (tab: TabKey) => void): void {
  container.innerHTML = `
    <div class="stack">
    <div class="card">
      <h2>今日のからだ手帳</h2>
      <div class="nutrition-stats" id="home-stats"><p>読み込み中...</p></div>
    </div>
    <div class="link-list">
      <button type="button" class="link-card" data-goto="exercise">
        <span>
          <span class="link-title">運動を記録する</span>
          <span class="link-desc">今日のトレーニングを入力</span>
        </span>
        <span class="chev">→</span>
      </button>
      <button type="button" class="link-card" data-goto="nutrition">
        <span>
          <span class="link-title">食事を記録する</span>
          <span class="link-desc">食べたものを追加</span>
        </span>
        <span class="chev">→</span>
      </button>
      <button type="button" class="link-card" data-goto="profile">
        <span>
          <span class="link-title">体重を記録する</span>
          <span class="link-desc">今日の体重を入力</span>
        </span>
        <span class="chev">→</span>
      </button>
    </div>
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>('.link-card').forEach((btn) => {
    btn.addEventListener('click', () => onGoto(btn.dataset.goto as TabKey));
  });

  const statsEl = container.querySelector<HTMLElement>('#home-stats')!;
  const today = todayStr();

  void Promise.all([getRecentLogs(1), getMeals(today, today), getNutritionSummary()])
    .then(([recentLogs, meals, summary]) => {
      const latestLog = recentLogs[0] ?? null;
      const todayKcal = Math.round(
        meals.reduce((sum, meal) => sum + meal.items.reduce((s, item) => s + itemKcal(item), 0), 0)
      );
      const targetCalories = summary.goal?.target_calories ?? null;

      statsEl.innerHTML = `
        <div class="stat-card">
          <span class="stat-label">運動</span>
          ${
            latestLog
              ? `<span class="stat-value">${escapeHtml(latestLog.exercise_name)}</span>
                 <span class="stat-sub">${latestLog.weight !== null ? `${latestLog.weight}kg ` : ''}${latestLog.reps}回</span>`
              : '<span class="stat-value">記録なし</span>'
          }
        </div>
        <div class="stat-card">
          <span class="stat-label">食事(摂取カロリー)</span>
          <span class="stat-value">${todayKcal}kcal</span>
          ${
            targetCalories !== null
              ? targetCalories >= todayKcal
                ? `<span class="stat-sub">目標まで残り${targetCalories - todayKcal}kcal</span>`
                : `<span class="stat-sub">目標を${todayKcal - targetCalories}kcal超過</span>`
              : ''
          }
        </div>
        <div class="stat-card">
          <span class="stat-label">体重</span>
          <span class="stat-value">${summary.current_weight !== null ? `${summary.current_weight.toFixed(1)}kg` : '記録なし'}</span>
          ${summary.bmi !== null ? `<span class="stat-sub">BMI ${summary.bmi.toFixed(1)}${summary.bmi_category ? `(${escapeHtml(summary.bmi_category)})` : ''}</span>` : ''}
        </div>
      `;
    })
    .catch((err) => {
      statsEl.innerHTML = `<p class="error">サマリーの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    });
}
