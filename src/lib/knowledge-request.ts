// UX-PRO-08A / EXT-08 — transporte da família CONHECIMENTO.
//
// Devolve sempre um resultado discriminado. Falha de rede, resposta sem corpo
// JSON e status HTTP de erro viram `{ ok: false, error }` com o descritor já
// classificado pelo vocabulário. Nenhuma exceção crua chega à interface, e
// nenhuma falha pode ser confundida com lista vazia ou procedimento ausente.
//
// Em falha, `payload` carrega o corpo cru da resposta (quando houve).
// Esta camada NÃO decide autorização, NÃO acrescenta cabeçalho de
// idempotência por conta própria e NÃO reescreve URL, método ou corpo: quem
// chama continua responsável por preservar o contrato do servidor.

import { describeKnowledgeError, type KnowledgeErrorDescriptor } from './knowledge-vocabulary.mjs';

export type KnowledgeResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: KnowledgeErrorDescriptor; payload: unknown };

export async function knowledgeRequest<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<KnowledgeResult<T>> {
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
    return { ok: false, status: 0, error: describeKnowledgeError(null, 0), payload: null };
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
    return { ok: false, status: response.status, error: describeKnowledgeError(code, response.status), payload };
  }

  return { ok: true, status: response.status, data: payload as T };
}

export type { KnowledgeErrorDescriptor };

// UX-PRO-08A — leitura honesta (aditivo): 2xx sem a forma canônica nunca é
// ausência de procedimento, versão ou ciência. `knowledgeRequest` acima permanece INTACTO.
// O código abaixo é diagnóstico desta tela (o servidor nunca o devolve), fora
// do vocabulário anti-deriva. Mesma decisão das fatias 07F–07M.
export const INVALID_KNOWLEDGE_RESPONSE = 'invalid_knowledge_response';
export function invalidKnowledgeResponse(status: number): KnowledgeErrorDescriptor {
  return {
    kind: 'unavailable',
    title: 'A resposta da base de conhecimento não pôde ser lida',
    detail: 'O servidor respondeu sem os dados esperados. Isto não significa que não existam procedimentos, versões ou ciências registradas.',
    code: INVALID_KNOWLEDGE_RESPONSE,
    status,
    canRetry: true,
  };
}

export async function knowledgeRead<T>(
  url: string,
  isValid: (data: unknown) => boolean,
): Promise<KnowledgeResult<T>> {
  const result = await knowledgeRequest<T>(url);
  if (!result.ok) return result;
  if (!isValid(result.data)) {
    return { ok: false, status: result.status, error: invalidKnowledgeResponse(result.status), payload: result.data };
  }
  return result;
}
