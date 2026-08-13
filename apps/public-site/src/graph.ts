import { Chart, registerables } from 'chart.js';
import type { Exercise, LogRow } from './types';
import { CYCLE_LABELS, escapeHtml } from 'shared';

Chart.register(...registerables);

type Period = '30d' | '3mo' | 'all';

// exercises・allLogs は呼び出し元(main.ts)でページ読み込み時に1回だけ取得済みのものを受け取る。
// 種目・期間の切り替えはAPIを呼び直さず、ブラウザ側でallLogsをフィルタするだけで完結させる。
export function renderGraph(container: HTMLElement, exercises: Exercise[], allLogs: LogRow[]): void {
  const selectable = exercises.filter((e) => e.cycle.label !== 'Rest');

  if (selectable.length === 0) {
    container.innerHTML = '<p>種目が登録されていません</p>';
    return;
  }

  // 廃止済みでも元のサイクルのグループ内に表示し、名前に(廃止)を付けて区別する
  const groups = [1, 2, 3]
    .map((cycle) => ({
      label: `サイクル${cycle}: ${CYCLE_LABELS[cycle]}`,
      rows: selectable.filter((e) => e.cycle.id === cycle),
    }))
    .filter((g) => g.rows.length > 0);

  container.innerHTML = `
    <div class="graph-controls">
      <select id="exercise-select">
        ${groups
          .map(
            (g) => `
          <optgroup label="${escapeHtml(g.label)}">
            ${g.rows
              .map(
                (e) =>
                  `<option value="${e.id}">${escapeHtml(e.name)}${e.is_discontinued ? '(廃止)' : ''}</option>`
              )
              .join('')}
          </optgroup>
        `
          )
          .join('')}
      </select>
      <div class="period-toggle" role="group">
        <button type="button" data-period="30d" class="active">直近30日</button>
        <button type="button" data-period="3mo">直近3ヶ月</button>
        <button type="button" data-period="all">全期間</button>
      </div>
    </div>
    <p id="graph-status"></p>
    <div class="chart-wrap"><canvas id="weight-chart"></canvas></div>
    <div class="chart-wrap"><canvas id="volume-chart"></canvas></div>
  `;

  const select = container.querySelector<HTMLSelectElement>('#exercise-select')!;
  const periodButtons = container.querySelectorAll<HTMLButtonElement>('.period-toggle button');
  const statusEl = container.querySelector<HTMLParagraphElement>('#graph-status')!;
  const weightCanvas = container.querySelector<HTMLCanvasElement>('#weight-chart')!;
  const volumeCanvas = container.querySelector<HTMLCanvasElement>('#volume-chart')!;

  let weightChart: Chart | null = null;
  let volumeChart: Chart | null = null;
  let currentPeriod: Period = '30d';

  function update(): void {
    const exerciseId = Number(select.value);
    const exercise = selectable.find((e) => e.id === exerciseId);
    if (!exercise) return;
    statusEl.textContent = '';

    const { from, to } = periodRange(currentPeriod);
    const logs = allLogs.filter((l) => {
      if (l.exercise_id !== exerciseId) return false;
      if (from && l.logged_date < from) return false;
      if (to && l.logged_date > to) return false;
      return true;
    });
    if (logs.length === 0) {
      statusEl.textContent = '記録なし';
    }

    const byDate = groupByDate(logs);
    const labels = Object.keys(byDate).sort();
    const weightData = labels.map((d) => Math.max(...byDate[d].map((l) => l.weight ?? 0)));
    const volumeData = labels.map((d) => byDate[d].reduce((sum, l) => sum + (l.weight ?? 0) * l.reps, 0));

    weightChart?.destroy();
    weightChart = buildLineChart(weightCanvas, labels, weightData, {
      datasetLabel: '重量(kg)',
      color: '#3b82f6',
      title: `${exercise.name} - 重量推移(その日の最大重量)`,
      yLabel: '重量(kg)',
    });

    volumeChart?.destroy();
    volumeChart = buildLineChart(volumeCanvas, labels, volumeData, {
      datasetLabel: '総作業量(kg)',
      color: '#22c55e',
      title: `${exercise.name} - 総作業量推移(重量×回数の合計)`,
      yLabel: '総作業量(kg)',
    });
  }

  select.addEventListener('change', update);
  periodButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      periodButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = btn.dataset.period as Period;
      update();
    });
  });

  update();
}

function buildLineChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  data: number[],
  opts: { datasetLabel: string; color: string; title: string; yLabel: string }
): Chart {
  return new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ label: opts.datasetLabel, data, borderColor: opts.color }] },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: opts.title },
      },
      scales: {
        x: { title: { display: true, text: '日付' } },
        y: { title: { display: true, text: opts.yLabel }, beginAtZero: true },
      },
    },
  });
}

export function periodRange(period: Period): { from?: string; to?: string } {
  if (period === 'all') return {};
  const now = new Date();
  const from = new Date(now);
  if (period === '30d') from.setDate(from.getDate() - 30);
  if (period === '3mo') from.setMonth(from.getMonth() - 3);
  return { from: formatDate(from), to: formatDate(now) };
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function groupByDate(logs: LogRow[]): Record<string, LogRow[]> {
  const map: Record<string, LogRow[]> = {};
  logs.forEach((l) => {
    const date = l.logged_date.slice(0, 10);
    if (!map[date]) map[date] = [];
    map[date].push(l);
  });
  return map;
}
