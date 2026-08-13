// design.md §2.6「API仕様」に対応。apps/input-page・apps/public-site の両方から使う共通の型。

export interface SetGroup {
  weight: number | null;
  reps: number;
  sets: number;
}

// design.md §2.2「exercises テーブル」+ 2.5「現在値」に対応
export interface Exercise {
  id: number;
  cycle: { id: number; label: string };
  is_discontinued: boolean;
  name: string;
  is_weight_based: boolean;
  target: { weight: number | null; reps: number | null; sets: number | null };
  current: SetGroup[];
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
