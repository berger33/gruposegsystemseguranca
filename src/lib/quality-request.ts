// UX-07 / EXT-05 — transporte da família QUALIDADE.
//
// Devolve sempre um resultado discriminado. Falha de rede, resposta sem corpo
// JSON e status HTTP de erro viram `{ ok: false, error }` com o descritor já
// classificado pelo vocabulário. Nenhuma exceção crua chega à interface, e
// nenhuma falha pode ser confundida com lista vazia ou métrica zero.
//
// Em falha, `payload` carrega o corpo cru da resposta (quando houve), porque o
// servidor de qualidade devolve informação adicional junto do código — por
// exemplo, o array `missing` de `closure_prerequisites_missing` e o
// `previous_status` de `invalid_status_transition`. A camada não interpreta
// esse corpo: quem apresenta decide com o vocabulário.
//
// Esta camada NÃO decide autorização, NÃO acrescenta cabeçalho de
// idempotência por conta própria e NÃO reescreve URL, método ou corpo: quem
// chama continua responsável por preservar o contrato do servidor.

import { describeQualityError, type QualityErrorDescriptor } from './quality-vocabulary.mjs';

export type QualityResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: QualityErrorDescriptor; payload: unknown };

export async function qualityRequest<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<QualityResult<T>> {
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
    return { ok: false, status: 0, error: describeQualityError(null, 0), payload: null };
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
    return { ok: false, status: response.status, error: describeQualityError(code, response.status), payload };
  }

  return { ok: true, status: response.status, data: payload as T };
}

export type { QualityErrorDescriptor };
