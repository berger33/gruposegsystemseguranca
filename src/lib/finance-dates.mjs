// UX-PRO-07F-1 — datas e fuso da tela `/admin/financeiro`.
//
// As 20 exibições de data/hora das nove áreas financeiras
// (`FinanceiroWorkspace.tsx` e as áreas FIN-05..FIN-16) deixaram de imprimir o
// valor cru em ISO. O texto agora sai em pt-BR: `DD/MM/AAAA` para as 17
// colunas `DATE` (`db/migrations/077:43`, `078:34`, `080`, `159:27-28`),
// `MM/AAAA` para competência e `DD/MM/AAAA HH:mm UTC` para os 3 carimbos
// `TIMESTAMPTZ` — `fin_commission_provisions.reviewed_at`
// (`db/migrations/080:151`), `fin_exports.created_at` (`080:95`) e
// `fin_budget_history.changed_at` (`132:5`).
//
// POR QUE ESTE MÓDULO NÃO FICA EM `finance-vocabulary.mjs`: mesma razão
// registrada em `src/lib/finance-request.ts:60-80`. O vocabulário canônico
// (`src/lib/finance-vocabulary.mjs`, provado por
// `tests/ux-finance-vocabulary.test.mjs`) explica CÓDIGO DE SERVIDOR — e o
// valor explicado continua canônico, idêntico ao que a API devolve. Formato de
// data de tela é decisão de APRESENTAÇÃO, usada só pelos componentes desta
// rota; mexer no vocabulário canônico alteraria valores já provados por outra
// fatia, contra a regra aditiva do `AGENTS.md`. Este módulo é de tela, não de
// domínio.
//
// POR QUE UTC, E POR QUE DECLARADO NO TEXTO: o fuso já é decisão deste
// repositório para exibição de instante — `timeZone:'UTC'` em
// `analytics-vocabulary.mjs:219,228`, `compliance-vocabulary.mjs:306,315`,
// `expansion-vocabulary.mjs:469,478`, `fleet-vocabulary.mjs:274,283`,
// `knowledge-vocabulary.mjs:163,171`, `quality-vocabulary.mjs:231,240`,
// `satisfaction-vocabulary.mjs:262,271`, `third-party-vocabulary.mjs:330` e
// `intel-vocabulary.mjs:54`, além de `honestDate`/`honestDateTime`. O defeito
// corrigido aqui é outro: `new Date(x).toLocaleString("pt-BR")` herdava o fuso
// da MÁQUINA que renderiza, então o mesmo carimbo aparecia com horas diferentes
// em fusos diferentes. Com o fuso fixado e escrito no texto (`… UTC`), o
// carimbo sai igual em qualquer máquina — e quem lê sabe em que fuso está.
//
// NADA É INVENTADO: não se escreve "horário de Brasília" nem qualquer fuso
// local, porque nenhum fuso operacional foi ratificado. O plano mestre propõe
// um fuso configurável (`docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md:84`),
// mas proposto não é ratificado; até que o dono ratifique, o valor declarado é
// o UTC que os dados já carregam.
//
// O CONTRATO NÃO MUDA: nenhum payload, URL, cabeçalho, permissão, alçada,
// idempotência ou trilha de auditoria é tocado. O servidor continua devolvendo
// o valor cru em ISO — o que muda é só o texto que a tela monta. O caso 35 do
// gate prova exatamente isso: os dez endpoints seguem com ISO no 200.
//
// Sem `new Date` e sem `Intl` em `financeDate`/`financeMonth`: a data de
// calendário é LIDA DOS DÍGITOS (`YYYY-MM-DD`), nunca convertida de instante.
// É o que impede o dia de andar para trás ou para frente conforme a máquina —
// `2038-02-17T23:30:00.000Z` continua sendo dia 17, ainda que em Tóquio já
// seja dia 18.

/** Ausência de data de calendário (as três funções nunca inventam uma data). */
export const FINANCE_DATE_ABSENT = 'Não informada';

/** Ausência de carimbo de data e hora. */
export const FINANCE_DATE_TIME_ABSENT = 'Não informado';

const DATA_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})/;
const MES_COMPETENCIA = /^(\d{4})-(\d{2})/;

const FORMATADOR_INSTANTE = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC', hourCycle: 'h23',
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Texto utilizável, sem espaços nas pontas; ausência vira `''`. */
function texto(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return '';
}

/**
 * Data de calendário em `DD/MM/AAAA`. Ausência vira "Não informada"; formato
 * inesperado sai cru e inteiro — nada é truncado e nada é inventado.
 */
export function financeDate(valor) {
  const bruto = texto(valor);
  if (bruto === '') return FINANCE_DATE_ABSENT;
  const partes = DATA_CALENDARIO.exec(bruto);
  if (!partes) return bruto;
  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

/**
 * Competência em `MM/AAAA`. Mesma leitura por dígitos de `financeDate`.
 */
export function financeMonth(valor) {
  const bruto = texto(valor);
  if (bruto === '') return FINANCE_DATE_ABSENT;
  const partes = MES_COMPETENCIA.exec(bruto);
  if (!partes) return bruto;
  return `${partes[2]}/${partes[1]}`;
}

/**
 * Carimbo em `DD/MM/AAAA HH:mm UTC`, com o fuso escrito no texto. Instante
 * inválido sai cru (nunca "Invalid Date"); ausência vira "Não informado".
 */
export function financeDateTime(valor) {
  const bruto = texto(valor);
  if (bruto === '') return FINANCE_DATE_TIME_ABSENT;
  const instante = new Date(bruto);
  if (Number.isNaN(instante.getTime())) return bruto;
  return `${FORMATADOR_INSTANTE.format(instante).replace(',', '')} UTC`;
}
