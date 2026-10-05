// UX-03B — linguagem de negócio para o CRM.
//
// Regra: a interface mostra português; a API continua recebendo e devolvendo
// EXATAMENTE os mesmos valores canônicos já validados no servidor
// (`crm-api.mjs`: OPP_STAGES, OPP_PRIORITY, tipos de empresa). Este módulo só
// traduz para leitura — nunca inventa, renomeia ou remove um valor aceito.

/** Ordem canônica do funil, igual à validação do servidor. */
export const CRM_STAGE_VALUES = Object.freeze([
  'novo',
  'qualificacao',
  'vistoria',
  'proposta_elaboracao',
  'proposta_enviada',
  'negociacao',
  'ganho',
  'perdido',
]);

const STAGE_LABELS = Object.freeze({
  novo: 'Novo',
  qualificacao: 'Qualificação',
  vistoria: 'Vistoria',
  proposta_elaboracao: 'Proposta em elaboração',
  proposta_enviada: 'Proposta enviada',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
});

export const CRM_PRIORITY_VALUES = Object.freeze(['baixa', 'media', 'alta', 'critica']);

const PRIORITY_LABELS = Object.freeze({
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
});

export const CRM_COMPANY_TYPE_VALUES = Object.freeze(['prospect', 'client', 'partner']);

const COMPANY_TYPE_LABELS = Object.freeze({
  prospect: 'Potencial cliente',
  client: 'Cliente',
  partner: 'Parceiro',
});

const COMPANY_STATUS_LABELS = Object.freeze({
  active: 'Ativa',
  inactive: 'Inativa',
  archived: 'Arquivada',
  blocked: 'Bloqueada',
});

const IMPORT_ROW_LABELS = Object.freeze({
  valid: 'Pronta para importar',
  invalid: 'Com erro',
  duplicate: 'Possível duplicata',
  imported: 'Importada',
  skipped: 'Ignorada',
  failed: 'Falhou',
});

function translate(dictionary, value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!key) return '—';
  // Valor desconhecido continua visível como veio: a tela não esconde dado real.
  return Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : value;
}

export function stageLabel(value) {
  return translate(STAGE_LABELS, value);
}

export function priorityLabel(value) {
  return translate(PRIORITY_LABELS, value);
}

export function companyTypeLabel(value) {
  return translate(COMPANY_TYPE_LABELS, value);
}

export function companyStatusLabel(value) {
  return translate(COMPANY_STATUS_LABELS, value);
}

export function importRowStatusLabel(value) {
  return translate(IMPORT_ROW_LABELS, value);
}

/** Opções prontas para `<select>`: `value` canônico, `label` legível. */
export function stageOptions() {
  return CRM_STAGE_VALUES.map((value) => ({ value, label: stageLabel(value) }));
}

export function priorityOptions() {
  return CRM_PRIORITY_VALUES.map((value) => ({ value, label: priorityLabel(value) }));
}

export function companyTypeOptions() {
  return CRM_COMPANY_TYPE_VALUES.map((value) => ({ value, label: companyTypeLabel(value) }));
}

/** Estágios abertos, espelhando OPP_OPEN_STAGES do servidor (leitura apenas). */
export const CRM_OPEN_STAGE_VALUES = Object.freeze(
  CRM_STAGE_VALUES.filter((value) => value !== 'ganho' && value !== 'perdido'),
);

/** Texto curto e honesto sobre o desfecho, sem prometer dinheiro recebido. */
export function outcomeNote(opportunity) {
  if (!opportunity) return '';
  if (opportunity.is_won) return 'Ganho registrado no funil. Isso não representa valor recebido.';
  if (opportunity.is_lost) return 'Perda registrada com motivo obrigatório.';
  return '';
}

/** Formata moeda sem inventar valor quando o campo é nulo. */
export function formatCurrencyBRL(value) {
  if (value === null || value === undefined || value === '') return 'não informado';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Data ISO (`YYYY-MM-DD` ou timestamp) para leitura, sem fuso surpresa. */
export function formatDateBR(value) {
  if (!value) return 'não informada';
  const text = String(value);
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString('pt-BR');
}

export function formatDateTimeBR(value) {
  if (!value) return 'não informada';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
