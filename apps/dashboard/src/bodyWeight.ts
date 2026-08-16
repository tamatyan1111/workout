import { addBodyWeightLog } from './api';
import { todayStr } from './date';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §3「プロフィールタブ」US-15対応。体重・体脂肪率を記録するフォームのみ
// (グラフ・直近の履歴は運動タブと同じ構成にするため、bodyWeightGraph.ts・
// recentBodyWeights.tsに分離してある。2026-08-16)。
export function renderBodyWeight(container: HTMLElement, onSaved: () => void): void {
  draw();

  function draw(): void {
    container.innerHTML = `
      <form id="body-weight-form">
        <div class="field-row">
          <label class="field">日付 <input type="date" id="bw-date" value="${todayStr()}" required /></label>
          <label class="field">体重(kg) <input type="number" step="0.1" id="bw-weight" required /></label>
          <label class="field"><span>体脂肪率(%)<span class="field-note-inline">(任意)</span></span> <input type="number" step="0.1" id="bw-body-fat" /></label>
        </div>
        <button type="submit">記録</button>
        <p id="bw-status"></p>
      </form>
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
        onSaved();
      } catch (err) {
        statusEl.textContent = `記録に失敗しました: ${errorMessage(err)}`;
      }
    });
  }
}
