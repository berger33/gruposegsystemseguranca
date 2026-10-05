import { describeOpsError, type OpsErrorDescriptor } from './ops-vocabulary.mjs';

// UX-07 (fatia A — Operação): leitura e escrita de `/admin/operacao` com
// estado honesto.
//
// Não altera contrato algum: mesma URL, mesmo método, mesmo corpo, mesmo
// cabeçalho e mesma `credentials: 'same-origin'` que a tela já usava. A
// diferença é que toda falha volta DESCRITA, em vez de um `Error(err.message
// || "Falha ao carregar.")` que escondia o código devolvido pelo servidor.

export type OpsResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: OpsErrorDescriptor };

export async function opsRequest<T = unknown>(url: string, init: RequestInit = {}): Promise<OpsResult<T>> {
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
    // A requisição não chegou a ser respondida. Isto NÃO é "zero registros".
    return { ok: false, status: 0, error: describeOpsError(null, 0) };
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
    return { ok: false, status: response.status, error: describeOpsError(code, response.status) };
  }
  return { ok: true, status: response.status, data: payload as T };
}

export type { OpsErrorDescriptor };
