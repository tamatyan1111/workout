export function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// dateStr(YYYY-MM-DD)にdays日を加減した日付を返す(サマリー画面の日付切り替えナビ用)。
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// dateStr(YYYY-MM-DD)の曜日を1文字で返す(サマリー画面の日付ナビ表示用、2026-08-20)。
export function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
}

// dateStr(YYYY-MM-DD)を「M/D」形式に短縮する(サマリーの日付ナビをスマホの横幅に
// 収めるため、年は省く。2026-08-21)。
export function shortDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}
