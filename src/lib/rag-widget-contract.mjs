// FECH-01 — contrato de apresentação e validação do assistente (RagWidget).
//
// A autoridade continua sendo o servidor (`POST /api/ai/answer`): quem responde
// 401/403 é a sessão/papel verificados no backend, não este módulo. Aqui só
// moram três coisas puras, compartilhadas entre componente e testes:
//   1. os limites que o servidor realmente aceita (5–500 caracteres);
//   2. a tradução honesta de cada negativa/erro para uma mensagem em português;
//   3. a normalização da resposta, sem inventar protocolo, modelo ou fila.
//
// Regra de honestidade: nenhum texto afirma que o modelo foi chamado quando o
// servidor não chamou, e nenhuma resposta é fabricada para preencher tela.

export const RAG_KEYS = Object.freeze(['publico', 'cliente', 'rh', 'marcelo']);

/** Mesmo piso do servidor (`question.length < 5` → `invalid_query`). */
export const RAG_QUESTION_MIN = 5;
/** Mesmo teto do servidor (`question.length > 500` → `invalid_query`). */
export const RAG_QUESTION_MAX = 500;

/** Escopo declarado por base. Não é autorização; é legenda do escopo do servidor. */
export const RAG_SCOPE_LABELS = Object.freeze({
  publico: 'Somente conteúdo público aprovado e publicado.',
  cliente: 'Somente documentos publicados para as contas vinculadas à sua sessão.',
  rh: 'Somente a base de RH aprovada e publicada.',
  marcelo: 'Somente a base de gestão aprovada e publicada.',
});

const FAILURE_BY_ERROR = Object.freeze({
  client_session_required: {
    state: 'session_required', title: 'Sessão de cliente necessária',
    detail: 'Entre no portal com a sua conta para consultar este assistente. Nenhuma pergunta foi enviada ao modelo.',
    canRetry: false,
  },
  staff_session_required: {
    state: 'session_required', title: 'Sessão da equipe necessária',
    detail: 'Sua sessão expirou ou não foi reconhecida pelo servidor. Entre novamente; nenhuma pergunta foi enviada ao modelo.',
    canRetry: false,
  },
  unauthorized: {
    state: 'session_required', title: 'Sessão necessária',
    detail: 'O servidor não reconheceu uma sessão válida. Entre novamente antes de perguntar.',
    canRetry: false,
  },
  scope_forbidden: {
    state: 'denied', title: 'Acesso negado para esta base',
    detail: 'A sua sessão não tem o papel exigido por este escopo. Estar no menu não concede autorização; nenhuma pergunta foi enviada ao modelo.',
    canRetry: false,
  },
  forbidden: {
    state: 'denied', title: 'Acesso negado',
    detail: 'O servidor recusou esta consulta para o escopo atual. Nada foi enviado ao modelo.',
    canRetry: false,
  },
  same_origin_required: {
    state: 'error', title: 'Origem recusada',
    detail: 'A pergunta precisa partir desta própria aplicação. Recarregue a página e tente novamente.',
    canRetry: true,
  },
  invalid_rag_key: {
    state: 'error', title: 'Base desconhecida',
    detail: 'O servidor não reconhece esta base. Isso é um defeito de configuração da tela, não ausência de conteúdo.',
    canRetry: false,
  },
  invalid_query: {
    state: 'invalid_question', title: 'Pergunta fora do limite',
    detail: `A pergunta precisa ter entre ${RAG_QUESTION_MIN} e ${RAG_QUESTION_MAX} caracteres; o servidor recusou o texto.`,
    canRetry: false,
  },
  rag_unavailable: {
    state: 'source_unavailable', title: 'Base aprovada indisponível',
    detail: 'O servidor não conseguiu ler a base publicada. Isto não significa que não exista conteúdo nem que o modelo foi consultado.',
    canRetry: true,
  },
  ai_busy: {
    state: 'busy', title: 'Assistente ocupado',
    detail: 'O modelo local atende uma consulta por vez. Nada foi gerado nesta tentativa; você pode perguntar de novo em instantes.',
    canRetry: true,
  },
  ai_unavailable: {
    state: 'ai_unavailable', title: 'Modelo local indisponível',
    detail: 'O Ollama local não respondeu. Nenhuma resposta simulada foi apresentada no lugar.',
    canRetry: true,
  },
  ollama_configuration_invalid: {
    state: 'ai_misconfigured', title: 'Endereço do modelo recusado',
    detail: 'A configuração de Ollama não aponta para o loopback permitido; a pergunta não foi enviada.',
    canRetry: false,
  },
  method_not_allowed: {
    state: 'error', title: 'Operação não permitida',
    detail: 'A rota canônica do assistente não aceita este método.',
    canRetry: false,
  },
});

