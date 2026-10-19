// UX-PRO-E3 — exibição de data/hora em `/admin/operacao`.
//
// Este arquivo é auxiliar DE TELA, não tradutor de código de servidor: por
// isso não entra em `ops-vocabulary.mjs`, que só traduz códigos que os
// servidores de operação realmente devolvem (anti-deriva em
// `tests/ux-ops-vocabulary.test.mjs`). Mesma decisão já registrada em
// `src/lib/finance-dates.mjs` e em `src/lib/ops-request.ts`.
//
// Defeito corrigido: sete linhas de `OperacaoWorkspace.tsx` exibiam carimbos
// `TIMESTAMPTZ` por `String(valor).slice(0, 16).replace("T", " ")`. Um instante
// `2026-10-05T14:32:00Z` aparecia como `2026-10-05 14:32` — três horas
// adiantado em São Paulo e sem qualquer indicação de fuso.
//
// Decisão do proprietário em 19/10/2026 (registrada em
// `docs/UX-PRO-E3-ESCOPO-ANTES-2026-10-19.md`, Q1 = via (a), Q2 =
// `America/Sao_Paulo`, Q3 = ISO secundário nas sete linhas):
//
//  * `opsDateTime` mostra o instante no fuso `America/Sao_Paulo`, com o fuso
//    DECLARADO no próprio texto: `05/10/2026 11:32 (America/Sao_Paulo)`.
//    O fuso é fixo e explícito — o texto não depende da máquina de quem opera.
//  * `opsIsoStamp` devolve o instante ISO ORIGINAL, para continuar visível como
//    texto secundário e auditável na própria tela.
//  * ausente é ausente: `null`/`undefined`/`''` viram uma declaração explícita
//    (`Não informado`), nunca data inventada nem célula vazia;
//  * formato inesperado volta como veio: nada é adivinhado nem convertido.
//
// Só carimbos com hora são aceitos (`AAAA-MM-DDTHH:mm[...]`). Data de
// calendário (`DATE`) NÃO passa por aqui: `new Date('2026-10-05')` é meia-noite
// UTC e viraria o dia anterior em São Paulo. As colunas `DATE` desta rota
// continuam exatamente como estavam (fora do escopo desta fatia).

/** Fuso usado e declarado nas sete exibições desta rota. */
export const OPS_TIME_ZONE = 'America/Sao_Paulo';

/** Texto exibido quando o carimbo de data e hora não foi informado. */
export const OPS_DATETIME_ABSENT = 'Não informado';

const STAMP_WITH_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

const SAO_PAULO_STAMP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: OPS_TIME_ZONE,
  hourCycle: 'h23',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function isAbsent(value) {
  return value == null || String(value).trim() === '';
}

function parseStamp(value) {
  const text = String(value).trim();
  if (!STAMP_WITH_TIME.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Carimbo (`TIMESTAMPTZ`) como `DD/MM/AAAA HH:mm (America/Sao_Paulo)`.
 * Ausente → `Não informado`; valor fora do padrão → devolvido como veio.
 */
export function opsDateTime(value) {
  if (isAbsent(value)) return OPS_DATETIME_ABSENT;
  const date = parseStamp(value);
  if (!date) return String(value);
  const parts = {};
  for (const part of SAO_PAULO_STAMP.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute} (${OPS_TIME_ZONE})`;
}

/**
 * Instante ISO ORIGINAL do carimbo, preservado como texto secundário.
 * Ausente ou fora do padrão (inclusive data de calendário) → string vazia.
 */
export function opsIsoStamp(value) {
  if (isAbsent(value)) return '';
  if (!parseStamp(value)) return '';
  return String(value).trim();
}
