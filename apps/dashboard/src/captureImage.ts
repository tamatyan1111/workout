import { toBlob } from 'html-to-image';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 運動・食事・プロフィール共通の「サマリーを画像化してクリップボードにコピー」処理
// (2026-08-20)。captureElの子要素のうち、class="capture-controls"が付いたもの
// (コピー用ボタン自体)は画像に含めない。
export async function captureElementToClipboard(captureEl: HTMLElement, statusEl: HTMLElement | null): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    if (statusEl) statusEl.textContent = 'このブラウザは画像コピーに対応していません';
    return;
  }

  if (statusEl) statusEl.textContent = '画像を生成中...';
  try {
    const blob = await toBlob(captureEl, {
      backgroundColor: getComputedStyle(captureEl).backgroundColor,
      filter: (node) => !(node instanceof HTMLElement && node.classList.contains('capture-controls')),
    });
    if (!blob) throw new Error('画像の生成に失敗しました');
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    if (statusEl) statusEl.textContent = 'コピーしました';
  } catch (err) {
    if (statusEl) statusEl.textContent = `失敗: ${errorMessage(err)}`;
  } finally {
    setTimeout(() => {
      if (statusEl) statusEl.textContent = '';
    }, 3000);
  }
}
