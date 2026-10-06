// UX-07 / EXT-11 / F07 — transporte da família ANALYTICS.
//
// Devolve sempre um resultado discriminado. Falha de rede, resposta sem corpo
// JSON e status HTTP de erro viram `{ ok: false, error }` com o descritor já
// classificado pelo vocabulário. Nenhuma exceção crua chega à interface, e
// nenhuma falha pode ser confundida com lista vazia ou métrica zero.
//
// Esta camada NÃO decide autorização, NÃO acrescenta cabeçalho de
// idempotência por conta própria e NÃO reescreve URL, método ou corpo: quem
// chama continua responsável por preservar o contrato do servidor.

import { describeAnalyticsError, type AnalyticsErrorDescriptor } from './analytics-vocabulary.mjs';

export type AnalyticsResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: AnalyticsErrorDescriptor };

export async function analyticsRequest<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<AnalyticsResult<T>> {
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
    // `status: 0` é a falha de rede: estado próprio, nunca vazio.
    return { ok: false, status: 0, error: describeAnalyticsError(null, 0) };
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
    // Sem código legível o descritor ainda é honesto: o vocabulário diz que o
    // servidor respondeu com erro e mantém `code: null`, sem inventar motivo.
    return { ok: false, status: response.status, error: describeAnalyticsError(code, response.status) };
  }

  return { ok: true, status: response.status, data: payload as T };
}

export type { AnalyticsErrorDescriptor };
