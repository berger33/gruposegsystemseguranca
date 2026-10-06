// UX-07 / EXT-11 / F07 — vocabulário da família ANALYTICS.
//
// Cobre os códigos de erro literais de src/server/ext-analytics-api.mjs, que é
// o único servidor da família religado em server.mjs (`/api/ext/analytics/**`
// e as rotas legadas que caem em handleLegacy). Código desconhecido passa cru:
// nada é inventado aqui. O código canônico fica só como informação técnica,
// nunca como título principal.

const ERROR_MESSAGES = Object.freeze({
  approval_note_required: { kind: 'invalid', title: 'Nota de aprovação obrigatória', detail: 'Explique por escrito o que foi revisado antes de registrar a aprovação humana.', canRetry: false },
  approval_only_in_draft: { kind: 'conflict', title: 'Aprovação só vale em rascunho', detail: 'O experimento já saiu do rascunho; a aprovação humana não pode ser registrada agora.', canRetry: false },
  approval_required: { kind: 'conflict', title: 'Aprovação humana necessária', detail: 'A execução depende de uma aprovação humana registrada antes da transição.', canRetry: false },
  audit_unavailable: { kind: 'unavailable', title: 'Auditoria indisponível', detail: 'A operação foi desfeita porque a trilha de auditoria não pôde ser gravada.', canRetry: true },
  conclusion_note_required: { kind: 'invalid', title: 'Nota de conclusão obrigatória', detail: 'Para concluir é preciso escrever o que foi observado; o sistema não redige conclusão sozinho.', canRetry: false },
  database_error: { kind: 'unavailable', title: 'Dados indisponíveis', detail: 'Não foi possível consultar os experimentos agora. Isto não significa que não existam experimentos.', canRetry: true },
  experiment_not_found: { kind: 'not_found', title: 'Experimento não encontrado', detail: 'O experimento pode ter sido removido ou não é canônico EXT-11.', canRetry: false },
  experiment_not_running: { kind: 'conflict', title: 'Experimento fora de execução', detail: 'Observações só entram enquanto o experimento está em execução.', canRetry: false },
  forbidden: { kind: 'denied', title: 'Acesso não autorizado', detail: 'Sua conta não tem a permissão granular necessária para esta ação de analytics.', canRetry: false },
  idempotency_conflict_payload_mismatch: { kind: 'conflict', title: 'Chave já usada com dados diferentes', detail: 'A operação foi recusada para preservar a idempotência da jornada.', canRetry: false },
  idempotency_key_required: { kind: 'invalid', title: 'Identificador da operação ausente', detail: 'A operação precisa de uma chave de idempotência válida.', canRetry: false },
  insufficient_real_observations: { kind: 'conflict', title: 'Observações reais insuficientes', detail: 'A conclusão exige ao menos uma observação real de A e de B; nada é completado artificialmente.', canRetry: false },
  internal_error: { kind: 'unavailable', title: 'Falha no servidor', detail: 'O servidor não concluiu a operação.', canRetry: true },
  invalid_description: { kind: 'invalid', title: 'Descrição inválida', detail: 'Informe a descrição e o escopo com o tamanho exigido.', canRetry: false },
  invalid_experiment_id: { kind: 'invalid', title: 'Identificador inválido', detail: 'O experimento selecionado não tem um identificador válido.', canRetry: false },
  invalid_hypothesis: { kind: 'invalid', title: 'Hipótese inválida', detail: 'Escreva uma hipótese explícita com o tamanho exigido.', canRetry: false },
  invalid_json: { kind: 'invalid', title: 'Dados inválidos', detail: 'O servidor não reconheceu os dados enviados.', canRetry: false },
  invalid_justification: { kind: 'invalid', title: 'Justificativa inválida', detail: 'Ao justificar a mudança de estado, use o tamanho exigido pelo servidor.', canRetry: false },
  invalid_metric_name: { kind: 'invalid', title: 'Métrica inválida', detail: 'Declare o nome da métrica observada com o tamanho exigido.', canRetry: false },
  invalid_metric_value: { kind: 'invalid', title: 'Valor de métrica inválido', detail: 'O valor precisa ser um número dentro do intervalo aceito pelo servidor.', canRetry: false },
  invalid_sample_size: { kind: 'invalid', title: 'Tamanho de amostra inválido', detail: 'A amostra precisa ser um número inteiro de pelo menos um registro.', canRetry: false },
  invalid_source_record_id: { kind: 'invalid', title: 'Registro de origem inválido', detail: 'A referência ao registro operacional de origem não é válida.', canRetry: false },
  invalid_source_recorded_at: { kind: 'invalid', title: 'Data de origem inválida', detail: 'A data do registro de origem precisa ser válida e não pode estar no futuro.', canRetry: false },
  invalid_status: { kind: 'invalid', title: 'Estado inválido', detail: 'O estado solicitado não é reconhecido pela jornada canônica.', canRetry: false },
  invalid_transition: { kind: 'conflict', title: 'Transição não permitida', detail: 'O estado atual do experimento não permite essa mudança.', canRetry: false },
  invalid_variant: { kind: 'invalid', title: 'Variante inválida', detail: 'A observação precisa indicar a variante A ou a variante B.', canRetry: false },
  invalid_variants: { kind: 'invalid', title: 'Variantes inválidas', detail: 'Informe duas variantes diferentes, cada uma com o tamanho exigido.', canRetry: false },
  legacy_writer_retired: { kind: 'conflict', title: 'Tela antiga somente para leitura', detail: 'A escrita legada foi aposentada; use a jornada canônica de analytics.', canRetry: false },
  method_not_allowed: { kind: 'invalid', title: 'Operação não permitida', detail: 'Este método não está disponível para o recurso.', canRetry: false },
  metric_mismatch: { kind: 'invalid', title: 'Métrica diferente da declarada', detail: 'A observação precisa usar exatamente a métrica declarada no experimento.', canRetry: false },
  not_found: { kind: 'not_found', title: 'Recurso não encontrado', detail: 'O endereço solicitado não corresponde a uma operação disponível.', canRetry: false },
  observation_must_be_real_source: { kind: 'invalid', title: 'Observação precisa ser real', detail: 'O servidor recusa dado sintético e recusa vencedor, resultado ou significância digitados.', canRetry: false },
  origin_forbidden: { kind: 'denied', title: 'Origem não autorizada', detail: 'A operação foi recusada por proteção de origem.', canRetry: false },
  payload_too_large: { kind: 'invalid', title: 'Dados muito extensos', detail: 'Reduza o conteúdo enviado e tente novamente.', canRetry: false },
  privacy_minimization_required: { kind: 'invalid', title: 'Minimização de dados obrigatória', detail: 'O experimento só é aceito sem coleta de identificadores diretos.', canRetry: false },
  real_source_required: { kind: 'invalid', title: 'Origem operacional real obrigatória', detail: 'Informe uma origem interna declarada e uma referência que não seja sintética.', canRetry: false },
  unauthorized: { kind: 'denied', title: 'Sessão necessária', detail: 'Entre novamente para consultar esta área.', canRetry: true },
});

