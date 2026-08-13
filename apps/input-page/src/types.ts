export type { SetGroup, Exercise, ApiResponse } from 'shared';

// design.md §2.6「get_recent_logs」のレスポンス形式に対応(入力ページ固有)
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

export interface SetInput {
  weight: string;
  reps: string;
}
