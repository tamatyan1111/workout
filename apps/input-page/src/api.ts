import type { ApiResponse, Exercise, RecentLog, SetInput } from './types';

// 入力ページ本体と書き込みAPIは同じ秘密パス配下(同一オリジン)に置く(design.md §1.1)ため、
// 相対パスで呼び出せる。CORS対応も不要。
const API_DIR = 'api';

async function callGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API_DIR}/${path}`, window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  const res = await fetch(url.toString());
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.ok || body.data === undefined) {
    throw new Error(body.error ?? '通信に失敗しました');
  }
  return body.data;
}

async function callPost<T = void>(path: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_DIR}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.ok) {
    throw new Error(body.error ?? '送信に失敗しました');
  }
  return body.data as T;
}

export const getBoard = (): Promise<Exercise[]> =>
  callGet<{ exercises: Exercise[] }>('get_board.php').then((d) => d.exercises);

export const getRecentLogs = (limit = 20): Promise<RecentLog[]> =>
  callGet<{ logs: RecentLog[] }>('get_recent_logs.php', { limit: String(limit) }).then((d) => d.logs);

// レスポンスの ids (採番された記録ID。setsと同じ順序) を返す
export const addLog = (exerciseId: number, loggedDate: string, sets: SetInput[]): Promise<number[]> =>
  callPost<{ ids: number[] }>('add_log.php', {
    exercise_id: exerciseId,
    logged_date: loggedDate,
    sets: sets.map((s) => ({ weight: s.weight || undefined, reps: s.reps })),
  }).then((data) => data.ids);

export const editLog = (id: number, loggedDate: string, weight: string, reps: string): Promise<void> =>
  callPost('edit_log.php', { id, logged_date: loggedDate, weight: weight || undefined, reps });

export const deleteLog = (id: number): Promise<void> => callPost('delete_log.php', { id });

export const addExercise = (
  cycleId: number,
  name: string,
  targetWeight: string,
  targetReps: string,
  targetSets: string
): Promise<{ id: number }> =>
  callPost('add_exercise.php', {
    cycle_id: cycleId,
    name,
    target_weight: targetWeight || undefined,
    target_reps: targetReps || undefined,
    target_sets: targetSets || undefined,
  });

export const editExercise = (
  id: number,
  targetWeight: string,
  targetReps: string,
  targetSets: string,
  discontinued: boolean
): Promise<void> =>
  callPost('edit_exercise.php', {
    id,
    target_weight: targetWeight || undefined,
    target_reps: targetReps || undefined,
    target_sets: targetSets || undefined,
    discontinued,
  });

export const deleteExercise = (id: number): Promise<void> => callPost('delete_exercise.php', { id });