// ENUMs efetivamente usados pela família: estado do experimento (migração 163),
// variante e origem declarada da observação (CHECK de source_type).
const ENUMS = Object.freeze({
  experimentStatus: {
    rascunho: ['Rascunho', 'neutral'],
    em_execucao: ['Em execução', 'info'],
    concluido: ['Concluído', 'success'],
    cancelado: ['Cancelado', 'danger'],
    arquivado: ['Arquivado', 'neutral'],
  },
  variant: { A: ['Variante A', 'info'], B: ['Variante B', 'info'] },
  sourceType: {
    internal_operational_record: ['Registro operacional interno', 'info'],
    internal_event: ['Evento interno', 'info'],
  },
});

export function describeAnalyticsError(code, status = 0) {
  if (status === 0 || code == null) {
    return { kind: 'network', title: 'Servidor não respondeu', detail: 'Não foi possível concluir a leitura. Os dados não foram tratados como vazios nem como zero.', status, canRetry: true, code: code ?? null };
  }
  const found = ERROR_MESSAGES[String(code)];
  if (!found) {
    return { kind: 'error', title: 'Falha no servidor', detail: `O servidor devolveu o código ${String(code)}.`, status, canRetry: status >= 500, code: String(code) };
  }
  return { ...found, status, code: String(code) };
}

export function analyticsErrorMessage(code, status = 0) {
  const descriptor = describeAnalyticsError(code, status);
  return `${descriptor.title}: ${descriptor.detail}${descriptor.code ? ` (${descriptor.code})` : ''}`;
}

export function analyticsErrorVariant(descriptor) {
  return descriptor.kind === 'denied' ? 'denied' : 'error';
}

export function analyticsErrorFootnote(descriptor) {
  return descriptor.code ? `Código técnico: (${descriptor.code})` : '';
}

export function enumLabel(group, value) {
  if (value == null || value === '') return '—';
  return ENUMS[group]?.[value]?.[0] ?? String(value);
}

export function enumTone(group, value) {
  return ENUMS[group]?.[value]?.[1] ?? 'neutral';
}

export const experimentStatusLabel = value => enumLabel('experimentStatus', value);
export const experimentStatusTone = value => enumTone('experimentStatus', value);
export const variantLabel = value => enumLabel('variant', value);
export const variantTone = value => enumTone('variant', value);
export const sourceTypeLabel = value => enumLabel('sourceType', value);
export const sourceTypeTone = value => enumTone('sourceType', value);

const ABSENT = 'Dado ausente';

export function honestDate(value) {
  if (value == null || value === '') return ABSENT;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

export function honestDateTime(value) {
  if (value == null || value === '') return ABSENT;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(date);
}

// Ausência nunca é zero: só número realmente recebido vira contagem.
export function count(value) {
  if (value == null || value === '') return ABSENT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return ABSENT;
  return new Intl.NumberFormat('pt-BR').format(parsed).replace(/\u00a0|\u202f/g, ' ');
}

export function decimal(value) {
  if (value == null || value === '') return ABSENT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return ABSENT;
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(parsed).replace(/\u00a0|\u202f/g, ' ');
}

// Percentual só existe quando há numerador e denominador reais. Analytics não
// inventa taxa de conversão e não transforma ausência em 0%.
export function honestPercent(part, total) {
  if (part == null || total == null) return ABSENT;
  const numerator = Number(part);
  const denominator = Number(total);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return ABSENT;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format((numerator / denominator) * 100).replace(/\u00a0|\u202f/g, ' ')}%`;
}

export function honestText(value) {
  return value == null || String(value).trim() === '' ? ABSENT : String(value);
}

export { ERROR_MESSAGES, ENUMS, ABSENT };
