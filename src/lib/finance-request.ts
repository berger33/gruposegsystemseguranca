import { describeFinanceError, type FinanceErrorDescriptor } from './finance-vocabulary.mjs';

// UX-07 (fatia B — Financeiro): leitura e escrita de `/admin/financeiro` com
// estado honesto.
//
// Não altera contrato algum: mesma URL, mesmo método, mesmo corpo, mesmo
// cabeçalho e mesma `credentials: 'same-origin'` que a tela já usava. A
// diferença é que toda falha volta DESCRITA, em vez de um
// `Error(data.error || \`Erro ${response.status}\`)` que jogava o código cru
// em inglês na cara de quem opera.

export type FinanceResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: FinanceErrorDescriptor };

export async function financeRequest<T = unknown>(url: string, init: RequestInit = {}): Promise<FinanceResult<T>> {
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
    return { ok: false, status: 0, error: describeFinanceError(null, 0) };
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
    return { ok: false, status: response.status, error: describeFinanceError(code, response.status) };
  }
  return { ok: true, status: response.status, data: payload as T };
}

export type { FinanceErrorDescriptor };
