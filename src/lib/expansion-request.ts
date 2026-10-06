// UX-10 / EXT-09 — transporte da família EXPANSÃO.
//
// Devolve sempre um resultado discriminado. Falha de rede, resposta sem corpo
// JSON e status HTTP de erro viram `{ ok: false, error }` com o descritor já
// classificado pelo vocabulário. Nenhuma exceção crua chega à interface, e
// nenhuma falha pode ser confundida com lista vazia ou métrica zero.
//
// Em falha, `payload` carrega o corpo cru da resposta (quando houve), porque o
// servidor de expansão acrescenta informação ao lado do código — por exemplo
// `message` com as transições permitidas em `invalid_transition`, e
// `required`/`current` em `forbidden_role`. Esta camada não interpreta esse
// corpo: quem apresenta decide, usando o vocabulário.
//
// Esta camada NÃO decide autorização, NÃO acrescenta cabeçalho de idempotência
// por conta própria e NÃO reescreve URL, método ou corpo: quem chama continua
// responsável por preservar o contrato do servidor.

import { describeExpansionError, type ExpansionErrorDescriptor } from './expansion-vocabulary.mjs';

export type ExpansionResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ExpansionErrorDescriptor; payload: unknown };

export async function expansionRequest<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<ExpansionResult<T>> {
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
    return { ok: false, status: 0, error: describeExpansionError(null, 0), payload: null };
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
    // Sem código legível o descritor ainda é honesto: mantém `code: null` e
    // não inventa motivo.
    return { ok: false, status: response.status, error: describeExpansionError(code, response.status), payload };
  }

  return { ok: true, status: response.status, data: payload as T };
}

/** Mensagem complementar que o servidor envia junto do código, quando envia. */
export function expansionServerMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const message = (payload as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message.trim() : '';
}

export type { ExpansionErrorDescriptor };
