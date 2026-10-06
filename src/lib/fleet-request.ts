// UX-07 / EXT-01 — transporte da família FROTA.
//
// Devolve sempre um resultado discriminado. Falha de rede, resposta sem corpo
// JSON e status HTTP de erro viram `{ ok: false, error }` com o descritor já
// classificado pelo vocabulário. Nenhuma exceção crua chega à interface, e
// nenhuma falha pode ser confundida com frota vazia, custo zero ou
// quilometragem zero.
//
// Em falha, `payload` carrega o corpo CRU da resposta (quando houve), porque
// o servidor de frota acrescenta informação estruturada junto do código — por
// exemplo `use: "/api/ext/fleet/vehicles/<id>/fuel-logs"` em
// `legacy_route_retired`. A camada não interpreta esse corpo: quem apresenta
// decide com o vocabulário.
//
// Esta camada NÃO decide autorização, NÃO acrescenta cabeçalho de
// idempotência por conta própria e NÃO reescreve URL, método ou corpo: quem
// chama continua responsável por preservar o contrato do servidor.

import { describeFleetError, type FleetErrorDescriptor } from './fleet-vocabulary.mjs';

export type FleetResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: FleetErrorDescriptor; payload: unknown };

export async function fleetRequest<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<FleetResult<T>> {
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
    return { ok: false, status: 0, error: describeFleetError(null, 0), payload: null };
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
    return { ok: false, status: response.status, error: describeFleetError(code, response.status), payload };
  }

  return { ok: true, status: response.status, data: payload as T };
}

export type { FleetErrorDescriptor };
