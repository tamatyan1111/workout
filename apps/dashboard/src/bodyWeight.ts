import { Chart, registerables } from 'chart.js';
import { addBodyWeightLog, deleteBodyWeightLog, editBodyWeightLog, getBodyWeightLogs } from './api';
import { todayStr } from './date';
import { periodRange } from './graph';
import type { BodyWeightLog } from './types';
import { escapeHtml } from 'shared';

Chart.register(...registerables);

type Period = '30d' | '3mo' | 'all';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §3「プロフィールタブ」US-15対応。日付・体重を記録すると、運動タブのグラフと同じ
// 期間切り替えで推移を折れ線グラフで見られる。
export function renderBodyWeight(container: HTMLElement): void {
  let currentPeriod: Period = '30d';
  let chart: Chart | null = null;

  function draw(): void {
    container.innerHTML = `
      <form id="body-weight-form">
        <div class="field-row">
          <label class="field">日付 <input type="date" id="bw-date" value="${todayStr()}" required /></label>
          <label class="field">体重(kg) <input type="number" step="0.1" id="bw-weight" required /></label>
          <label class="field">体脂肪率(%)<span class="field-note">任意</span> <input type="number" step="0.1" id="bw-body-fat" /></label>
        </div>
        <button type="submit">記録する</button>
        <p id="bw-status"></p>
      </form>
      <div class="period-toggle" role="group">
        <button type="button" data-period="30d" class="active">直近30日</button>
        <button type="button" data-period="3mo">直近3ヶ月</button>
        <button type="button" data-period="all">全期間</button>
      </div>
      <div class="chart-wrap"><canvas id="body-weight-chart"></canvas></div>
      <h3>履歴</h3>
      <div id="bw-list"><p>読み込み中...</p></div>
    `;

    container.querySelector<HTMLFormElement>('#body-weight-form')!.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const statusEl = container.querySelector<HTMLParagraphElement>('#bw-status')!;
      const date = container.querySelector<HTMLInputElement>('#bw-date')!.value;
      const weight = container.querySelector<HTMLInputElement>('#bw-weight')!.value;
      const bodyFatPercentage = container.querySelector<HTMLInputElement>('#bw-body-fat')!.value;
      statusEl.textContent = '送信中...';
      try {
        await addBodyWeightLog(date, weight, bodyFatPercentage);
        statusEl.textContent = '記録しました';
        await refresh();
      } catch (err) {
        statusEl.textContent = `記録に失敗しました: ${errorMessage(err)}`;
      }
    });

    container.querySelectorAll<HTMLButtonElement>('.period-toggle button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        container.querySelectorAll('.period-toggle button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.dataset.period as Period;
        await refresh();
      });
    });

    void refresh();
  }

  async function refresh(): Promise<void> {
    const listEl = container.querySelector<HTMLElement>('#bw-list');
    if (!listEl) return;
    const { from, to } = periodRange(currentPeriod);
    let logs: BodyWeightLog[];
    try {
      logs = await getBodyWeightLogs(from, to);
    } catch (err) {
      listEl.innerHTML = `<p class="error">体重記録の取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
      return;
    }

    renderChart(logs);
    renderList(listEl, logs);
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
        plugins: { title: { display: true, text: '体重の推移' } },
        scales: {
          x: { title: { display: true, text: '日付' } },
          y: { title: { display: true, text: '体重(kg)' } },
        },
      },
    });
  }

  function renderList(listEl: HTMLElement, logs: BodyWeightLog[]): void {
    if (logs.length === 0) {
      listEl.innerHTML = '<p>記録がありません</p>';
      return;
    }
    const sorted = [...logs].sort((a, b) => (a.logged_date < b.logged_date ? 1 : -1));
    listEl.innerHTML = `
      <table class="body-weight-table">
        <thead><tr><th>日付</th><th>体重(kg)</th><th>体脂肪率(%)</th><th></th></tr></thead>
        <tbody>
          ${sorted
            .map(
              (l) => `
            <tr data-id="${l.id}">
              <td><input type="date" class="edit-bw-date" value="${escapeHtml(l.logged_date.slice(0, 10))}" /></td>
              <td><input type="number" step="0.1" class="edit-bw-weight" value="${escapeHtml(l.weight.toFixed(1))}" /></td>
              <td><input type="number" step="0.1" class="edit-bw-body-fat" value="${escapeHtml(l.body_fat_percentage !== null ? l.body_fat_percentage.toFixed(1) : '')}" /></td>
              <td>
                <button type="button" class="save-btn">保存</button>
                <button type="button" class="delete-btn danger">削除</button>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
      <p id="bw-edit-status"></p>
    `;
    const editStatusEl = listEl.querySelector<HTMLParagraphElement>('#bw-edit-status')!;
    sorted.forEach((l) => {
      const row = listEl.querySelector<HTMLTableRowElement>(`tr[data-id="${l.id}"]`)!;
      row.querySelector('.save-btn')!.addEventListener('click', async () => {
        const date = row.querySelector<HTMLInputElement>('.edit-bw-date')!.value;
        const weight = row.querySelector<HTMLInputElement>('.edit-bw-weight')!.value;
        const bodyFatPercentage = row.querySelector<HTMLInputElement>('.edit-bw-body-fat')!.value;
        editStatusEl.textContent = '保存中...';
        try {
          await editBodyWeightLog(l.id, date, weight, bodyFatPercentage);
          editStatusEl.textContent = '保存しました';
          await refresh();
        } catch (err) {
          editStatusEl.textContent = errorMessage(err).includes('duplicate_date')
            ? 'その日付には既に別の記録があります'
            : `保存に失敗しました: ${errorMessage(err)}`;
        }
      });
      row.querySelector('.delete-btn')!.addEventListener('click', async () => {
        try {
          await deleteBodyWeightLog(l.id);
          await refresh();
        } catch (err) {
          alert(`削除に失敗しました: ${errorMessage(err)}`);
        }
      });
    });
  }

  draw();
}
