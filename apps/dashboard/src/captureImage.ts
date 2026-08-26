import { toBlob } from 'html-to-image';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 運動・食事・プロフィール共通の「サマリーを画像化してクリップボードにコピー」処理
// (2026-08-20)。captureElの子要素のうち、class="capture-controls"が付いたもの
// (コピー用ボタン自体)は画像に含めない。
// 成功時は文字での通知(「コピーしました」)ではなく、ボタン自体の見た目(アイコンと色)を
// 一時的に変えることで伝える(2026-08-26、「文字ではなく見た目で分かるように」との要望)。
export async function captureElementToClipboard(
  captureEl: HTMLElement,
  buttonEl: HTMLButtonElement,
  statusEl: HTMLElement | null
): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    if (statusEl) statusEl.textContent = 'このブラウザは画像コピーに対応していません';
    return;
  }

  const originalContent = buttonEl.textContent;
  buttonEl.disabled = true;
  if (statusEl) statusEl.textContent = '画像を生成中...';
  try {
    const blob = await toBlob(captureEl, {
      backgroundColor: getComputedStyle(captureEl).backgroundColor,
      filter: (node) => !(node instanceof HTMLElement && node.classList.contains('capture-controls')),
    });
    if (!blob) throw new Error('画像の生成に失敗しました');
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    if (statusEl) statusEl.textContent = '';
    buttonEl.textContent = '✅';
    buttonEl.classList.add('capture-icon-btn-success');
  } catch (err) {
    if (statusEl) statusEl.textContent = `失敗: ${errorMessage(err)}`;
  } finally {
    setTimeout(() => {
      buttonEl.textContent = originalContent;
      buttonEl.classList.remove('capture-icon-btn-success');
      buttonEl.disabled = false;
      if (statusEl) statusEl.textContent = '';
    }, 2000);
  }
}
