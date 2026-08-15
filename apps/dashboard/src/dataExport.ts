import { downloadExport } from './api';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §3「プロフィールタブ」対応。記録・体重データのCSVエクスポート(US-17)。
export function renderDataExport(container: HTMLElement): void {
  container.innerHTML = `
    <button type="button" id="export-btn">記録・体重データをCSVでダウンロード</button>
    <p id="export-status"></p>
  `;

  container.querySelector('#export-btn')!.addEventListener('click', async () => {
    const statusEl = container.querySelector<HTMLParagraphElement>('#export-status')!;
    statusEl.textContent = 'ダウンロード中...';
    try {
      await downloadExport();
      statusEl.textContent = '';
    } catch (err) {
      statusEl.textContent = `ダウンロードに失敗しました: ${errorMessage(err)}`;
    }
  });
}
