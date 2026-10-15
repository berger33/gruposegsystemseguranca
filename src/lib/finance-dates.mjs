// UX-PRO-07F-1 — exibição de data/hora em `/admin/financeiro`.
//
// Este arquivo é auxiliar DE TELA, não tradutor de código de servidor: por isso
// não entra em `finance-vocabulary.mjs`, que só traduz códigos que os servidores
// financeiros realmente devolvem (anti-deriva em `tests/ux-finance-vocabulary.test.mjs`).
// Mesma decisão já registrada em `src/lib/finance-request.ts:69-80`.
//
// O defeito corrigido nesta fatia: 20 exibições de data/hora saíam em ISO cru
// (`String(x).slice(0,10)`, `slice(0,7)`) e os 3 carimbos `timestamptz` saíam por
// `new Date(x).toLocaleString("pt-BR")`, que herda o fuso da MÁQUINA de quem
// opera — o mesmo instante aparecia com horas diferentes em máquinas diferentes.
//
// Regras (determinísticas, sem inventar dado):
//
//  * `DATE` é data de CALENDÁRIO: não tem fuso. Aqui ela é montada a partir dos
//    DÍGITOS da string (sem `Intl` e sem `new Date`), porque converter por
//    `new Date`/`Intl` reintroduziria exatamente o deslocamento de um dia que
//    esta fatia elimina (ex.: `2037-02-15T00:00:00Z` viraria 14/02 em UTC-3).
//  * `TIMESTAMPTZ` é instante: o fuso é DECLARADO na própria frase (`UTC`), a
//    convenção já vigente no repositório — `timeZone:'UTC'` explícito nos
//    vocabulários de analytics, compliance, expansion, fleet, knowledge,
//    quality, satisfaction e third-party, e nos auxiliares `honestDate`/
//    `honestDateTime`. «Horário de Brasília» NÃO está ratificado no repositório,
//    então não é introduzido aqui.
//  * ausente é ausente: `null`/`undefined`/`''` viram uma declaração explícita
//    (`Não informada`/`Não informado`), nunca data inventada nem célula vazia;
//  * formato inesperado volta como veio: nada é adivinhado nem convertido.

/** Texto exibido quando a data de calendário não foi informada. */
export const FINANCE_DATE_ABSENT = 'Não informada';

/** Texto exibido quando o carimbo de data e hora não foi informado. */
export const FINANCE_DATETIME_ABSENT = 'Não informado';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const CALENDAR_MONTH = /^(\d{4})-(\d{2})/;

/**
 * Carimbo UTC usado nos três `timestamptz` da rota. `hourCycle: 'h23'` mantém
 * 00:00–23:59 (sem AM/PM); o fuso é fixo e explícito para que o texto não
 * dependa da máquina de quem opera.
 */
const UTC_STAMP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  hourCycle: 'h23',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Data de calendário (`DATE`) como `DD/MM/AAAA`, montada dos dígitos.
 * Ausente → `Não informada`; texto fora do padrão → devolvido como veio.
 */
export function financeDate(value) {
  if (value == null || value === '') return FINANCE_DATE_ABSENT;
  const text = String(value).trim();
  if (text === '') return FINANCE_DATE_ABSENT;
  const match = CALENDAR_DATE.exec(text);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Competência (`DATE`) como `MM/AAAA` — mesma regra de `financeDate`, sem o dia.
 * Usada só onde o mês é a unidade de leitura (fechamento e reabertura).
 */
export function financeMonth(value) {
  if (value == null || value === '') return FINANCE_DATE_ABSENT;
  const text = String(value).trim();
  if (text === '') return FINANCE_DATE_ABSENT;
  const match = CALENDAR_MONTH.exec(text);
  if (!match) return String(value);
  return `${match[2]}/${match[1]}`;
}

/**
 * Carimbo (`TIMESTAMPTZ`) como `DD/MM/AAAA HH:mm UTC`, com o fuso declarado.
 * Ausente → `Não informado`; valor que não é data → devolvido como veio.
 */
export function financeDateTime(value) {
  if (value == null || value === '') return FINANCE_DATETIME_ABSENT;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return `${UTC_STAMP.format(date).replace(/,\s*/, ' ')} UTC`;
}
