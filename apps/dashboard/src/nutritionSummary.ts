import { getNutritionSummary } from './api';
import type { NutritionSummary } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Metric = { label: string; target: number | null; today: number; unit: 'kcal' | 'g' };

function formatValue(value: number, unit: 'kcal' | 'g'): string {
  return unit === 'kcal' ? `${Math.round(value)}kcal` : `${Math.round(value * 10) / 10}g`;
}

// design.md §2.16・2.17対応。カロリー・炭水化物・タンパク質・脂質を、「目標」「本日の摂取」
// 「残り摂取可能」の3枚のカードにまとめて見るだけの表示専用(2026-08-16、
// stat-cardが12枚に増えて分かりづらいとの指摘を受け、種別ごとに1枚(3枚)へ再構成。
// AskUserQuestionで複数案を提示しユーザーが選択。表記順は炭水化物→タンパク質→脂質で統一)。
// 体重は完全にプロフィールタブへ委ねる。目標の設定・変更はプロフィールタブの
// 「目標」に分離してある。
export function renderNutritionSummary(container: HTMLElement): void {
  container.innerHTML = '<p>読み込み中...</p>';

  void getNutritionSummary()
    .then((summary) => draw(summary))
    .catch((err) => {
      container.innerHTML = `<p class="error">サマリーの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    });

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
    const goal = summary.goal;
    const targetCalories = goal?.target_calories ?? null;
    const pfc = goal?.pfc ?? null;

    const metrics: Metric[] = [
      { label: 'カロリー', target: targetCalories, today: summary.today_kcal, unit: 'kcal' },
      { label: '炭水化物', target: pfc?.carb_g ?? null, today: summary.today_carb_g, unit: 'g' },
      { label: 'タンパク質', target: pfc?.protein_g ?? null, today: summary.today_protein_g, unit: 'g' },
      { label: '脂質', target: pfc?.fat_g ?? null, today: summary.today_fat_g, unit: 'g' },
    ];

    container.innerHTML = `
      ${goal?.overdue ? '<p class="banner banner-warning">目標達成日を過ぎています。目標を見直しましょう。</p>' : ''}
      ${
        goal?.newly_reached_milestone !== null && goal?.newly_reached_milestone !== undefined
          ? `<p class="banner banner-success">🎉 目標まで${goal.newly_reached_milestone}%達成しました!</p>`
          : ''
      }
      <div class="nutrition-stats">
        ${cardHtml('目標', metrics, (m) => m.target)}
        ${cardHtml('本日の摂取', metrics, (m) => m.today)}
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
  }
}
