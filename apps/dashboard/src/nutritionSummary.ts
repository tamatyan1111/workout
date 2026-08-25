import { getNutritionSummary } from './api';
import type { NutritionSummary } from './types';
import { escapeHtml } from 'shared';
import { addDays, shortDateLabel, todayStr, weekdayLabel } from './date';
import { captureElementToClipboard } from './captureImage';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Metric = { label: string; target: number | null; today: number; unit: 'kcal' | 'g' };

function formatValue(value: number, unit: 'kcal' | 'g'): string {
  return unit === 'kcal' ? `${Math.round(value)}kcal` : `${Math.round(value * 10) / 10}g`;
}

// design.md §2.16・2.17対応。カロリー・炭水化物・たんぱく質・脂質を、「目標」「本日の摂取」
// 「残り摂取可能」の3枚のカードにまとめて見るだけの表示専用(2026-08-16、
// stat-cardが12枚に増えて分かりづらいとの指摘を受け、種別ごとに1枚(3枚)へ再構成。
// AskUserQuestionで複数案を提示しユーザーが選択。表記順はたんぱく質→脂質→炭水化物(PFC順)で統一。
// 2026-08-18、食品パッケージの成分表示順(PFC)に合わせて炭水化物→たんぱく質→脂質から変更)。
// 体重は完全にプロフィールタブへ委ねる。目標の設定・変更はプロフィールタブの
// 「目標」に分離してある。
// 2026-08-19、日付ナビ(前の日/次の日)を追加。未来日には進めない(目標達成に関する
// バナーは「今まさに」の通知のため、過去日を見ているときは出さない)。
export function renderNutritionSummary(container: HTMLElement): void {
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
    const targetCalories = goal?.target_calories ?? null;
    const pfc = goal?.pfc ?? null;

    const metrics: Metric[] = [
      { label: 'カロリー', target: targetCalories, today: summary.today_kcal, unit: 'kcal' },
      { label: 'たんぱく質', target: pfc?.protein_g ?? null, today: summary.today_protein_g, unit: 'g' },
      { label: '脂質', target: pfc?.fat_g ?? null, today: summary.today_fat_g, unit: 'g' },
      { label: '炭水化物', target: pfc?.carb_g ?? null, today: summary.today_carb_g, unit: 'g' },
    ];

    container.innerHTML = `
      <div class="summary-header">
        <h2>サマリー</h2>
        <div class="date-nav">
          <button type="button" class="date-nav-prev" aria-label="前の日" title="前の日">‹</button>
          <strong class="date-nav-current">${shortDateLabel(currentDate)}(${weekdayLabel(currentDate)}${isToday ? '・今日' : ''})</strong>
          <button type="button" class="date-nav-next" aria-label="次の日" title="次の日" ${isToday ? 'disabled' : ''}>›</button>
        </div>
        <button type="button" class="capture-icon-btn" aria-label="画像をコピー" title="画像をコピー">📋</button>
      </div>
      <p class="capture-status"></p>
      ${isToday && goal?.overdue ? '<p class="banner banner-warning">目標達成日を過ぎています。目標を見直しましょう。</p>' : ''}
      ${
        isToday && goal?.newly_reached_milestone !== null && goal?.newly_reached_milestone !== undefined
          ? `<p class="banner banner-success">🎉 目標まで${goal.newly_reached_milestone}%達成しました!</p>`
          : ''
      }
      <div class="nutrition-stats">
        ${cardHtml('目標', metrics, (m) => m.target)}
        ${cardHtml(isToday ? '本日の摂取' : 'この日の摂取', metrics, (m) => m.today)}
        ${cardHtml('残り摂取可能', metrics, (m) => (m.target !== null ? m.target - m.today : null))}
      </div>
      ${
        goal
          ? pfc === null
            ? '<p>身長・活動レベルが未設定のため、目標カロリー・PFCを計算できません(プロフィールタブから入力してください)</p>'
            : pfc.warning
              ? `<p class="error">${escapeHtml(pfc.warning)}</p>`
              : ''
          : '<p>目標がまだ設定されていません。プロフィールタブの「目標」から設定できます。</p>'
      }
      <p class="field-note">目標の変更はプロフィールタブの「目標」から</p>
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
    container.querySelector('.capture-icon-btn')!.addEventListener('click', () => {
      const cardEl = container.closest<HTMLElement>('.card') ?? container;
      void captureElementToClipboard(cardEl, container.querySelector('.capture-status'));
    });
  }
}
