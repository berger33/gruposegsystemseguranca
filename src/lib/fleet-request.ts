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

// ---------------------------------------------------------------------------
// UX-PRO-07F — leitura honesta: resposta 2xx sem a forma canônica nunca é
// ausência de registro, frota vazia ou dossiê vazio.
//
// `fleetRequest` acima permanece INTACTO (mesma URL, método, corpo, cabeçalhos,
// `credentials: 'same-origin'` e `cache: 'no-store'`); o que segue é
// acrescentado ao lado, sem alterar o comportamento de nenhuma escrita.
//
// O código abaixo é de diagnóstico DESTA tela — o servidor nunca o devolve —,
// por isso NÃO entra em `fleet-vocabulary.mjs`, que só traduz códigos que o
// servidor de frota realmente devolve. Mesma decisão da UX-PRO-07D-1 e da
// UX-PRO-07E-1.
// ---------------------------------------------------------------------------

export const INVALID_FLEET_RESPONSE = 'invalid_fleet_response';

/** Descritor de uma resposta 2xx que não trouxe a forma canônica esperada. */
export function invalidFleetResponse(status: number): FleetErrorDescriptor {
  return {
    kind: 'retry',
    title: 'A resposta da frota não pôde ser lida',
    detail: 'O servidor respondeu sem os dados esperados. Isto não significa que não existam veículos, histórico ou regras registradas.',
    code: INVALID_FLEET_RESPONSE,
    status,
    canRetry: true,
  };
}

/**
 * Leitura validada: mesma chamada de `fleetRequest` (que continua fazendo o
 * fetch); a única diferença é exigir a forma canônica `isValid` na resposta
 * 2xx, em vez de trocá-la por `{}`/`[]`. O servidor garante a forma no 200
 * (ex.: `vehicles`/`fleet_registered` em `src/server/ext-fleet-api.mjs:290` e
 * `rules` em `:814`), então o vazio legítimo continua sendo vazio concluído —
 * apenas o vazio FALSO deixa de existir.
 */
export async function fleetRead<T>(
  url: string,
  isValid: (data: unknown) => boolean,
): Promise<FleetResult<T>> {
  const result = await fleetRequest<T>(url);
  if (!result.ok) return result;
  if (!isValid(result.data)) {
    return { ok: false, status: result.status, error: invalidFleetResponse(result.status), payload: result.data };
  }
  return result;
}
