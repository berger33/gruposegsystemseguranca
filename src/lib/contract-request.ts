import { describeContractError, type ContractErrorDescriptor } from './contract-vocabulary.mjs';

// UX-07 (fatia C — Contratos): leitura e escrita de `/admin/contratos` e
// `/admin/contratos/[id]` com estado honesto.
//
// Não altera contrato algum de API: mesma URL, mesmo método, mesmo corpo,
// mesmo cabeçalho e mesma `credentials: 'same-origin'` que as telas já usavam.
// A diferença é que toda falha volta DESCRITA, em vez de um
// `Error(result.error || 'Operação indisponível.')` que jogava o código cru em
// inglês na cara de quem opera.

export type ContractResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ContractErrorDescriptor };

export async function contractRequest<T = unknown>(url: string, init: RequestInit = {}): Promise<ContractResult<T>> {
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
    return { ok: false, status: 0, error: describeContractError(null, 0) };
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
    return { ok: false, status: response.status, error: describeContractError(code, response.status) };
  }
  return { ok: true, status: response.status, data: payload as T };
}

export type { ContractErrorDescriptor };
