import { describeCrmError, type CrmErrorDescriptor } from './crm-vocabulary.mjs';

// UX-03B: leitura/escrita do CRM com estado honesto.
//
// Não altera contrato algum: mesma URL, mesmo método, mesmo corpo, mesmos
// cabeçalhos. A única diferença é que a falha volta descrita, em vez de ser
// engolida por um `catch {}` que deixava a tela parecendo "zero registros".

export type CrmResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: CrmErrorDescriptor };

export async function crmRequest<T = any>(url: string, init?: RequestInit): Promise<CrmResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', ...init });
  } catch {
    return { ok: false, status: 0, error: describeCrmError('network', 0) };
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const code = payload && typeof payload.error === 'string' ? payload.error : null;
    return { ok: false, status: response.status, error: describeCrmError(code, response.status) };
  }
  return { ok: true, status: response.status, data: payload as T };
}

export type { CrmErrorDescriptor };
