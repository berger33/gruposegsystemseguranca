// UX-07 / EXT-07 — transporte da família COMPLIANCE.
//
// Devolve sempre um resultado discriminado. Falha de rede, resposta sem corpo
// JSON e status HTTP de erro viram `{ ok: false, error }` com o descritor já
// classificado pelo vocabulário. Nenhuma exceção crua chega à interface, e
// nenhuma falha pode ser confundida com lista vazia ou métrica zero.
//
// Em falha, `payload` carrega o corpo cru da resposta (quando houve), porque o
// servidor de compliance devolve informação adicional junto do código — por
// exemplo o `hint` de `current_document_exists` e `invalid_plan_type`, e o
// `detail` de `invalid_transition` (`terminal_task`, `terminal_action_plan`).
// A camada não interpreta esse corpo: quem apresenta decide com o vocabulário.
//
// Esta camada NÃO decide autorização, NÃO acrescenta cabeçalho de
// idempotência por conta própria e NÃO reescreve URL, método ou corpo: quem
// chama continua responsável por preservar o contrato do servidor.

import { describeComplianceError, type ComplianceErrorDescriptor } from './compliance-vocabulary.mjs';

export type ComplianceResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ComplianceErrorDescriptor; payload: unknown };

export async function complianceRequest<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<ComplianceResult<T>> {
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
    return { ok: false, status: 0, error: describeComplianceError(null, 0), payload: null };
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
    return { ok: false, status: response.status, error: describeComplianceError(code, response.status), payload };
  }

  return { ok: true, status: response.status, data: payload as T };
}

export type { ComplianceErrorDescriptor };

// UX-PRO-07K — leitura honesta (aditivo): 2xx sem a forma canônica nunca é
// ausência de obrigação/documento. `complianceRequest` acima permanece
// INTACTO. O código abaixo é diagnóstico desta tela (o servidor nunca o
// devolve), fora do vocabulário anti-deriva. Mesma decisão das fatias 07F-07J.
export const INVALID_COMPLIANCE_RESPONSE = 'invalid_compliance_response';
export function invalidComplianceResponse(status: number): ComplianceErrorDescriptor {
  return {
    kind: 'retry',
    title: 'A resposta de compliance não pôde ser lida',
    detail: 'O servidor respondeu sem os dados esperados. Isto não significa que não existam obrigações, documentos, tarefas ou planos registrados.',
    code: INVALID_COMPLIANCE_RESPONSE,
    status,
    canRetry: true,
  };
}
export async function complianceRead<T>(
  url: string,
  isValid: (data: unknown) => boolean,
): Promise<ComplianceResult<T>> {
  const result = await complianceRequest<T>(url);
  if (!result.ok) return result;
  if (!isValid(result.data)) {
    return { ok: false, status: result.status, error: invalidComplianceResponse(result.status), payload: result.data };
  }
  return result;
}
