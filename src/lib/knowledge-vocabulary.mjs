// EXT-08 — vocabulário de apresentação da Base de Conhecimento.
//
// Este arquivo traduz somente valores que o contrato canônico realmente fixa.
// `category` e cada item de `tags` são TEXT aberto no servidor (086/160), logo
// NÃO são enums: valores fora das sugestões conhecidas são preservados como
// vieram. Assim a tela não inventa uma categoria nem troca um dado novo por
// uma etiqueta enganosa.

export const ABSENT = 'Dado ausente';

export const KNOWLEDGE_ERROR_MESSAGES = Object.freeze({
  archive_reason_required: { kind: 'invalid', title: 'Motivo do arquivamento obrigatório', detail: 'Informe o motivo formal do arquivamento antes de continuar.', canRetry: false },
  article_not_found: { kind: 'not_found', title: 'Procedimento não encontrado', detail: 'O procedimento pode ter sido removido ou não está disponível neste escopo.', canRetry: false },
  article_not_published_for_acknowledgment: { kind: 'conflict', title: 'Ciência indisponível para esta versão', detail: 'A ciência só pode ser registrada para uma versão publicada.', canRetry: false },
  audit_unavailable: { kind: 'unavailable', title: 'Auditoria indisponível', detail: 'A operação foi desfeita porque a trilha de auditoria não pôde ser gravada.', canRetry: true },
  body_too_large: { kind: 'invalid', title: 'Conteúdo muito extenso', detail: 'Reduza o conteúdo enviado e tente novamente.', canRetry: false },
  change_summary_required: { kind: 'invalid', title: 'Resumo da alteração obrigatório', detail: 'Explique a alteração antes de salvar a nova versão.', canRetry: false },
  database_error: { kind: 'unavailable', title: 'Dados indisponíveis', detail: 'Não foi possível consultar a base de conhecimento agora.', canRetry: true },
  draft_not_accessible: { kind: 'denied', title: 'Rascunho não disponível para sua conta', detail: 'Esta versão ainda não foi publicada e não está no seu escopo de edição.', canRetry: false },
  forbidden_by_role_scope: { kind: 'denied', title: 'Procedimento fora do seu escopo', detail: 'A versão publicada existe, mas foi limitada a outros papéis de acesso.', canRetry: false },
  forbidden_role: { kind: 'denied', title: 'Papel sem permissão para esta operação', detail: 'O servidor recusou a ação para o papel atual.', canRetry: false },
  idempotency_key_required: { kind: 'invalid', title: 'Identificador da operação ausente', detail: 'A operação precisa de uma chave de idempotência válida.', canRetry: false },
  idempotency_key_reused: { kind: 'conflict', title: 'Chave já usada com dados diferentes', detail: 'A operação foi recusada para preservar a idempotência.', canRetry: false },
  invalid_body: { kind: 'invalid', title: 'Dados inválidos', detail: 'O servidor não reconheceu o conteúdo enviado.', canRetry: false },
  invalid_category: { kind: 'invalid', title: 'Categoria inválida', detail: 'Informe uma categoria entre 3 e 100 caracteres.', canRetry: false },
  invalid_content: { kind: 'invalid', title: 'Conteúdo inválido', detail: 'Informe o conteúdo completo do procedimento dentro do tamanho exigido.', canRetry: false },
  invalid_id: { kind: 'invalid', title: 'Identificador inválido', detail: 'O procedimento selecionado não possui um identificador válido.', canRetry: false },
  invalid_slug: { kind: 'invalid', title: 'Identificador curto inválido', detail: 'Use letras minúsculas, números e hífens no identificador do procedimento.', canRetry: false },
  invalid_status_transition: { kind: 'conflict', title: 'Transição não permitida', detail: 'O ciclo de vida atual não permite a mudança solicitada.', canRetry: false },
  invalid_summary: { kind: 'invalid', title: 'Resumo inválido', detail: 'Quando informado, o resumo deve atender ao tamanho exigido.', canRetry: false },
  invalid_target_status: { kind: 'invalid', title: 'Estado de destino inválido', detail: 'Escolha um estado reconhecido pelo ciclo de vida canônico.', canRetry: false },
  invalid_title: { kind: 'invalid', title: 'Título inválido', detail: 'Informe um título dentro do tamanho exigido.', canRetry: false },
  knowledge_mutation_failed: { kind: 'unavailable', title: 'Alteração indisponível', detail: 'O servidor não conseguiu concluir a alteração agora.', canRetry: true },
  knowledge_route_not_found: { kind: 'not_found', title: 'Operação não encontrada', detail: 'O endereço solicitado não corresponde a uma operação da base de conhecimento.', canRetry: false },
  legacy_knowledge_writer_retired: { kind: 'conflict', title: 'Escrita legada aposentada', detail: 'Use a jornada canônica de procedimentos para registrar alterações.', canRetry: false },
  origin_forbidden: { kind: 'denied', title: 'Origem não autorizada', detail: 'A operação foi recusada pela proteção de origem.', canRetry: false },
  publish_permission_required: { kind: 'denied', title: 'Publicação requer permissão específica', detail: 'O servidor só permite a publicação para os papéis autorizados.', canRetry: false },
  unauthorized: { kind: 'denied', title: 'Sessão necessária', detail: 'Entre novamente para consultar esta área.', canRetry: true },
});

