import { describeAnalyticsError, type AnalyticsErrorDescriptor } from './analytics-vocabulary.mjs';

export type AnalyticsResult<T> = { ok: true; data: T } | { ok: false; error: AnalyticsErrorDescriptor };

// Falha de rede e status HTTP viram resultado discriminado; nenhuma exceção
// crua chega à interface e nenhuma falha vira lista vazia.
export async function analyticsRequest<T = unknown>(url: string, init: RequestInit = {}): Promise<AnalyticsResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) },
    });
  } catch {
    return { ok: false, error: describeAnalyticsError(null, 0) };
  }
  let payload: unknown = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const code = payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string' ? (payload as { error: string }).error : null;
    return { ok: false, error: describeAnalyticsError(code, response.status) };
  }
  return { ok: true, data: payload as T };
}

export type { AnalyticsErrorDescriptor };
