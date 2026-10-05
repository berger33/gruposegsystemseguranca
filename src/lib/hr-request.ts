import { describeHrError, type HrErrorDescriptor } from './hr-vocabulary.mjs';

// UX-04: leitura e escrita do RH com estado honesto.
//
// Não altera contrato algum: mesma URL, mesmo método, mesmo corpo, mesmos
// cabeçalhos, mesmo `credentials: 'same-origin'` e mesma `Idempotency-Key`
// quando a chamada já a usava. A única diferença é que a falha volta
// DESCRITA, em vez de ser engolida por um `catch` que mostrava o código cru
// (`permission_scope_denied`) ou, pior, deixava a tela com indicadores zerados
// como se a resposta tivesse sido "nenhum registro".

export type HrResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: HrErrorDescriptor };

export async function hrRequest<T = unknown>(url: string, init: RequestInit = {}): Promise<HrResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
  } catch {
    return { ok: false, status: 0, error: describeHrError(null, 0) };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const code =
      payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : null;
    return { ok: false, status: response.status, error: describeHrError(code, response.status) };
  }
  return { ok: true, status: response.status, data: payload as T };
}

export type { HrErrorDescriptor };
