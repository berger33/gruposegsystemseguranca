import { describeFinanceError, financeErrorFootnote, type FinanceErrorDescriptor } from './finance-vocabulary.mjs';

// UX-07 (fatia B — Financeiro): leitura e escrita de `/admin/financeiro` com
// estado honesto.
//
// Não altera contrato algum: mesma URL, mesmo método, mesmo corpo, mesmo
// cabeçalho e mesma `credentials: 'same-origin'` que a tela já usava. A
// diferença é que toda falha volta DESCRITA, em vez de um
// `Error(data.error || \`Erro ${response.status}\`)` que jogava o código cru
// em inglês na cara de quem opera.

export type FinanceResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: FinanceErrorDescriptor };

export async function financeRequest<T = unknown>(url: string, init: RequestInit = {}): Promise<FinanceResult<T>> {
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
    // A requisição não chegou a ser respondida. Isto NÃO é "zero registros".
    return { ok: false, status: 0, error: describeFinanceError(null, 0) };
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
    return { ok: false, status: response.status, error: describeFinanceError(code, response.status) };
  }
  return { ok: true, status: response.status, data: payload as T };
}

export type { FinanceErrorDescriptor };

// ---------------------------------------------------------------------------
// UX-PRO-07E-1 — leitura honesta: resposta 2xx sem a lista canônica nunca é
// ausência de registro.
//
// `financeRequest` acima permanece INTACTO (mesma URL, método, corpo,
// cabeçalhos, `credentials: 'same-origin'` e `cache: 'no-store'`); o que segue
// é acrescentado ao lado, sem alterar o comportamento de nenhuma escrita.
//
// O código abaixo é de diagnóstico DESTA tela — o servidor nunca o devolve —,
// por isso NÃO entra em `finance-vocabulary.mjs`, que só traduz códigos que os
// servidores financeiros realmente devolvem (anti-deriva em
// `tests/ux-finance-vocabulary.test.mjs`). Mesma decisão da UX-PRO-07D-1 em
// `src/app/admin/operacao/OperacaoWorkspace.tsx`.
// ---------------------------------------------------------------------------

export const INVALID_FINANCE_RESPONSE = 'invalid_finance_response';

/** Descritor de uma resposta 2xx que não trouxe a lista canônica esperada. */
export function invalidFinanceResponse(status: number): FinanceErrorDescriptor {
  return {
    kind: 'retry',
    title: 'A resposta do financeiro não pôde ser lida',
    detail: 'O servidor respondeu sem a lista esperada. Isto não significa que não existam registros.',
    code: INVALID_FINANCE_RESPONSE,
    status,
    canRetry: true,
  };
}

/**
 * Mesma URL, método, credenciais e cabeçalhos de `financeRequest` (que continua
 * fazendo a chamada); a única diferença é exigir a lista canônica `key` na
 * resposta 2xx, em vez de trocá-la por `[]`.
 *
 * O servidor garante a chave no 200 e devolve `[]` quando realmente não há
 * registro (ex.: `src/server/fin-advanced-api.mjs:83`), então o vazio legítimo
 * continua sendo vazio concluído — apenas o vazio FALSO deixa de existir.
 */
export async function financeReadList<T>(url: string, key: string): Promise<FinanceResult<T[]>> {
  const result = await financeRequest<Record<string, unknown> | null>(url);
  if (!result.ok) return result;
  const list = result.data && typeof result.data === 'object' ? result.data[key] : undefined;
  if (!Array.isArray(list)) {
    return { ok: false, status: result.status, error: invalidFinanceResponse(result.status) };
  }
  return { ok: true, status: result.status, data: list as T[] };
}

/**
 * Frase de uma linha para as áreas FIN-05..FIN-13, que apresentam a falha como
 * texto simples (o mesmo canal que já usa `financeErrorMessage`), preservando o
 * status HTTP real e o código de diagnóstico entre parênteses.
 */
export function financeInvalidListMessage(status: number): string {
  const descriptor = invalidFinanceResponse(status);
  return `${descriptor.title}. ${descriptor.detail} ${financeErrorFootnote(descriptor)}`.trim();
}

