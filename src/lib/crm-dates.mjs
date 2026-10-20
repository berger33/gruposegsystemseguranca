// UX-PRO-E3-CRM — conversão bidirecional de `<input type="datetime-local">` em `/admin/crm`.
//
// Este arquivo é auxiliar DE TELA, não tradutor de código de servidor.
// Mesma decisão de `ops-dates.mjs`: só carimbos com hora são aceitos
// (`AAAA-MM-DDTHH:mm[...]`). Data de calendário (`DATE`) NÃO passa por aqui.
//
// Decisão do proprietário em 20/10/2026 (via (a)):
// - O controle `<input type="datetime-local">` não aceita fuso; o valor
//   exibido/editado deve estar em `America/Sao_Paulo` (fuso fixo e declarado).
// - A API guarda/entrega em UTC (TIMESTAMPTZ). A conversão é:
//     LEITURA (API → input): UTC → America/Sao_Paulo → `YYYY-MM-DDTHH:MM`
//     ESCRITA (input → API): `YYYY-MM-DDTHH:MM` (assumido America/Sao_Paulo) → UTC
// - Rótulo de fuso visível `(America/Sao_Paulo)` ao lado do campo.

/** Fuso usado e declarado neste controle. */
export const CRM_TIME_ZONE = 'America/Sao_Paulo';

/** Texto exibido quando o carimbo não foi informado. */
export const CRM_DATETIME_ABSENT = 'Não informado';

const STAMP_WITH_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** Parseia um ISO com hora para `Date`. Retorna `null` se ausente ou inválido. */
function parseStamp(value) {
  const text = String(value ?? '').trim();
  if (!STAMP_WITH_TIME.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Parseia `YYYY-MM-DDTHH:MM` (sem fuso) assumindo `America/Sao_Paulo`. */
function parseLocalInput(value) {
  const text = String(value ?? '').trim();
  // datetime-local: "YYYY-MM-DDTHH:MM" ou "YYYY-MM-DDTHH:MM:SS"
  // Valida formato E valores: hora 00-23, minuto 00-59
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  // Valida ranges reais (não só formato)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  // Valida data básica (evita 2026-02-30, etc.)
  const testDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (testDate.getUTCFullYear() !== year ||
      testDate.getUTCMonth() !== month - 1 ||
      testDate.getUTCDate() !== day) return null;
  // Constrói a data em São Paulo via Intl: cria componentes e monta UTC.
  const asLocal = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMs = getSaoPauloOffsetMs(asLocal);
  return new Date(asLocal.getTime() - offsetMs);
}

/** Retorna o offset em ms de America/Sao_Paulo para a data dada (em UTC). */
function getSaoPauloOffsetMs(dateUtc) {
  // Intl.DateTimeFormat com timeZoneName dá o offset formatado.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: CRM_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
  });
  const parts = fmt.formatToParts(dateUtc);
  const tzPart = parts.find(p => p.type === 'timeZoneName');
  if (!tzPart) return -3 * 60 * 60 * 1000; // fallback UTC-3
  // Ex: "GMT-3" ou "GMT-2" (horário de verão)
  const match = tzPart.value.match(/GMT([+-]\d+)/);
  if (!match) return -3 * 60 * 60 * 1000;
  const hours = parseInt(match[1], 10);
  return hours * 60 * 60 * 1000;
}

/**
 * Converte UTC (TIMESTAMPTZ da API) → valor para `datetime-local` (America/Sao_Paulo).
 * Retorna string `YYYY-MM-DDTHH:MM` ou string vazia se ausente/inválido.
 * Data de calendário (`DATE` sem hora) retorna string vazia — não é convertida.
 */
export function crmDateTimeForInput(value) {
  const date = parseStamp(value);
  if (!date) return '';
  // Formata em America/Sao_Paulo
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: CRM_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Converte valor do `datetime-local` (assumido America/Sao_Paulo) → UTC ISO para API.
 * Retorna string ISO `YYYY-MM-DDTHH:mm:ss.sssZ` ou `null` se ausente/inválido.
 */
export function crmDateTimeFromInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text)) return null;
  const date = parseLocalInput(text);
  if (!date) return null;
  return date.toISOString();
}

/**
 * Rótulo de fuso visível para exibir ao lado do campo.
 */
export const CRM_TIMEZONE_LABEL = `(${CRM_TIME_ZONE})`;