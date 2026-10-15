// UX-07 / EXT-02 — transporte da família TERCEIROS.
//
// Devolve sempre um resultado discriminado. Falha de rede, resposta sem corpo
// JSON e status HTTP de erro viram `{ ok: false, error }` com o descritor já
// classificado pelo vocabulário. Nenhuma exceção crua chega à interface, e
// nenhuma falha pode ser confundida com lista vazia de terceiros, ausência de
// janela de acesso ou nota zero.
//
// Em falha, `payload` carrega o corpo CRU da resposta (quando houve), porque
// o servidor de terceiros acrescenta informação estruturada junto do código:
//   - `use` em `legacy_route_retired`;
//   - `grant_id` em `contract_rebind_blocked_by_active_grant`;
//   - `status` em `third_party_not_active`;
//   - `contract_status` / `service_order_status` e `blocking_statuses` em
//     `contract_not_grantable` e `service_order_not_grantable`;
//   - `note` em `contract_not_bound_to_third_party` e
//     `service_order_outside_contract`.
// A camada não interpreta esse corpo: quem apresenta decide com o vocabulário.
//
// Esta camada NÃO decide autorização, NÃO acrescenta cabeçalho de
// idempotência por conta própria e NÃO reescreve URL, método ou corpo: quem
// chama continua responsável por preservar o contrato do servidor.

import { describeThirdPartyError, type ThirdPartyErrorDescriptor } from './third-party-vocabulary.mjs';

export type ThirdPartyResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ThirdPartyErrorDescriptor; payload: unknown };

export async function thirdPartyRequest<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<ThirdPartyResult<T>> {
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
    return { ok: false, status: 0, error: describeThirdPartyError(null, 0), payload: null };
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
    return { ok: false, status: response.status, error: describeThirdPartyError(code, response.status), payload };
  }

  return { ok: true, status: response.status, data: payload as T };
}

export type { ThirdPartyErrorDescriptor };

// ---------------------------------------------------------------------------
// UX-PRO-07G — leitura honesta: resposta 2xx sem a forma canônica nunca é
// ausência de registro. `thirdPartyRequest` acima permanece INTACTO; o código
// abaixo é diagnóstico DESTA tela (o servidor nunca o devolve), por isso NÃO
// entra em `third-party-vocabulary.mjs`. Mesma decisão da UX-PRO-07F/07E-1.
// ---------------------------------------------------------------------------

export const INVALID_THIRD_PARTY_RESPONSE = 'invalid_third_party_response';

export function invalidThirdPartyResponse(status: number): ThirdPartyErrorDescriptor {
  return {
    kind: 'retry',
    title: 'A resposta de terceiros não pôde ser lida',
    detail: 'O servidor respondeu sem os dados esperados. Isto não significa que não existam terceiros, janelas ou avaliações registradas.',
    code: INVALID_THIRD_PARTY_RESPONSE,
    status,
    canRetry: true,
  };
}

export async function thirdPartyRead<T>(
  url: string,
  isValid: (data: unknown) => boolean,
): Promise<ThirdPartyResult<T>> {
  const result = await thirdPartyRequest<T>(url);
  if (!result.ok) return result;
  if (!isValid(result.data)) {
    return { ok: false, status: result.status, error: invalidThirdPartyResponse(result.status), payload: result.data };
  }
  return result;
}
