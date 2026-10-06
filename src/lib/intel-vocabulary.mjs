const ERROR_MESSAGES = Object.freeze({
  approval_required: { kind: 'conflict', title: 'Aprovação humana necessária', detail: 'Registre a aprovação explícita antes de registrar um contato interno.', canRetry: false },
  audit_unavailable: { kind: 'unavailable', title: 'Auditoria indisponível', detail: 'A operação foi desfeita porque a trilha de auditoria não pôde ser gravada.', canRetry: true },
  client_account_not_found: { kind: 'not_found', title: 'Conta de cliente não encontrada', detail: 'A conta informada não pertence a uma conta disponível neste escopo.', canRetry: false },
  contact_note_required: { kind: 'invalid', title: 'Nota de contato obrigatória', detail: 'Explique o registro interno do contato antes de salvar.', canRetry: false },
  database_error: { kind: 'unavailable', title: 'Dados indisponíveis', detail: 'Não foi possível consultar a inteligência comercial agora.', canRetry: true },
  evidence_required: { kind: 'conflict', title: 'Evidência necessária', detail: 'Conte as fontes internas da janela declarada antes da aprovação.', canRetry: false },
  forbidden: { kind: 'denied', title: 'Acesso não autorizado', detail: 'Sua conta não tem a permissão granular necessária para esta ação.', canRetry: false },
  idempotency_conflict_payload_mismatch: { kind: 'conflict', title: 'Chave já usada com dados diferentes', detail: 'A operação foi recusada para preservar a idempotência.', canRetry: false },
  idempotency_key_required: { kind: 'invalid', title: 'Identificador da operação ausente', detail: 'A operação precisa de uma chave de idempotência válida.', canRetry: false },
  intel_not_found: { kind: 'not_found', title: 'Sugestão não encontrada', detail: 'A sugestão pode ter sido removida ou não está disponível neste escopo.', canRetry: false },
  internal_error: { kind: 'unavailable', title: 'Falha no servidor', detail: 'O servidor não concluiu a operação.', canRetry: true },
  invalid_description: { kind: 'invalid', title: 'Descrição inválida', detail: 'Informe uma descrição com o tamanho exigido.', canRetry: false },
  invalid_history_window: { kind: 'invalid', title: 'Janela de histórico inválida', detail: 'Informe datas válidas e uma janela que não termine antes de começar.', canRetry: false },
  invalid_intel_id: { kind: 'invalid', title: 'Identificador inválido', detail: 'A sugestão selecionada não tem um identificador válido.', canRetry: false },
  invalid_intel_type: { kind: 'invalid', title: 'Tipo de sugestão inválido', detail: 'Escolha um tipo com fonte interna confirmada.', canRetry: false },
  invalid_json: { kind: 'invalid', title: 'Dados inválidos', detail: 'O servidor não reconheceu os dados enviados.', canRetry: false },
  invalid_related_client_account_id: { kind: 'invalid', title: 'Conta de cliente inválida', detail: 'A referência da conta de cliente não é válida.', canRetry: false },
  invalid_status: { kind: 'invalid', title: 'Estado inválido', detail: 'A transição solicitada não é reconhecida.', canRetry: false },
  invalid_status_for_evidence: { kind: 'conflict', title: 'Evidência não pode ser atualizada agora', detail: 'Conte a evidência apenas enquanto a sugestão está em rascunho ou análise.', canRetry: false },
  invalid_title: { kind: 'invalid', title: 'Título inválido', detail: 'Informe um título com o tamanho exigido.', canRetry: false },
  invalid_transition: { kind: 'conflict', title: 'Transição não permitida', detail: 'O estado atual não permite essa mudança.', canRetry: false },
  justification_required: { kind: 'invalid', title: 'Justificativa obrigatória', detail: 'Explique a decisão com pelo menos dez caracteres.', canRetry: false },
  legacy_writer_retired: { kind: 'conflict', title: 'Tela antiga somente para leitura', detail: 'Use a jornada canônica de inteligência comercial para registrar alterações.', canRetry: false },
  method_not_allowed: { kind: 'invalid', title: 'Operação não permitida', detail: 'Este método não está disponível para o recurso.', canRetry: false },
  not_found: { kind: 'not_found', title: 'Recurso não encontrado', detail: 'O endereço solicitado não corresponde a uma operação disponível.', canRetry: false },
  origin_forbidden: { kind: 'denied', title: 'Origem não autorizada', detail: 'A operação foi recusada por proteção de origem.', canRetry: false },
  payload_too_large: { kind: 'invalid', title: 'Dados muito extensos', detail: 'Reduza o conteúdo enviado e tente novamente.', canRetry: false },
  protocol_conflict_retry: { kind: 'conflict', title: 'Protocolo já reservado', detail: 'A sugestão não foi criada; tente novamente com uma nova operação.', canRetry: true },
  unauthorized: { kind: 'denied', title: 'Sessão necessária', detail: 'Entre novamente para consultar esta área.', canRetry: true },
});

const ENUMS = Object.freeze({
  intelStatus: { sugerida: ['Sugerida', 'neutral'], em_analise: ['Em análise', 'info'], aprovada: ['Aprovada', 'success'], rejeitada: ['Recusada', 'danger'], contato_registrado: ['Contato registrado internamente', 'success'], arquivada: ['Arquivada', 'neutral'], convertida: ['Convertida', 'success'], expirada: ['Expirada', 'neutral'] },
  intelType: { indicacao: ['Indicação', 'info'], reativacao: ['Reativação', 'info'], upsell: ['Expansão de serviço', 'success'], cross_sell: ['Serviço complementar', 'success'], risco: ['Risco', 'warning'], oportunidade: ['Oportunidade', 'info'] },
});

export function describeIntelError(code, status = 0) {
  if (status === 0 || code == null) return { kind: 'network', title: 'Servidor não respondeu', detail: 'Não foi possível concluir a leitura. Os dados não foram tratados como vazios.', status, canRetry: true, code: code ?? null };
  const found = ERROR_MESSAGES[String(code)];
  if (!found) return { kind: 'error', title: 'Falha no servidor', detail: `O servidor devolveu o código ${String(code)}.`, status, canRetry: status >= 500, code: String(code) };
  return { ...found, status, code: String(code) };
}

export function intelErrorMessage(code, status = 0) { const d = describeIntelError(code, status); return `${d.title}: ${d.detail}${d.code ? ` (${d.code})` : ''}`; }
export function intelErrorVariant(descriptor) { return descriptor.kind === 'denied' ? 'denied' : 'error'; }
export function intelErrorFootnote(descriptor) { return descriptor.code ? `Código técnico: (${descriptor.code})` : ''; }
export function enumLabel(group, value) { if (value == null) return '—'; return ENUMS[group]?.[value]?.[0] ?? String(value); }
export function enumTone(group, value) { return ENUMS[group]?.[value]?.[1] ?? 'neutral'; }
export const intelStatusLabel = value => enumLabel('intelStatus', value);
export const intelStatusTone = value => enumTone('intelStatus', value);
export const intelTypeLabel = value => enumLabel('intelType', value);
export const intelTypeTone = value => enumTone('intelType', value);
export function honestDate(value) { if (!value) return 'Dado ausente'; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date); }
export function count(value) { return value == null ? 'Dado ausente' : new Intl.NumberFormat('pt-BR').format(Number(value)); }
export { ERROR_MESSAGES };
