import type { ApiResponse, Exercise, LogRow } from './types';

// 公開サイト自体もworkout.tamachan-blog.com直下でホストするため、同一オリジンの相対パスで呼び出せる
export const API_BASE_URL = '/api-public';

async function callApi<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API_BASE_URL}/${path}`, window.location.href);
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

export function getBoard(): Promise<Exercise[]> {
  return callApi<{ exercises: Exercise[] }>('get_board.php').then((d) => d.exercises);
}

export function getLogs(exerciseId?: number, from?: string, to?: string): Promise<LogRow[]> {
  return callApi<{ logs: LogRow[] }>('get_logs.php', {
    exercise_id: exerciseId ? String(exerciseId) : '',
    date_from: from ?? '',
    date_to: to ?? '',
  }).then((d) => d.logs);
}