const REASON_DETAILS = Object.freeze({
  ollama_disabled: {
    state: 'ai_disabled', title: 'Modelo local desligado',
    detail: 'O assistente exige Ollama ligado neste computador. A pergunta não foi enviada ao modelo, e nenhuma resposta foi inventada.',
    canRetry: true,
  },
  ollama_http_error: {
    state: 'ai_unavailable', title: 'Falha ao falar com o modelo local',
    detail: 'O Ollama recusou a chamada. Nada foi respondido; tente novamente quando o serviço estiver estável.',
    canRetry: true,
  },
  empty_response: {
    state: 'ai_unavailable', title: 'Modelo devolveu resposta vazia',
    detail: 'A geração terminou sem texto. O assistente não preenche a tela com resposta simulada.',
    canRetry: true,
  },
  ollama_timeout_or_offline: {
    state: 'ai_timeout', title: 'Modelo local não respondeu a tempo',
    detail: 'A consulta ao Ollama estourou o tempo ou o serviço está desligado. Nada foi respondido.',
    canRetry: true,
  },
});

function freeze(value) {
  return Object.freeze(value);
}

/**
 * Traduz uma falha do servidor (ou de rede) para apresentação honesta.
 * `status` 0 significa que a requisição não chegou ao servidor.
 */
export function describeRagFailure({ status = 0, error = '', reason = '', retryAfterSeconds = null } = {}) {
  const code = typeof error === 'string' ? error.trim() : '';
  if (status === 0) {
    return freeze({
      code: 'network_unreachable', status, state: 'network', title: 'Rede indisponível',
      detail: 'Não foi possível alcançar o servidor do assistente. Isto não é ausência de conteúdo nem resposta vazia.',
      canRetry: true, retryAfterSeconds: null,
    });
  }
  const byReason = code === 'ai_unavailable' && reason && REASON_DETAILS[reason];
  const descriptor = byReason || FAILURE_BY_ERROR[code];
  if (descriptor) {
    return freeze({
      code, status, ...descriptor,
      canRetry: Boolean(descriptor.canRetry),
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
    });
  }
  return freeze({
    code: code || null, status, state: 'error', title: 'Resposta não reconhecida',
    detail: code
      ? `O servidor recusou a consulta com o código ${code}. Nenhuma resposta foi gerada.`
      : `O servidor respondeu com HTTP ${status} sem código conhecido. Nenhuma resposta foi gerada.`,
    canRetry: status >= 500, retryAfterSeconds: null,
  });
}

/** Normaliza a resposta canônica sem default inventado de protocolo ou modelo. */
export function normalizeRagAnswer(payload = {}) {
  const text = typeof payload.response === 'string' ? payload.response.trim() : '';
  const sources = Array.isArray(payload.sources) ? payload.sources.filter(item => item && typeof item === 'object') : [];
  const protocol = typeof payload.protocol === 'string' && payload.protocol.trim() ? payload.protocol.trim() : null;
  const model = typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : null;
  const reason = typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason.trim() : null;
  return freeze({
    response: text,
    sources: freeze([...sources]),
    protocol,
    model,
    ollamaUsed: payload.ollama_used === true,
    ragKey: typeof payload.rag_key === 'string' ? payload.rag_key : '',
    reason,
  });
}

/**
 * Estados de apresentação derivados da resposta 200.
 * `empty_scope` = nada publicado para o escopo; `no_source` = existe conteúdo
 * publicado, mas nenhum trecho relacionado à pergunta. O servidor distingue os
 * dois em `reason` e o modelo não é chamado em nenhum deles.
 */
export function describeRagSuccess(answer) {
  if (!answer || !answer.response) {
    return freeze({ state: 'error', title: 'Resposta vazia', detail: 'O servidor respondeu sem texto. Nada foi apresentado como resposta.' });
  }
  if (answer.ollamaUsed && answer.protocol) {
    return freeze({ state: 'answered', title: 'Resposta gerada a partir da base aprovada', detail: '' });
  }
  if (answer.reason === 'empty_scope') {
    return freeze({
      state: 'empty_scope', title: 'Nenhum conteúdo publicado neste escopo',
      detail: 'Não há documento aprovado e publicado para esta base. O modelo não foi chamado; publique conteúdo revisado na curadoria.',
    });
  }
  if (answer.reason === 'no_relevant_source' || answer.sources.length === 0) {
    return freeze({
      state: 'no_source', title: 'Sem fonte aprovada para esta pergunta',
      detail: 'A base publicada não tem trecho relacionado. O modelo não foi chamado e nenhuma resposta foi inventada.',
    });
  }
  return freeze({
    state: 'no_source', title: 'Resposta não gerada',
    detail: 'O servidor não informou protocolo nem uso do modelo; nada é apresentado como resposta gerada.',
  });
}

/** Validação local espelhando exatamente o limite aceito pelo servidor. */
export function validateRagQuestion(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < RAG_QUESTION_MIN) return freeze({ ok: false, code: 'too_short', message: `Escreva pelo menos ${RAG_QUESTION_MIN} caracteres.` });
  if (text.length > RAG_QUESTION_MAX) return freeze({ ok: false, code: 'too_long', message: `A pergunta aceita no máximo ${RAG_QUESTION_MAX} caracteres.` });
  return freeze({ ok: true, code: null, message: '' });
}

export function ragScopeLabel(ragKey) {
  return RAG_SCOPE_LABELS[ragKey] || 'Escopo não declarado para esta base.';
}

export default Object.freeze({
  RAG_KEYS, RAG_QUESTION_MIN, RAG_QUESTION_MAX, RAG_SCOPE_LABELS,
  describeRagFailure, describeRagSuccess, normalizeRagAnswer, validateRagQuestion, ragScopeLabel,
});
