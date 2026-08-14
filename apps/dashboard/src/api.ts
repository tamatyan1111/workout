import type {
  ApiResponse,
  BodyWeightLog,
  Cycle,
  Exercise,
  Gender,
  LogRow,
  Profile,
  RecentLog,
  SetInput,
} from './types';

// ダッシュボードとAPIは同一オリジン(design.md §1)のため、絶対パスの相対参照で呼び出せる。
const API_DIR = '/api';

export class UnauthorizedError extends Error {}

async function parseResponse<T>(res: Response): Promise<T> {
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.ok || body.data === undefined) {
    if (res.status === 401) {
      throw new UnauthorizedError(body.error ?? 'ログインが必要です');
    }
    throw new Error(body.error ?? '通信に失敗しました');
  }
  return body.data;
}

async function callGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API_DIR}/${path}`, window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  const res = await fetch(url.toString(), { credentials: 'same-origin' });
  return parseResponse<T>(res);
}

// design.md §1.1「CSRF対策」: 単純なクロスサイトフォーム送信では付与できないカスタムヘッダーを付ける
async function callPost<T = void>(path: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_DIR}/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(payload),
  });
  return parseResponse<T>(res);
}

// ==== 認証(design.md §2.10「認証API」) ====

export const signup = (email: string, password: string, displayName: string): Promise<void> =>
  callPost('auth/signup.php', { email, password, display_name: displayName });

export const login = (email: string, password: string): Promise<void> =>
  callPost('auth/login.php', { email, password });

export const logout = (): Promise<void> => callPost('auth/logout.php', {});

export const googleLoginUrl = `${API_DIR}/auth/google_start.php`;

export const requestPasswordReset = (email: string): Promise<void> =>
  callPost('auth/password_reset_request.php', { email });

export const confirmPasswordReset = (token: string, newPassword: string): Promise<void> =>
  callPost('auth/password_reset_confirm.php', { token, new_password: newPassword });

// ==== プロフィール ====

export const getMe = (): Promise<Profile> => callGet<Profile>('get_me.php');

export const updateMe = (displayName: string, birthDate: string, gender: Gender): Promise<void> =>
  callPost('update_me.php', {
    display_name: displayName,
    birth_date: birthDate || undefined,
    gender,
  });

export const deleteAccount = (): Promise<void> => callPost('delete_account.php', {});

// design.md §3「設定タブ」US-17対応。<a href>によるページ遷移だと、Service Workerの
// SPAナビゲーションフォールバック(§design.md 相当の既知の落とし穴)に巻き込まれて
// index.htmlが返ってしまうことがあるため、fetch + Blobで明示的にダウンロードさせる
// (fetchはnavigateモードのリクエストではないため、Service Workerの当該フォールバックの
// 対象にならず、この問題を構造的に回避できる)。
export async function downloadExport(): Promise<void> {
  const res = await fetch(`${API_DIR}/export.php`, { credentials: 'same-origin' });
  if (!res.ok) {
    if (res.status === 401) {
      throw new UnauthorizedError('ログインが必要です');
    }
    throw new Error('エクスポートに失敗しました');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'workout_export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ==== サイクル ====

export const getCycles = (): Promise<Cycle[]> => callGet<{ cycles: Cycle[] }>('get_cycles.php').then((d) => d.cycles);

export const addCycle = (label: string): Promise<{ id: number }> => callPost('add_cycle.php', { label });

export const editCycle = (id: number, label: string): Promise<void> => callPost('edit_cycle.php', { id, label });

export const deleteCycle = (id: number): Promise<void> => callPost('delete_cycle.php', { id });

// ==== 管理表・種目 ====

export const getBoard = (): Promise<Exercise[]> =>
  callGet<{ exercises: Exercise[] }>('get_board.php').then((d) => d.exercises);

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

// ==== 記録ログ ====

export const getLogs = (exerciseId?: number, from?: string, to?: string): Promise<LogRow[]> =>
  callGet<{ logs: LogRow[] }>('get_logs.php', {
    exercise_id: exerciseId ? String(exerciseId) : '',
    date_from: from ?? '',
    date_to: to ?? '',
  }).then((d) => d.logs);

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

// ==== 体重の推移(design.md §2.6) ====

export const getBodyWeightLogs = (from?: string, to?: string): Promise<BodyWeightLog[]> =>
  callGet<{ logs: BodyWeightLog[] }>('get_body_weight_logs.php', {
    date_from: from ?? '',
    date_to: to ?? '',
  }).then((d) => d.logs);

export const addBodyWeightLog = (loggedDate: string, weight: string): Promise<void> =>
  callPost('add_body_weight_log.php', { logged_date: loggedDate, weight });

export const deleteBodyWeightLog = (id: number): Promise<void> => callPost('delete_body_weight_log.php', { id });
