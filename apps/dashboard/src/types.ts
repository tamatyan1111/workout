export type { SetGroup, Exercise, Cycle, Profile, Gender, ApiResponse } from 'shared';

// design.md §2.10「get_recent_logs」のレスポンス形式に対応
export interface RecentLog {
  id: number;
  exercise_id: number;
  exercise_name: string;
  cycle_id: number | null;
  logged_date: string;
  set_number: number;
  weight: number | null;
  reps: number;
}

// design.md §2.5「logs テーブル」に対応(グラフ用)
export interface LogRow {
  id: number;
  exercise_id: number;
  logged_date: string;
  set_number: number;
  weight: number | null;
  reps: number;
}

// design.md §2.6「body_weight_logs テーブル」に対応
export interface BodyWeightLog {
  id: number;
  logged_date: string;
  weight: number;
}

export interface SetInput {
  weight: string;
  reps: string;
}
