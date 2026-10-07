// RAG-01 — transporte canônico do assistente. Toda chamada do assistente passa
// por aqui: um único ponto com credenciais same-origin, timeout, leitura de
// JSON tolerante e tradução de erro. Nenhum componente usa fetch direto.
import { describeRagError, type RagErrorDescriptor } from './rag-vocabulary.mjs';

export type RagResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: RagErrorDescriptor; payload: unknown };

export async function ragRequest<T = unknown>(url: string, init: RequestInit = {}, timeoutMs = 90_000): Promise<RagResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) },
    });
  } catch {
    return { ok: false, status: 0, error: describeRagError(null, 0), payload: null };
  }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* resposta sem corpo JSON */ }
  if (!response.ok) {
    const code = payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string' ? (payload as { error: string }).error : null;
    return { ok: false, status: response.status, error: describeRagError(code, response.status), payload };
  }
  return { ok: true, status: response.status, data: payload as T };
}
