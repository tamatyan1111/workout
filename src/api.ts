import type { ApiResponse, Exercise, LogRow } from './types';

// design.md §5 手順5で発行される、公開読み取りAPI(XServer)のURL
export const API_BASE_URL = 'https://workout.tamachan-blog.com/api-public';

async function callApi<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API_BASE_URL}/${path}`);
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