const ENUMS = Object.freeze({
  lifecycle: {
    rascunho: ['Rascunho', 'neutral'],
    em_revisao: ['Em revisão', 'warning'],
    aprovado: ['Aprovado', 'info'],
    publicado: ['Publicado', 'success'],
    arquivado: ['Arquivado', 'neutral'],
  },
  role: {
    admin: ['Administração', 'info'],
    ti: ['Tecnologia da Informação', 'info'],
    marcelo: ['Direção (Marcelo)', 'info'],
    rh: ['Recursos Humanos', 'info'],
    operacao: ['Operação', 'info'],
    supervisor: ['Supervisão', 'info'],
    comercial: ['Comercial', 'info'],
    financeiro: ['Financeiro', 'info'],
  },
  // São apenas sugestões usadas pelo formulário. O banco aceita `category`
  // aberto, portanto valores desconhecidos não podem ser convertidos em "Outro".
  category: {
    operacional: ['Operacional', 'info'],
    seguranca: ['Segurança', 'info'],
    rh: ['RH / Pessoas', 'info'],
    ti: ['TI / Sistemas', 'info'],
    compliance: ['Compliance', 'info'],
    financeiro: ['Financeiro', 'info'],
    tecnologia: ['Tecnologia', 'info'],
  },
  acknowledgmentSource: {
    jornada_canonica: ['Jornada canônica', 'info'],
  },
});

export const KNOWLEDGE_LIFECYCLE = Object.freeze(['rascunho', 'em_revisao', 'aprovado', 'publicado', 'arquivado']);
export const KNOWLEDGE_ACCESS_ROLES = Object.freeze(['admin', 'ti', 'marcelo', 'rh', 'operacao', 'supervisor', 'comercial', 'financeiro']);
export const KNOWLEDGE_CATEGORY_SUGGESTIONS = Object.freeze(['operacional', 'seguranca', 'rh', 'ti', 'compliance']);
export const KNOWLEDGE_TRANSITIONS = Object.freeze({
  rascunho: ['em_revisao'],
  em_revisao: ['rascunho', 'aprovado'],
  aprovado: ['rascunho', 'publicado'],
  publicado: ['arquivado'],
  arquivado: ['rascunho'],
});

export function describeKnowledgeError(code, status = 0) {
  if (status === 0 || code == null) {
    return {
      kind: 'network',
      title: 'Servidor não respondeu',
      detail: 'Não foi possível concluir a leitura. Os dados não foram tratados como vazios.',
      status,
      canRetry: true,
      code: code ?? null,
    };
  }
  const found = KNOWLEDGE_ERROR_MESSAGES[String(code)];
  if (!found) {
    return {
      kind: status === 401 || status === 403 ? 'denied' : 'error',
      title: status === 401 || status === 403 ? 'Acesso não autorizado' : 'Falha no servidor',
      detail: status === 401 || status === 403
        ? 'O servidor recusou esta consulta ou operação.'
        : `O servidor devolveu o código ${String(code)}.`,
      status,
      canRetry: status >= 500 || status === 0,
      code: String(code),
    };
  }
  return { ...found, status, code: String(code) };
}

export function knowledgeErrorVariant(descriptor) {
  return descriptor.kind === 'denied' ? 'denied' : 'error';
}

export function knowledgeErrorFootnote(descriptor) {
  return descriptor?.code ? `Código técnico: ${descriptor.code}` : '';
}

export function enumLabel(group, value) {
  if (value == null || value === '') return ABSENT;
  return ENUMS[group]?.[String(value)]?.[0] ?? String(value);
}

export function enumTone(group, value) {
  return ENUMS[group]?.[String(value)]?.[1] ?? 'neutral';
}

export const knowledgeStatusLabel = value => enumLabel('lifecycle', value);
export const knowledgeStatusTone = value => enumTone('lifecycle', value);
export const knowledgeRoleLabel = value => enumLabel('role', value);
export const knowledgeRoleTone = value => enumTone('role', value);
export function knowledgeAccessRolesLabel(value) {
  if (value == null) return ABSENT;
  if (!Array.isArray(value)) return knowledgeRoleLabel(value);
  return value.length ? value.map(knowledgeRoleLabel).join(', ') : 'Todos os papéis de equipe';
}
export const knowledgeCategoryLabel = value => enumLabel('category', value);
export const knowledgeCategoryTone = value => enumTone('category', value);
export const knowledgeAcknowledgmentSourceLabel = value => enumLabel('acknowledgmentSource', value);

/** Tags são dados livres no contrato: não normalizar, traduzir ou inventar. */
export function knowledgeTagLabel(value) {
  return value == null || value === '' ? ABSENT : String(value);
}

export function knowledgeTagsLabel(value) {
  if (value == null) return ABSENT;
  if (!Array.isArray(value)) return String(value);
  return value.length ? value.map(knowledgeTagLabel).join(', ') : 'Sem tags declaradas';
}

export function honestText(value, absent = ABSENT) {
  return value == null || value === '' ? absent : String(value);
}

export function honestDate(value) {
  if (!value) return ABSENT;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

export function honestDateTime(value) {
  if (!value) return ABSENT;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(date);
}

export function honestCount(value) {
  if (value == null || value === '') return ABSENT;
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat('pt-BR').format(number) : String(value);
}

/** Traduz os estados conhecidos quando aparecem nos resumos canônicos do histórico. */
export function knowledgeHistorySummary(value) {
  if (value == null || value === '') return ABSENT;
  return String(value).replace(/\b(rascunho|em_revisao|aprovado|publicado|arquivado)\b/g, code => knowledgeStatusLabel(code));
}
