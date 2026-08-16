import { getNutritionSummary } from './api';
import { ACTIVITY_LEVEL_LABELS, ACTIVITY_LEVEL_SHORT_LABELS } from './profileEdit';
import type { NutritionSummary } from './types';
import { escapeHtml } from 'shared';
import type { ActivityLevel } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// プロフィールタブのランディング用サマリー。身長・活動レベルと、体重・BMIを現在/目標で
// 並べて表示する。目標体重・目標達成日はnutrition_goalsを読み取り専用で表示するのみで、
// 編集は同タブの「目標」に委ねる(design.md未記載、UI再設計フェーズ2。
// 2026-08-16、編集フォームを食事タブからプロフィールタブに移動)。
export function renderProfileSummary(container: HTMLElement): void {
  container.innerHTML = '<p>読み込み中...</p>';

  void getNutritionSummary()
    .then((summary) => draw(summary))
    .catch((err) => {
      container.innerHTML = `<p class="error">サマリーの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    });

  function draw(summary: NutritionSummary): void {
    const goal = summary.goal;
    const activityLabel =
      summary.activity_level !== null
        ? (ACTIVITY_LEVEL_LABELS[summary.activity_level as ActivityLevel] ?? summary.activity_level)
        : '未設定';
    const activityShortLabel =
      summary.activity_level !== null
        ? (ACTIVITY_LEVEL_SHORT_LABELS[summary.activity_level as ActivityLevel] ?? summary.activity_level)
        : '未設定';

    container.innerHTML = `
      <div class="nutrition-stats">
        <div class="stat-card">
          <span class="stat-label">身長</span>
          <span class="stat-value">${summary.height_cm !== null ? `${summary.height_cm}cm` : '未設定'}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">活動レベル</span>
          <span class="stat-value" title="${escapeHtml(activityLabel)}">${escapeHtml(activityShortLabel)}</span>
        </div>
      </div>
      <div class="nutrition-stats">
        <div class="stat-card">
          <span class="stat-label">現在の体重</span>
          <span class="stat-value">${summary.current_weight !== null ? `${summary.current_weight.toFixed(1)}kg` : '記録なし'}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">目標体重</span>
          <span class="stat-value">${goal ? `${goal.target_weight.toFixed(1)}kg` : '—'}</span>
        </div>
      </div>
      <div class="nutrition-stats">
        <div class="stat-card">
          <span class="stat-label">BMI</span>
          <span class="stat-value-row">
            <span class="stat-value">${summary.bmi !== null ? summary.bmi.toFixed(1) : '—'}</span>
            ${summary.bmi_category ? `<span class="stat-sub">${escapeHtml(summary.bmi_category)}</span>` : ''}
          </span>
        </div>
        <div class="stat-card">
          <span class="stat-label">目標BMI</span>
          <span class="stat-value-row">
            <span class="stat-value">${goal?.target_bmi !== null && goal?.target_bmi !== undefined ? goal.target_bmi.toFixed(1) : '—'}</span>
            ${goal?.target_bmi_category ? `<span class="stat-sub">${escapeHtml(goal.target_bmi_category)}</span>` : ''}
          </span>
        </div>
      </div>
      <div class="nutrition-stats">
        <div class="stat-card">
          <span class="stat-label">体脂肪率</span>
          <span class="stat-value">${summary.current_body_fat_percentage !== null ? `${summary.current_body_fat_percentage.toFixed(1)}%` : '記録なし'}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">目標体脂肪率</span>
          <span class="stat-value">${goal?.target_body_fat_percentage !== null && goal?.target_body_fat_percentage !== undefined ? `${goal.target_body_fat_percentage.toFixed(1)}%` : '—'}</span>
        </div>
      </div>
      ${
        goal
          ? `<p class="field-note">目標達成日: ${escapeHtml(goal.target_date)}(目標の変更は「目標」から)</p>`
          : '<p class="field-note">目標体重・目標達成日は「目標」から設定できます</p>'
      }
    `;
  }
}
