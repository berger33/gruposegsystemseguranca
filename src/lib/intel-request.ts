import { describeIntelError, type IntelErrorDescriptor } from './intel-vocabulary.mjs';

export type IntelResult<T> = { ok: true; data: T } | { ok: false; error: IntelErrorDescriptor };

export async function intelRequest<T = unknown>(url: string, init: RequestInit = {}): Promise<IntelResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store', credentials: 'same-origin', ...init,
      headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) },
    });
  } catch { return { ok: false, error: describeIntelError(null, 0) }; }
  let payload: unknown = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const code = payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string' ? (payload as { error: string }).error : null;
    return { ok: false, error: describeIntelError(code, response.status) };
  }
  return { ok: true, data: payload as T };
}
export type { IntelErrorDescriptor };
