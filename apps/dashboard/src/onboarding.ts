import { addCycle } from './api';
import { escapeHtml } from 'shared';

// design.md §2.7「サイクル初期設定テンプレート」対応。種目は含まず、サイクルの構成のみを一括登録する。
const TEMPLATES: { name: string; cycles: string[] }[] = [
  { name: '4分割 (Push / Pull / Legs / Rest)', cycles: ['Push', 'Pull', 'Legs', 'Rest'] },
  { name: '3分割 (Push / Pull / Legs)', cycles: ['Push', 'Pull', 'Legs'] },
  { name: '2分割 (Upper / Lower)', cycles: ['Upper', 'Lower'] },
  { name: 'フルボディ', cycles: ['Full Body'] },
];

// design.md §3「初回ログイン(サイクルが1件も無いユーザー)時: オンボーディング画面」対応。
// 完了したらonDoneを呼び、通常のダッシュボードへの遷移をmain.ts側に委ねる。
export function renderOnboarding(container: HTMLElement, onDone: () => void): void {
  const customCycles: string[] = [];
  let showCustomForm = false;

  function draw(): void {
    container.innerHTML = `
      <div class="onboarding-screen">
        <h1>ようこそ</h1>
        <p>まずはトレーニングのサイクル構成を決めましょう。あとから設定画面で追加・変更できます。</p>
        <div class="template-list">
          ${TEMPLATES.map(
            (t, i) => `
            <button type="button" class="template-card" data-template="${i}">
              <strong>${escapeHtml(t.name)}</strong>
              <span>${t.cycles.map(escapeHtml).join(' / ')}</span>
            </button>
          `
          ).join('')}
          <button type="button" class="template-card" data-template="custom">
            <strong>ゼロから作る</strong>
          </button>
        </div>
        ${showCustomForm ? renderCustomForm() : ''}
        <p id="onboarding-status"></p>
      </div>
    `;

    container.querySelectorAll<HTMLButtonElement>('.template-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.template === 'custom') {
          showCustomForm = true;
          draw();
          return;
        }
        const template = TEMPLATES[Number(btn.dataset.template)];
        void applyCycles(template.cycles);
      });
    });

    if (showCustomForm) {
      bindCustomForm();
    }
  }

  function renderCustomForm(): string {
    return `
      <form id="custom-cycle-form">
        <label>サイクル名 <input type="text" id="custom-cycle-name" required /></label>
        <button type="submit">追加</button>
      </form>
      <ul id="custom-cycle-list">
        ${customCycles.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}
      </ul>
      <button type="button" id="custom-cycle-done" ${customCycles.length === 0 ? 'disabled' : ''}>完了</button>
    `;
  }

  function bindCustomForm(): void {
    container.querySelector<HTMLFormElement>('#custom-cycle-form')!.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const input = container.querySelector<HTMLInputElement>('#custom-cycle-name')!;
      const name = input.value.trim();
      if (!name || customCycles.includes(name)) return;
      customCycles.push(name);
      draw();
    });
    container.querySelector('#custom-cycle-done')?.addEventListener('click', () => {
      void applyCycles(customCycles);
    });
  }

  async function applyCycles(labels: string[]): Promise<void> {
    const statusEl = container.querySelector<HTMLParagraphElement>('#onboarding-status');
    if (statusEl) statusEl.textContent = '設定中...';
    try {
      for (const label of labels) {
        await addCycle(label);
      }
      onDone();
    } catch (err) {
      if (statusEl) statusEl.textContent = `設定に失敗しました: ${String(err instanceof Error ? err.message : err)}`;
    }
  }

  draw();
}
