import { getBodyWeightLogs } from './api';
import { Chart } from './chartDefaults';
import { periodRange } from './graph';
import type { BodyWeightLog } from './types';
import { escapeHtml } from 'shared';

type Period = '30d' | '3mo' | 'all';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §3「プロフィールタブ」対応。体重の推移グラフ。運動・食事タブのグラフ画面と
// 同じく、記録フォームとは別の詳細画面として切り出してある(2026-08-16)。
export function renderBodyWeightGraph(container: HTMLElement): void {
  let currentPeriod: Period = '30d';
  let chart: Chart | null = null;

  container.innerHTML = '<p>読み込み中...</p>';

  void refresh(true);

  function draw(): void {
    container.innerHTML = `
      <div class="period-toggle" role="group">
        <button type="button" data-period="30d" class="active">直近30日</button>
        <button type="button" data-period="3mo">直近3ヶ月</button>
        <button type="button" data-period="all">全期間</button>
      </div>
      <div class="chart-wrap"><canvas id="body-weight-chart"></canvas></div>
    `;

    container.querySelectorAll<HTMLButtonElement>('.period-toggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.period-toggle button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.dataset.period as Period;
        void refresh(false);
      });
    });
  }

  async function refresh(firstLoad: boolean): Promise<void> {
    const { from, to } = periodRange(currentPeriod);
    let logs: BodyWeightLog[];
    try {
      logs = await getBodyWeightLogs(from, to);
    } catch (err) {
      container.innerHTML = `<p class="error">体重記録の取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
      return;
    }
    if (firstLoad) draw();
    renderChart(logs);
  }

  function renderChart(logs: BodyWeightLog[]): void {
    const canvas = container.querySelector<HTMLCanvasElement>('#body-weight-chart');
    if (!canvas) return;
    chart?.destroy();
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: logs.map((l) => l.logged_date.slice(0, 10)),
        datasets: [{ label: '体重(kg)', data: logs.map((l) => l.weight), borderColor: '#3b82f6' }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: '体重の推移', font: { size: 14 } } },
        scales: {
          x: { title: { display: true, text: '日付' } },
          y: { title: { display: true, text: '体重(kg)' } },
        },
      },
    });
  }
}
