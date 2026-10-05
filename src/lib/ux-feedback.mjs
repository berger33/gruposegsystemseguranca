// UX-03B — estados honestos de leitura e escrita.
//
// Este módulo é puro: traduz a resposta real da API (status HTTP + código de
// erro canônico) numa mensagem em português que NÃO inventa permissão, não
// transforma falha em zero e não esconde negação. Ele nunca decide acesso:
// a autorização continua sendo decidida no servidor em cada rota.

/** Códigos de erro canônicos que as APIs já devolvem, com texto para pessoas. */
export const UX_ERROR_MESSAGES = Object.freeze({
  admin_session_required: 'Sua sessão administrativa não foi reconhecida ou expirou. Entre novamente para continuar.',
  session_required: 'Sua sessão não foi reconhecida ou expirou. Entre novamente para continuar.',
  commercial_role_required: 'Seu papel de equipe não tem acesso a esta área comercial.',
  role_required: 'Seu papel de equipe não tem acesso a esta função.',
  permission_scope_denied: 'Sua conta não tem a permissão específica exigida por esta consulta.',
  forbidden: 'O servidor negou esta consulta para a sua sessão.',
  same_origin_required: 'A requisição foi recusada por proteção de origem. Recarregue a página e tente de novo.',
  not_found: 'O registro não foi encontrado ou não pertence ao seu escopo.',
  invalid_stage: 'A etapa informada não é aceita pelo sistema.',
  invalid_priority: 'A prioridade informada não é aceita pelo sistema.',
  idempotency_key_required: 'A ação precisa de uma chave de repetição. Recarregue a página e tente de novo.',
  idempotency_conflict: 'Esta ação já foi registrada com dados diferentes. Recarregue antes de repetir.',
  audit_unavailable: 'A trilha de auditoria não respondeu, então nada foi gravado. Tente novamente mais tarde.',
});

/**
 * Classifica uma falha de leitura/escrita sem suavizar o significado.
 * @param {{ status?: number|null, code?: string|null, cause?: unknown }} input
 * @returns {{ kind: string, title: string, message: string, canRetry: boolean, code: string|null, status: number|null }}
 */
export function describeFailure(input = {}) {
  const status = Number.isFinite(input.status) ? Number(input.status) : null;
  const rawCode = typeof input.code === 'string' && input.code.trim() ? input.code.trim() : null;
  const known = rawCode && Object.prototype.hasOwnProperty.call(UX_ERROR_MESSAGES, rawCode)
    ? UX_ERROR_MESSAGES[rawCode]
    : null;

  if (status === null) {
    return {
      kind: 'network',
      title: 'Não foi possível falar com o servidor',
      message: 'A consulta não chegou a ser respondida. Isso não significa que a lista esteja vazia. Verifique a conexão e tente de novo.',
      canRetry: true,
      code: rawCode,
      status: null,
    };
  }
  if (status === 401) {
    return {
      kind: 'unauthorized',
      title: 'Sessão não reconhecida',
      message: known || UX_ERROR_MESSAGES.admin_session_required,
      canRetry: true,
      code: rawCode,
      status,
    };
  }
  if (status === 403) {
    return {
      kind: 'forbidden',
      title: 'Acesso negado para esta sessão',
      message: `${known || UX_ERROR_MESSAGES.forbidden} Nada foi carregado e nenhum dado desta área é exibido. Fale com o TI se você deveria ter acesso.`,
      canRetry: false,
      code: rawCode,
      status,
    };
  }
  if (status === 404) {
    return {
      kind: 'not_found',
      title: 'Registro não encontrado',
      message: known || UX_ERROR_MESSAGES.not_found,
      canRetry: false,
      code: rawCode,
      status,
    };
  }
  if (status === 409) {
    return {
      kind: 'conflict',
      title: 'Conflito com o estado atual',
      message: known || 'O registro mudou ou a ação já havia sido feita. Recarregue para ver o estado atual antes de repetir.',
      canRetry: false,
      code: rawCode,
      status,
    };
  }
  if (status === 410) {
    return {
      kind: 'gone',
      title: 'Caminho aposentado',
      message: known || 'Esta rota foi aposentada e substituída. Atualize a página para usar a versão vigente.',
      canRetry: false,
      code: rawCode,
      status,
    };
  }
  if (status === 429) {
    return {
      kind: 'rate_limited',
      title: 'Muitas tentativas',
      message: known || 'O servidor pediu para esperar antes de repetir esta ação.',
      canRetry: true,
      code: rawCode,
      status,
    };
  }
  if (status >= 400 && status < 500) {
    return {
      kind: 'invalid',
      title: 'O servidor recusou os dados enviados',
      message: known || 'Revise os campos destacados e tente novamente.',
      canRetry: false,
      code: rawCode,
      status,
    };
  }
  return {
    kind: 'server',
    title: 'Falha no servidor',
    message: known || 'O servidor respondeu com erro e nada foi carregado nem gravado. Tente novamente; se persistir, avise o TI.',
    canRetry: true,
    code: rawCode,
    status,
  };
}

/**
 * Lê uma resposta `fetch` de JSON e devolve dados ou falha classificada.
 * Não engole erro: resposta não-ok vira `failure`, nunca lista vazia.
 * @param {Response} response
 */
export async function readJsonResult(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const code = payload && typeof payload.error === 'string' ? payload.error : null;
    return { ok: false, data: null, failure: describeFailure({ status: response.status, code }) };
  }
  return { ok: true, data: payload, failure: null };
}

/** Converte exceção de rede/parse em falha classificada. */
export function failureFromCause(cause) {
  return describeFailure({ status: null, code: null, cause });
}
