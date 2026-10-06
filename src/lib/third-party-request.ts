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
