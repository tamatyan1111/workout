import { shortDateLabel, todayStr, weekdayLabel } from './date';
import { captureElementToClipboard } from './captureImage';

// 運動・食事・プロフィール各タブのサマリー共通のヘッダー(今日バッジ+日付ナビ+画像コピー)。
// 3ファイルに一字一句同じHTML・イベント配線がコピーされていたため共通化した(2026-08-29)。
// 日付は中央寄せ、「今日かどうか」の情報だけ左上のバッジに分離する(style.cssの
// .summary-headerがgrid-template-columns: 1fr auto 1frで実現)。
export function summaryHeaderHtml(currentDate: string): string {
  const isToday = currentDate === todayStr();
  return `
    <div class="summary-header">
      <span class="today-badge">${isToday ? '今日' : ''}</span>
      <div class="date-nav">
        <button type="button" class="date-nav-prev" aria-label="前の日" title="前の日">‹</button>
        <strong class="date-nav-current">${shortDateLabel(currentDate)}(${weekdayLabel(currentDate)})</strong>
        <button type="button" class="date-nav-next" aria-label="次の日" title="次の日" ${isToday ? 'disabled' : ''}>›</button>
      </div>
      <button type="button" class="capture-icon-btn" aria-label="画像をコピー" title="画像をコピー">📋</button>
    </div>
    <p class="capture-status"></p>
  `;
}

// summaryHeaderHtmlをcontainer.innerHTMLに反映した直後に呼ぶこと。
// onNavigate(-1)/onNavigate(1)で前の日/次の日への移動を呼び出し元に委ねる
// (呼び出し元ごとに「日付を進めてからどう再描画するか」が異なるため)。
export function wireSummaryHeader(container: HTMLElement, currentDate: string, onNavigate: (deltaDays: number) => void): void {
  const isToday = currentDate === todayStr();
  container.querySelector('.date-nav-prev')!.addEventListener('click', () => onNavigate(-1));
  container.querySelector<HTMLButtonElement>('.date-nav-next')!.addEventListener('click', () => {
    if (isToday) return;
    onNavigate(1);
  });
  container.querySelector<HTMLButtonElement>('.capture-icon-btn')!.addEventListener('click', (ev) => {
    const cardEl = container.closest<HTMLElement>('.card') ?? container;
    void captureElementToClipboard(cardEl, ev.currentTarget as HTMLButtonElement, container.querySelector('.capture-status'));
  });
}
