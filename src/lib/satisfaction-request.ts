// UX-07 / EXT-06 — transporte da família SATISFAÇÃO.
//
// Devolve sempre um resultado discriminado. Falha de rede, resposta sem corpo
// JSON e status HTTP de erro viram `{ ok: false, error }` com o descritor já
// classificado pelo vocabulário. Nenhuma exceção crua chega à interface, e
// nenhuma falha pode ser confundida com lista vazia ou indicador zero.
//
// Em falha, `payload` carrega o corpo cru da resposta (quando houve), porque
// o servidor de satisfação acrescenta informação estruturada junto do código —
// por exemplo `canonical` em `legacy_mutation_retired`. A camada não
// interpreta esse corpo: quem apresenta decide com o vocabulário.
//
// Esta camada NÃO decide autorização, NÃO acrescenta cabeçalho de
// idempotência por conta própria e NÃO reescreve URL, método ou corpo: quem
// chama continua responsável por preservar o contrato do servidor.

import { describeSatisfactionError, type SatisfactionErrorDescriptor } from './satisfaction-vocabulary.mjs';

export type SatisfactionResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: SatisfactionErrorDescriptor; payload: unknown };

export async function satisfactionRequest<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<SatisfactionResult<T>> {
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
    return { ok: false, status: 0, error: describeSatisfactionError(null, 0), payload: null };
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
    return { ok: false, status: response.status, error: describeSatisfactionError(code, response.status), payload };
  }

  return { ok: true, status: response.status, data: payload as T };
}

export type { SatisfactionErrorDescriptor };

// UX-PRO-07J — leitura honesta (aditivo): 2xx sem a forma canônica nunca é
// ausência de pesquisa. `satisfactionRequest` acima permanece INTACTO. O
// código abaixo é diagnóstico desta tela (o servidor nunca o devolve), fora
// do vocabulário anti-deriva. Mesma decisão da UX-PRO-07F/07G/07H/07I.
export const INVALID_SATISFACTION_RESPONSE = 'invalid_satisfaction_response';
export function invalidSatisfactionResponse(status: number): SatisfactionErrorDescriptor {
  return {
    kind: 'retry',
    title: 'A resposta de satisfação não pôde ser lida',
    detail: 'O servidor respondeu sem os dados esperados. Isto não significa que não existam pesquisas, respostas ou acompanhamentos registrados.',
    code: INVALID_SATISFACTION_RESPONSE,
    status,
    canRetry: true,
  };
}
export async function satisfactionRead<T>(
  url: string,
  isValid: (data: unknown) => boolean,
): Promise<SatisfactionResult<T>> {
  const result = await satisfactionRequest<T>(url);
  if (!result.ok) return result;
  if (!isValid(result.data)) {
    return { ok: false, status: result.status, error: invalidSatisfactionResponse(result.status), payload: result.data };
  }
  return result;
}
