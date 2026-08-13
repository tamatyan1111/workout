export const CYCLE_LABELS: Record<number, string> = {
  1: 'サイクル1: Push',
  2: 'サイクル2: Pull',
  3: 'サイクル3: Legs',
  4: 'サイクル4: Rest',
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
