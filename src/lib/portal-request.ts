import { describePortalError, type PortalErrorDescriptor } from './portal-vocabulary.mjs';

// UX-06: leitura e escrita dos portais (funcionário e cliente) com estado
// honesto.
//
// Não altera contrato algum: mesma URL, mesmo método, mesmo corpo, mesmos
// cabeçalhos, mesmo `credentials: 'same-origin'` e mesma `Idempotency-Key`
// quando a chamada já a usava. A diferença é que a falha volta DESCRITA, em
// vez de ser engolida por um `catch` que devolvia a tela de login (portal do
// funcionário) ou uma lista vazia com texto de negócio inventado (área do
// cliente).

export type PortalResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: PortalErrorDescriptor };

export async function portalRequest<T = unknown>(url: string, init: RequestInit = {}): Promise<PortalResult<T>> {
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
    // A requisição não chegou a ser respondida. Isto NÃO é "não há registros".
    return { ok: false, status: 0, error: describePortalError(null, 0) };
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
    return { ok: false, status: response.status, error: describePortalError(code, response.status) };
  }
  return { ok: true, status: response.status, data: payload as T };
}

export type { PortalErrorDescriptor };
