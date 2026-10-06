// Tipos do vocabulário UX-07 / EXT-06 (família SATISFAÇÃO).
export type SatisfactionErrorKind =
  | 'network' | 'error' | 'invalid' | 'conflict' | 'denied' | 'not_found' | 'unavailable';

export type SatisfactionErrorDescriptor = {
  kind: SatisfactionErrorKind | string;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
  code: string | null;
};

export type SatisfactionTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const ABSENT: string;
export const AVERAGE_NOT_CALCULATED: string;
export const PERIOD_NOT_MEASURED: string;

export function describeSatisfactionError(code: string | null | undefined, status?: number): SatisfactionErrorDescriptor;
export function satisfactionErrorMessage(code: string | null | undefined, status?: number): string;
export function satisfactionErrorVariant(descriptor: SatisfactionErrorDescriptor): 'denied' | 'error';
export function satisfactionErrorFootnote(descriptor: SatisfactionErrorDescriptor): string;

export function enumLabel(group: string, value: unknown): string;
export function enumTone(group: string, value: unknown): SatisfactionTone;

export function surveyTypeLabel(value: unknown): string;
export function surveyTypeTone(value: unknown): SatisfactionTone;
export function methodologyLabel(value: unknown): string;
export function methodologyTone(value: unknown): SatisfactionTone;
export function surveyStatusLabel(value: unknown): string;
export function surveyStatusTone(value: unknown): SatisfactionTone;
export function planStatusLabel(value: unknown): string;
export function planStatusTone(value: unknown): SatisfactionTone;
export function surveyOriginLabel(value: unknown): string;
export function surveyOriginTone(value: unknown): SatisfactionTone;
export function planOriginLabel(value: unknown): string;
export function planOriginTone(value: unknown): SatisfactionTone;
export function satisfactionEventLabel(value: unknown): string;
export function satisfactionEventTone(value: unknown): SatisfactionTone;
export function followUpOperatorLabel(value: unknown): string;
export function actorKindLabel(value: unknown): string;
export function actorKindTone(value: unknown): SatisfactionTone;
export function absenceLabel(value: unknown): string;

export function honestDate(value: unknown): string;
export function honestDateTime(value: unknown): string;
export function count(value: unknown): string;
export function honestNumber(value: unknown, maximumFractionDigits?: number): string;
export function honestAverage(value: unknown, maximumFractionDigits?: number): string;
export function honestText(value: unknown): string;
export function scaleLabel(min: unknown, max: unknown): string;
export function triggerRuleSummary(rule: unknown): string;
export function factsSummary(facts: unknown): string;

export const ERROR_MESSAGES: Readonly<Record<string, {
  kind: string; title: string; detail: string; canRetry: boolean;
}>>;
export const ENUMS: Readonly<Record<string, Record<string, [string, SatisfactionTone]>>>;
