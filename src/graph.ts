import { Chart, registerables } from 'chart.js';
import { getBoard, getLogs } from './api';
import type { BoardRow, LogRow } from './types';

Chart.register(...registerables);

type Period = '30d' | '3mo' | 'all';

export async function renderGraph(container: HTMLElement): Promise<void> {
  container.innerHTML = '<p>読み込み中...</p>';

  let exercises: BoardRow[] = [];
  try {
    const board = await getBoard();
    exercises = board.filter((r) => r['分類'] !== 'Rest');
  } catch (err) {
    container.innerHTML = `<p class="error">種目一覧の取得に失敗しました: ${escapeHtml(String(err))}</p>`;
    return;
  }

  container.innerHTML = `
    <div class="graph-controls">
      <select id="exercise-select">
        ${exercises
          .map((e) => `<option value="${escapeHtml(String(e['種目名']))}">${escapeHtml(String(e['種目名']))}</option>`)
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

  async function update(): Promise<void> {
    const exercise = select.value;
    if (!exercise) return;
    statusEl.textContent = '';

    const { from, to } = periodRange(currentPeriod);
    let logs: LogRow[] = [];
    try {
      logs = await getLogs(exercise, from, to);
    } catch {
      statusEl.textContent = 'データの取得に失敗しました';
      return;
    }
    if (logs.length === 0) {
      statusEl.textContent = '記録なし';
    }

    const byDate = groupByDate(logs);
    const labels = Object.keys(byDate).sort();
    const weightData = labels.map((d) => Math.max(...byDate[d].map((l) => Number(l['重量(kg)']) || 0)));
    const volumeData = labels.map((d) =>
      byDate[d].reduce((sum, l) => sum + (Number(l['重量(kg)']) || 0) * (Number(l['回数']) || 0), 0)
    );

    weightChart?.destroy();
    weightChart = new Chart(weightCanvas, {
      type: 'line',
      data: { labels, datasets: [{ label: '重量(kg)', data: weightData, borderColor: '#3b82f6' }] },
      options: { responsive: true, plugins: { title: { display: true, text: '重量推移' } } },
    });

    volumeChart?.destroy();
    volumeChart = new Chart(volumeCanvas, {
      type: 'line',
      data: { labels, datasets: [{ label: '総作業量(kg)', data: volumeData, borderColor: '#22c55e' }] },
      options: { responsive: true, plugins: { title: { display: true, text: '総作業量推移' } } },
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

  if (exercises.length > 0) {
    await update();
  } else {
    statusEl.textContent = '種目が登録されていません';
  }
}

function periodRange(period: Period): { from?: string; to?: string } {
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

function groupByDate(logs: LogRow[]): Record<string, LogRow[]> {
  const map: Record<string, LogRow[]> = {};
  logs.forEach((l) => {
    const date = String(l['日付']).slice(0, 10);
    if (!map[date]) map[date] = [];
    map[date].push(l);
  });
  return map;
}

function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}
