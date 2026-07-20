import type { ApiResponse, BoardRow, LogRow } from './types';

// design.md §5 手順4で発行されるProject A(公開読み取り用)のURLに置き換える
export const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbwIgSClDFkwIpUItYSoT_eZaY08zPGNDdUPjA_76wN3Ehl1PmoAif46F9Flg0qbOWWc/exec';

async function callApi<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API_BASE_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const res = await fetch(url.toString());
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success || body.data === undefined) {
    throw new Error(body.error ?? '通信に失敗しました');
  }
  return body.data;
}

export function getBoard(): Promise<BoardRow[]> {
  return callApi<BoardRow[]>('getBoard');
}

export function getLogs(exercise: string, from?: string, to?: string): Promise<LogRow[]> {
  return callApi<LogRow[]>('getLogs', { exercise, from: from ?? '', to: to ?? '' });
}
