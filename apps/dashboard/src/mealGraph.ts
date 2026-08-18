import { getMeals, getNutritionSummary } from './api';
import { Chart } from './chartDefaults';
import { periodRange } from './graph';
import { itemKcal } from './mealLog';
import type { Meal, MealItem, NutritionSummary } from './types';
import { escapeHtml } from 'shared';

type Period = '30d' | '3mo' | 'all';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §3「食事タブ」対応。摂取カロリー・PFCの推移グラフ。運動タブのグラフ画面と同じく、
// 記録フォームとは別の詳細画面として切り出してある(2026-08-16)。
export function renderMealGraph(container: HTMLElement): void {
  let currentPeriod: Period = '30d';
  let meals: Meal[] = [];
  let summary: NutritionSummary | null = null;
  let calorieChart: Chart | null = null;
  let pfcChart: Chart | null = null;

  container.innerHTML = '<p>読み込み中...</p>';

  const initialRange = periodRange(currentPeriod);
  void Promise.all([getNutritionSummary(), getMeals(initialRange.from, initialRange.to)])
    .then(([s, m]) => {
      summary = s;
      meals = m;
      draw();
    })
    .catch((err) => {
      container.innerHTML = `<p class="error">グラフの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    });

  function draw(): void {
    container.innerHTML = `
      <div class="period-toggle" role="group">
        <button type="button" data-period="30d" class="active">直近30日</button>
        <button type="button" data-period="3mo">直近3ヶ月</button>
        <button type="button" data-period="all">全期間</button>
      </div>
      <div class="chart-wrap"><canvas id="calorie-chart"></canvas></div>
      <div class="chart-wrap">
        <div id="pfc-legend" class="chart-legend-rows"></div>
        <canvas id="pfc-chart"></canvas>
      </div>
    `;

    container.querySelectorAll<HTMLButtonElement>('.period-toggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.period-toggle button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.dataset.period as Period;
        void refreshMeals();
      });
    });

    renderCharts();
  }

  async function refreshMeals(): Promise<void> {
    const { from, to } = periodRange(currentPeriod);
    try {
      meals = await getMeals(from, to);
    } catch {
      return;
    }
    renderCharts();
  }

  function renderCharts(): void {
    const calorieCanvas = container.querySelector<HTMLCanvasElement>('#calorie-chart');
    const pfcCanvas = container.querySelector<HTMLCanvasElement>('#pfc-chart');
    if (!calorieCanvas || !pfcCanvas) return;

    const byDate = new Map<string, MealItem[]>();
    meals.forEach((m) => {
      const items = byDate.get(m.logged_date) ?? [];
      byDate.set(m.logged_date, [...items, ...m.items]);
    });
    const labels = [...byDate.keys()].sort();
    const kcalData = labels.map((d) => Math.round(byDate.get(d)!.reduce((sum, i) => sum + itemKcal(i), 0)));
    const proteinData = labels.map((d) => byDate.get(d)!.reduce((sum, i) => sum + (i.protein_g_per_100g * i.quantity_g) / 100, 0));
    const fatData = labels.map((d) => byDate.get(d)!.reduce((sum, i) => sum + (i.fat_g_per_100g * i.quantity_g) / 100, 0));
    const carbData = labels.map((d) => byDate.get(d)!.reduce((sum, i) => sum + (i.carb_g_per_100g * i.quantity_g) / 100, 0));

    const targetCalories = summary?.goal?.target_calories ?? null;

    calorieChart?.destroy();
    calorieChart = new Chart(calorieCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '摂取カロリー実績(kcal)', data: kcalData, borderColor: '#3b82f6' },
          ...(targetCalories !== null
            ? [
                {
                  label: '目標カロリー(kcal)',
                  data: labels.map(() => targetCalories),
                  borderColor: '#f59e0b',
                  borderDash: [6, 4],
                  // pointRadius 0だと、記録1日分(点1つ)のとき目標ラインが完全に見えなくなるため、
                  // 小さな点を常に表示する
                  pointRadius: 2,
                },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: '摂取カロリーの推移', font: { size: 14 } } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'kcal' } } },
      },
    });

    const targetPfc = summary?.goal?.pfc ?? null;
    // 表記順はタンパク質→脂質→炭水化物(PFC順)で統一する。目標線は実績と同じ色の点線にする
    // (体重変動でも「今の目標に対する参考線」として表示、カロリーの目標線と同じ考え方)。
    // Chart.js標準の凡例だと幅次第で実績・目標が同じ行に混ざって折り返されてしまうため、
    // 凡例は独自HTMLで「1行目=実績、2行目=目標」を固定して描く(2026-08-16)
    const proteinColor = '#22c55e';
    const fatColor = '#ef4444';
    const carbColor = '#a855f7';

    // Chart.jsはcanvas作成時のコンテナ高さを基準にサイズを決めるため、凡例HTMLは
    // Chart生成より先にDOMへ入れておく(後から入れるとチャートの描画領域が壊れる)
    const hasTarget =
      (targetPfc?.carb_g !== null && targetPfc?.carb_g !== undefined) ||
      (targetPfc?.protein_g !== null && targetPfc?.protein_g !== undefined) ||
      (targetPfc?.fat_g !== null && targetPfc?.fat_g !== undefined);
    const legendEl = container.querySelector<HTMLElement>('#pfc-legend');
    if (legendEl) {
      legendEl.innerHTML = `
        <div class="chart-legend-row">
          ${legendItemHtml(proteinColor, 'タンパク質(g)', false)}
          ${legendItemHtml(fatColor, '脂質(g)', false)}
          ${legendItemHtml(carbColor, '炭水化物(g)', false)}
        </div>
        ${
          hasTarget
            ? `<div class="chart-legend-row">
          ${legendItemHtml(proteinColor, '目標タンパク質(g)', true)}
          ${legendItemHtml(fatColor, '目標脂質(g)', true)}
          ${legendItemHtml(carbColor, '目標炭水化物(g)', true)}
        </div>`
            : ''
        }
      `;
    }

    pfcChart?.destroy();
    pfcChart = new Chart(pfcCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'タンパク質(g)', data: proteinData, borderColor: proteinColor },
          { label: '脂質(g)', data: fatData, borderColor: fatColor },
          { label: '炭水化物(g)', data: carbData, borderColor: carbColor },
          ...(targetPfc?.protein_g !== null && targetPfc?.protein_g !== undefined
            ? [{ label: '目標タンパク質(g)', data: labels.map(() => targetPfc.protein_g), borderColor: proteinColor, borderDash: [6, 4], pointRadius: 2 }]
            : []),
          ...(targetPfc?.fat_g !== null && targetPfc?.fat_g !== undefined
            ? [{ label: '目標脂質(g)', data: labels.map(() => targetPfc.fat_g), borderColor: fatColor, borderDash: [6, 4], pointRadius: 2 }]
            : []),
          ...(targetPfc?.carb_g !== null && targetPfc?.carb_g !== undefined
            ? [{ label: '目標炭水化物(g)', data: labels.map(() => targetPfc.carb_g), borderColor: carbColor, borderDash: [6, 4], pointRadius: 2 }]
            : []),
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'PFC実績の推移', font: { size: 14 } },
          legend: { display: false },
        },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'g' } } },
      },
    });
  }
}

function legendItemHtml(color: string, label: string, dashed: boolean): string {
  return `
    <span class="chart-legend-item">
      <span class="chart-legend-swatch ${dashed ? 'chart-legend-swatch-dashed' : ''}" style="background-color: ${dashed ? 'transparent' : color}; border-color: ${color};"></span>
      ${escapeHtml(label)}
    </span>
  `;
}
