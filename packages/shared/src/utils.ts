// design.md §2.1「cycles テーブル」のラベルそのもの(DBのcycle.labelと同じ値)。
// 「サイクル1: Push」のような接頭辞付き表記が欲しい場合は、呼び出し側で組み立てる。
export const CYCLE_LABELS: Record<number, string> = {
  1: 'Push',
  2: 'Pull',
  3: 'Legs',
  4: 'Rest',
};

export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}
