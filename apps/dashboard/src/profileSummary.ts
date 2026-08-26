import { getNutritionSummary } from './api';
import { ACTIVITY_LEVEL_LABELS, ACTIVITY_LEVEL_SHORT_LABELS } from './profileEdit';
import type { NutritionSummary } from './types';
import { escapeHtml } from 'shared';
import type { ActivityLevel } from 'shared';
import { addDays, shortDateLabel, todayStr, weekdayLabel } from './date';
import { captureElementToClipboard } from './captureImage';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Metric = { label: string; target: number | null; current: number | null; unit: 'kg' | '%' | '' };

function formatValue(value: number, unit: Metric['unit']): string {
  return unit === '' ? value.toFixed(1) : `${value.toFixed(1)}${unit}`;
}

// design.md §2.16・2.17対応。体重・BMI・体脂肪率を、食事タブのサマリーと同じ
// 「目標」「本日」「残り」の3枚のカードにまとめて見るだけの表示専用(2026-08-19、
// 食事タブと見た目を揃えたいとの要望を受けて、4枚2段の個別カードから再構成)。
// 身長・活動レベルは「目標/残り」の概念がないため、この3枚とは別に上部へ残す。
// 2026-08-20、日付ナビ(前の日/次の日)を追加。運動・食事と揃えて「その日ちょうどの記録」
// だけを表示する(記録の無い日は—。実機検証で「記録が無い日にも値が出て紛らわしい」との
// 指摘を受け、当初のas-of仕様から変更。BMR・TDEE等の内部計算は引き続きas-of値を使う。
// build_nutrition_summaryのfetch_body_weight_on_date/fetch_latest_two_body_weights_as_of参照)。
export function renderProfileSummary(container: HTMLElement): void {
  let currentDate = todayStr();

  load();

  function load(): void {
    // 日付ナビを連続クリックしたときに、後発のリクエストより先発のリクエストが遅れて
    // 返ってきて表示を上書きしてしまわないよう、リクエスト時点の日付と現在の日付が
    // 一致するときだけ描画する(2026-08-20、実機検証で発覚した競合状態への対処)
    const requestedDate = currentDate;
    container.innerHTML = '<p>読み込み中...</p>';
    void getNutritionSummary(requestedDate)
      .then((summary) => {
        if (requestedDate !== currentDate) return;
        draw(summary);
      })
      .catch((err) => {
        if (requestedDate !== currentDate) return;
        container.innerHTML = `<p class="error">サマリーの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
      });
  }

  function cardHtml(title: string, metrics: Metric[], valueOf: (m: Metric) => number | null): string {
    return `
      <div class="stat-card stat-card-multi">
        <span class="stat-label">${escapeHtml(title)}</span>
        <dl class="stat-multi-list">
          ${metrics
            .map((m) => {
              const value = valueOf(m);
              return `<div><dt>${escapeHtml(m.label)}</dt><dd>${value !== null ? formatValue(value, m.unit) : '—'}</dd></div>`;
            })
            .join('')}
        </dl>
      </div>
    `;
  }

  function draw(summary: NutritionSummary): void {
    const isToday = currentDate === todayStr();
    const goal = summary.goal;
    const activityLabel =
      summary.activity_level !== null
        ? (ACTIVITY_LEVEL_LABELS[summary.activity_level as ActivityLevel] ?? summary.activity_level)
        : '未設定';
    const activityShortLabel =
      summary.activity_level !== null
        ? (ACTIVITY_LEVEL_SHORT_LABELS[summary.activity_level as ActivityLevel] ?? summary.activity_level)
        : '未設定';

    const metrics: Metric[] = [
      { label: '体重', target: goal?.target_weight ?? null, current: summary.current_weight, unit: 'kg' },
      { label: 'BMI', target: goal?.target_bmi ?? null, current: summary.bmi, unit: '' },
      {
        label: '体脂肪率',
        target: goal?.target_body_fat_percentage ?? null,
        current: summary.current_body_fat_percentage,
        unit: '%',
      },
    ];

    container.innerHTML = `
      <div class="summary-header">
        <div class="date-nav">
          <button type="button" class="date-nav-prev" aria-label="前の日" title="前の日">‹</button>
          <strong class="date-nav-current">${shortDateLabel(currentDate)}(${weekdayLabel(currentDate)}${isToday ? '・今日' : ''})</strong>
          <button type="button" class="date-nav-next" aria-label="次の日" title="次の日" ${isToday ? 'disabled' : ''}>›</button>
        </div>
        <button type="button" class="capture-icon-btn" aria-label="画像をコピー" title="画像をコピー">📋</button>
      </div>
      <p class="capture-status"></p>
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
        ${cardHtml('目標', metrics, (m) => m.target)}
        ${cardHtml(isToday ? '本日' : 'この日', metrics, (m) => m.current)}
        ${cardHtml('残り', metrics, (m) => (m.target !== null && m.current !== null ? m.target - m.current : null))}
      </div>
    `;

    container.querySelector('.date-nav-prev')!.addEventListener('click', () => {
      currentDate = addDays(currentDate, -1);
      load();
    });
    container.querySelector<HTMLButtonElement>('.date-nav-next')!.addEventListener('click', () => {
      if (isToday) return;
      currentDate = addDays(currentDate, 1);
      load();
    });
    container.querySelector<HTMLButtonElement>('.capture-icon-btn')!.addEventListener('click', (ev) => {
      const cardEl = container.closest<HTMLElement>('.card') ?? container;
      void captureElementToClipboard(cardEl, ev.currentTarget as HTMLButtonElement, container.querySelector('.capture-status'));
    });
  }
}
