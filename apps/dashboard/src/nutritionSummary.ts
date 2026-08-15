import { addNutritionGoal, getNutritionSummary } from './api';
import type { NutritionSummary, PfcMode } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const PFC_MODE_LABELS: Record<PfcMode, string> = {
  standard: '標準(P15% / F25% / C60%)',
  bulk: '筋トレ向き(タンパク質 体重×1.8g/kg)',
  cut: '減量向き(タンパク質 体重×2.0g/kg)',
  custom: 'カスタム(グラム数を直接指定)',
};

// design.md §2.16・2.17対応。BMI・TDEE・目標カロリー・PFC・達成日超過バナー・
// 進捗マイルストーンの表示と、目標体重・達成日・PFC配分方式の設定フォーム。
export function renderNutritionSummary(container: HTMLElement, onGoalChanged: () => void): void {
  container.innerHTML = '<p>読み込み中...</p>';

  void getNutritionSummary()
    .then((summary) => draw(summary))
    .catch((err) => {
      container.innerHTML = `<p class="error">サマリーの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    });

  function draw(summary: NutritionSummary): void {
    const goal = summary.goal;

    container.innerHTML = `
      ${goal?.overdue ? '<p class="banner banner-warning">目標達成日を過ぎています。目標を見直しましょう。</p>' : ''}
      ${
        goal?.newly_reached_milestone !== null && goal?.newly_reached_milestone !== undefined
          ? `<p class="banner banner-success">🎉 目標まで${goal.newly_reached_milestone}%達成しました!</p>`
          : ''
      }
      <div class="nutrition-stats">
        <div class="stat-card">
          <span class="stat-label">現在の体重</span>
          <span class="stat-value">${summary.current_weight !== null ? `${summary.current_weight.toFixed(1)}kg` : '記録なし'}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">BMI</span>
          <span class="stat-value">${summary.bmi !== null ? summary.bmi.toFixed(1) : '—'}</span>
          ${summary.bmi_category ? `<span class="stat-sub">${escapeHtml(summary.bmi_category)}</span>` : ''}
        </div>
        <div class="stat-card">
          <span class="stat-label">維持カロリー(TDEE)</span>
          <span class="stat-value">${summary.tdee !== null ? `${summary.tdee}kcal` : '—'}</span>
          ${summary.tdee === null ? '<span class="stat-sub">プロフィールタブで身長・活動レベルを入力してください</span>' : ''}
        </div>
      </div>

      <div id="goal-section"></div>
    `;

    renderGoalSection(container.querySelector<HTMLElement>('#goal-section')!, summary);
  }

  function renderGoalSection(el: HTMLElement, summary: NutritionSummary): void {
    const goal = summary.goal;

    el.innerHTML = `
      ${
        goal
          ? `
        <div class="nutrition-stats">
          <div class="stat-card">
            <span class="stat-label">目標体重</span>
            <span class="stat-value">${goal.target_weight.toFixed(1)}kg</span>
            <span class="stat-sub">${escapeHtml(goal.target_date)}まで(残り${goal.days_remaining}日)</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">目標カロリー</span>
            <span class="stat-value">${goal.target_calories !== null ? `${goal.target_calories}kcal` : '—'}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">進捗</span>
            <span class="stat-value">${goal.progress_percent !== null ? `${goal.progress_percent.toFixed(1)}%` : '—'}</span>
          </div>
        </div>
        ${
          goal.pfc
            ? `
          <table class="pfc-table">
            <thead><tr><th>タンパク質</th><th>脂質</th><th>炭水化物</th></tr></thead>
            <tbody><tr>
              <td>${goal.pfc.protein_g !== null ? `${goal.pfc.protein_g}g` : '—'}</td>
              <td>${goal.pfc.fat_g !== null ? `${goal.pfc.fat_g}g` : '—'}</td>
              <td>${goal.pfc.carb_g !== null ? `${goal.pfc.carb_g}g` : '—'}</td>
            </tr></tbody>
          </table>
          ${goal.pfc.warning ? `<p class="error">${escapeHtml(goal.pfc.warning)}</p>` : ''}
        `
            : '<p>身長・活動レベルが未設定のため、目標カロリー・PFCを計算できません(プロフィールタブから入力してください)</p>'
        }
        <button type="button" id="edit-goal-btn" class="link-button">目標を変更する</button>
      `
          : '<p>目標がまだ設定されていません</p><button type="button" id="edit-goal-btn">目標を設定する</button>'
      }
      <div id="goal-form-wrap"></div>
    `;

    el.querySelector('#edit-goal-btn')!.addEventListener('click', () => {
      renderGoalForm(el.querySelector<HTMLElement>('#goal-form-wrap')!, goal?.pfc_mode ?? 'standard');
    });
  }

  function renderGoalForm(el: HTMLElement, currentMode: PfcMode): void {
    el.innerHTML = `
      <form id="goal-form">
        <label>目標体重(kg) <input type="number" step="0.1" id="goal-weight" required /></label>
        <label>達成期日 <input type="date" id="goal-date" required /></label>
        <label>PFC配分方式
          <select id="goal-pfc-mode">
            ${(Object.keys(PFC_MODE_LABELS) as PfcMode[])
              .map((m) => `<option value="${m}" ${m === currentMode ? 'selected' : ''}>${escapeHtml(PFC_MODE_LABELS[m])}</option>`)
              .join('')}
          </select>
        </label>
        <div id="custom-pfc-fields" hidden>
          <label>タンパク質(g) <input type="number" step="0.1" id="goal-custom-protein" /></label>
          <label>脂質(g) <input type="number" step="0.1" id="goal-custom-fat" /></label>
          <label>炭水化物(g) <input type="number" step="0.1" id="goal-custom-carb" /></label>
        </div>
        <button type="submit">保存</button>
        <p id="goal-status"></p>
      </form>
    `;

    const modeSelect = el.querySelector<HTMLSelectElement>('#goal-pfc-mode')!;
    const customFields = el.querySelector<HTMLElement>('#custom-pfc-fields')!;
    const syncCustomFieldsVisibility = () => {
      customFields.hidden = modeSelect.value !== 'custom';
    };
    syncCustomFieldsVisibility();
    modeSelect.addEventListener('change', syncCustomFieldsVisibility);

    el.querySelector<HTMLFormElement>('#goal-form')!.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const statusEl = el.querySelector<HTMLParagraphElement>('#goal-status')!;
      const targetWeight = el.querySelector<HTMLInputElement>('#goal-weight')!.value;
      const targetDate = el.querySelector<HTMLInputElement>('#goal-date')!.value;
      const pfcMode = modeSelect.value as PfcMode;
      const customProtein = el.querySelector<HTMLInputElement>('#goal-custom-protein')!.value;
      const customFat = el.querySelector<HTMLInputElement>('#goal-custom-fat')!.value;
      const customCarb = el.querySelector<HTMLInputElement>('#goal-custom-carb')!.value;
      statusEl.textContent = '保存中...';
      try {
        await addNutritionGoal(targetWeight, targetDate, pfcMode, customProtein, customFat, customCarb);
        onGoalChanged();
        void getNutritionSummary().then((summary) => draw(summary));
      } catch (err) {
        statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
      }
    });
  }
}
