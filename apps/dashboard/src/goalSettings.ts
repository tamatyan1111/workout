import { addNutritionGoal, getNutritionSummary } from './api';
import type { NutritionSummary, PfcMode } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const PFC_MODE_LABELS: Record<PfcMode, string> = {
  standard: '標準(P15% / F25% / C60%)',
  bulk: '筋トレ向き(たんぱく質 体重×1.8g/kg)',
  cut: '減量向き(たんぱく質 体重×2.0g/kg)',
  custom: 'カスタム(グラム数で指定)',
  custom_ratio: 'カスタム(比率で指定)',
};

// design.md §2.17対応。目標体重・達成期日・PFC配分方式の設定フォーム。プロフィールタブの
// 詳細画面。食事タブのサマリー(nutritionSummary.ts)は見るだけにするため、編集はここに
// 分離してある(2026-08-16、ユーザー要望)。カスタムはグラム数指定に加え、比率(%)指定にも
// 対応する(2026-08-16、standardの15/25/60%をユーザー指定の比率に置き換えたものという位置づけ)。
export function renderGoalSettings(container: HTMLElement): void {
  container.innerHTML = '<p>読み込み中...</p>';

  void getNutritionSummary()
    .then((summary) => draw(summary))
    .catch((err) => {
      container.innerHTML = `<p class="error">目標の取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    });

  function draw(summary: NutritionSummary): void {
    const goal = summary.goal;

    container.innerHTML = `
      ${goal ? `<p class="field-note">現在の目標: ${goal.target_weight.toFixed(1)}kg / ${escapeHtml(goal.target_date)}まで</p>` : '<p>目標がまだ設定されていません</p>'}
      <form id="goal-form">
        <div class="field-row">
          <label class="field">目標体重(kg) <input type="number" step="0.1" id="goal-weight" required /></label>
          <label class="field"><span>目標体脂肪率(%)<span class="field-note-inline">(任意)</span></span> <input type="number" step="0.1" id="goal-body-fat" /></label>
        </div>
        <div class="field-row">
          <label class="field">達成期日 <input type="date" id="goal-date" required /></label>
          <label class="field">PFC配分方式
            <select id="goal-pfc-mode">
              ${(Object.keys(PFC_MODE_LABELS) as PfcMode[])
                .map((m) => `<option value="${m}" ${m === (goal?.pfc_mode ?? 'standard') ? 'selected' : ''}>${escapeHtml(PFC_MODE_LABELS[m])}</option>`)
                .join('')}
            </select>
          </label>
        </div>
        <div id="custom-pfc-fields" class="field-row" hidden>
          <label class="field">たんぱく質(g) <input type="number" step="0.1" id="goal-custom-protein" /></label>
          <label class="field">脂質(g) <input type="number" step="0.1" id="goal-custom-fat" /></label>
          <label class="field">炭水化物(g) <input type="number" step="0.1" id="goal-custom-carb" /></label>
        </div>
        <div id="custom-ratio-fields" class="field-row" hidden>
          <label class="field">たんぱく質(%) <input type="number" step="0.1" id="goal-ratio-protein" /></label>
          <label class="field">脂質(%) <input type="number" step="0.1" id="goal-ratio-fat" /></label>
          <label class="field">炭水化物(%) <input type="number" step="0.1" id="goal-ratio-carb" /></label>
        </div>
        <p id="ratio-sum-status" class="field-note"></p>
        <button type="submit">保存</button>
        <p id="goal-status"></p>
      </form>
    `;

    const modeSelect = container.querySelector<HTMLSelectElement>('#goal-pfc-mode')!;
    const customFields = container.querySelector<HTMLElement>('#custom-pfc-fields')!;
    const ratioFields = container.querySelector<HTMLElement>('#custom-ratio-fields')!;
    const ratioSumStatus = container.querySelector<HTMLParagraphElement>('#ratio-sum-status')!;
    const ratioCarb = container.querySelector<HTMLInputElement>('#goal-ratio-carb')!;
    const ratioProtein = container.querySelector<HTMLInputElement>('#goal-ratio-protein')!;
    const ratioFat = container.querySelector<HTMLInputElement>('#goal-ratio-fat')!;

    const syncFieldsVisibility = () => {
      customFields.hidden = modeSelect.value !== 'custom';
      ratioFields.hidden = modeSelect.value !== 'custom_ratio';
      updateRatioSum();
    };

    // 3つの比率の合計が100%になっているかをその場で確認できるようにする
    function updateRatioSum(): void {
      if (modeSelect.value !== 'custom_ratio') {
        ratioSumStatus.textContent = '';
        return;
      }
      const sum = (Number(ratioCarb.value) || 0) + (Number(ratioProtein.value) || 0) + (Number(ratioFat.value) || 0);
      ratioSumStatus.textContent = `合計: ${Math.round(sum * 10) / 10}%(3つの合計が100%になるようにしてください)`;
      ratioSumStatus.classList.toggle('error', Math.abs(sum - 100) > 0.5);
    }

    syncFieldsVisibility();
    modeSelect.addEventListener('change', syncFieldsVisibility);
    [ratioCarb, ratioProtein, ratioFat].forEach((input) => input.addEventListener('input', updateRatioSum));

    container.querySelector<HTMLFormElement>('#goal-form')!.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const statusEl = container.querySelector<HTMLParagraphElement>('#goal-status')!;
      const targetWeight = container.querySelector<HTMLInputElement>('#goal-weight')!.value;
      const targetBodyFatPercentage = container.querySelector<HTMLInputElement>('#goal-body-fat')!.value;
      const targetDate = container.querySelector<HTMLInputElement>('#goal-date')!.value;
      const pfcMode = modeSelect.value as PfcMode;
      const customProtein = container.querySelector<HTMLInputElement>('#goal-custom-protein')!.value;
      const customFat = container.querySelector<HTMLInputElement>('#goal-custom-fat')!.value;
      const customCarb = container.querySelector<HTMLInputElement>('#goal-custom-carb')!.value;
      statusEl.textContent = '保存中...';
      try {
        await addNutritionGoal(
          targetWeight,
          targetDate,
          pfcMode,
          customProtein,
          customFat,
          customCarb,
          targetBodyFatPercentage,
          ratioProtein.value,
          ratioFat.value,
          ratioCarb.value
        );
        void getNutritionSummary().then((s) => draw(s));
      } catch (err) {
        statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
      }
    });
  }
}
