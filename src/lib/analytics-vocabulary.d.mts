// Tipos do vocabulário UX-07 / EXT-11 / F07 (família ANALYTICS).
export type AnalyticsErrorKind =
  | 'network' | 'error' | 'invalid' | 'conflict' | 'denied' | 'not_found' | 'unavailable';

export type AnalyticsErrorDescriptor = {
  kind: AnalyticsErrorKind | string;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
  code: string | null;
};

export type AnalyticsTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const ABSENT: string;
export const PERCENT_NOT_CALCULATED: string;

export function describeAnalyticsError(code: string | null | undefined, status?: number): AnalyticsErrorDescriptor;
export function analyticsErrorMessage(code: string | null | undefined, status?: number): string;
export function analyticsErrorVariant(descriptor: AnalyticsErrorDescriptor): 'denied' | 'error';
export function analyticsErrorFootnote(descriptor: AnalyticsErrorDescriptor): string;

export function enumLabel(group: string, value: unknown): string;
export function enumTone(group: string, value: unknown): AnalyticsTone;

export function experimentStatusLabel(value: unknown): string;
export function experimentStatusTone(value: unknown): AnalyticsTone;
export function experimentOriginLabel(value: unknown): string;
export function experimentOriginTone(value: unknown): AnalyticsTone;
export function observationVariantLabel(value: unknown): string;
export function observationVariantTone(value: unknown): AnalyticsTone;
export function observationSourceLabel(value: unknown): string;
export function observationSourceTone(value: unknown): AnalyticsTone;
export function experimentEventLabel(value: unknown): string;
export function experimentEventTone(value: unknown): AnalyticsTone;

export function honestDate(value: unknown): string;
export function honestDateTime(value: unknown): string;
export function count(value: unknown): string;
export function honestNumber(value: unknown, maximumFractionDigits?: number): string;
export function honestPercent(value: unknown, maximumFractionDigits?: number): string;
export function honestText(value: unknown): string;

export const ERROR_MESSAGES: Readonly<Record<string, {
  kind: string; title: string; detail: string; canRetry: boolean;
}>>;
export const ENUMS: Readonly<Record<string, Record<string, [string, AnalyticsTone]>>>;
