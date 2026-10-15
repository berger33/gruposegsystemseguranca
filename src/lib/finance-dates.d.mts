/**
 * UX-PRO-07F-1 — declarações de tipo do módulo de tela `finance-dates.mjs`
 * (datas e fuso das 20 exibições de `/admin/financeiro`).
 *
 * O valor recebido é `unknown` de propósito: as linhas renderizadas vêm de
 * respostas JSON tipadas frouxamente e a função precisa poder ser chamada com
 * qualquer campo sem que o `tsc` recuse a chamada. O que ela devolve é sempre
 * `string` — nunca `null`, nunca `undefined`, nunca "Invalid Date".
 */
export function financeDate(value: unknown): string;
export function financeMonth(value: unknown): string;
export function financeDateTime(value: unknown): string;

export const FINANCE_DATE_ABSENT: string;
export const FINANCE_DATE_TIME_ABSENT: string;
