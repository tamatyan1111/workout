// design.md §2.6「API仕様」に対応

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

// design.md §2.3「logs テーブル」に対応
export interface LogRow {
  id: number;
  exercise_id: number;
  logged_date: string;
  set_number: number;
  weight: number | null;
  reps: number;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
