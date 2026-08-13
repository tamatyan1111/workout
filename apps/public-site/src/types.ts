export type { SetGroup, Exercise, ApiResponse } from 'shared';

// design.md §2.3「logs テーブル」に対応(公開サイト固有)
export interface LogRow {
  id: number;
  exercise_id: number;
  logged_date: string;
  set_number: number;
  weight: number | null;
  reps: number;
}
