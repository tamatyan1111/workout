// design.md §2.1「管理表(マスタ)シート」に対応
export interface BoardRow {
  'サイクル': number;
  '分類': string;
  '種目名': string;
  '現在の記録': string;
  '目標重量(kg)': number | string;
  '目標回数': number | string;
  '目標セット': number | string;
}

// design.md §2.2「記録ログシート」に対応
export interface LogRow {
  '記録ID': string;
  '日付': string;
  '種目名': string;
  'セット番号': number;
  '重量(kg)': number | string;
  '回数': number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
