// design.md §2「データモデル」に対応する、ダッシュボードアプリ全体で使う共通の型。

export interface SetGroup {
  weight: number | null;
  reps: number;
  sets: number;
}

// design.md §2.4「exercises テーブル」+ 2.9「現在値」に対応
export interface Exercise {
  id: number;
  cycle: { id: number; label: string };
  is_discontinued: boolean;
  name: string;
  is_weight_based: boolean;
  target: { weight: number | null; reps: number | null; sets: number | null };
  current: SetGroup[];
}

// design.md §2.3「cycles テーブル」に対応。ユーザーごとに自由に作成できる
export interface Cycle {
  id: number;
  label: string;
}

export type Gender = 'male' | 'female' | 'unspecified';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';

// design.md §2.1「users テーブル」のうちプロフィールとして編集可能な項目(get_me/update_meのやり取り)
export interface Profile {
  display_name: string;
  email: string | null;
  birth_date: string | null;
  gender: Gender;
  height_cm: number | null;
  activity_level: ActivityLevel | null;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
