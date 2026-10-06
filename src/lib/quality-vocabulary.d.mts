// Tipos do vocabulário UX-07 / EXT-05 (família QUALIDADE).
export type QualityErrorKind =
  | 'network' | 'error' | 'invalid' | 'conflict' | 'denied' | 'not_found' | 'unavailable';

export type QualityErrorDescriptor = {
  kind: QualityErrorKind | string;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
  code: string | null;
};

export type QualityTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const ABSENT: string;
export const PERCENT_NOT_CALCULATED: string;

export function describeQualityError(code: string | null | undefined, status?: number): QualityErrorDescriptor;
export function qualityErrorMessage(code: string | null | undefined, status?: number): string;
export function qualityErrorVariant(descriptor: QualityErrorDescriptor): 'denied' | 'error';
export function qualityErrorFootnote(descriptor: QualityErrorDescriptor): string;

export function enumLabel(group: string, value: unknown): string;
export function enumTone(group: string, value: unknown): QualityTone;

export function ncStatusLabel(value: unknown): string;
export function ncStatusTone(value: unknown): QualityTone;
export function severityLabel(value: unknown): string;
export function severityTone(value: unknown): QualityTone;
export function actionStatusLabel(value: unknown): string;
export function actionStatusTone(value: unknown): QualityTone;
export function verificationOutcomeLabel(value: unknown): string;
export function verificationOutcomeTone(value: unknown): QualityTone;
export function qualityOriginLabel(value: unknown): string;
export function qualityOriginTone(value: unknown): QualityTone;
export function qualityEventLabel(value: unknown): string;
export function qualityEventTone(value: unknown): QualityTone;
export function closureRequirementLabel(value: unknown): string;
export function closureMissingList(missing: unknown): string;

export function honestDate(value: unknown): string;
export function honestDateTime(value: unknown): string;
export function count(value: unknown): string;
export function honestNumber(value: unknown, maximumFractionDigits?: number): string;
export function honestPercent(value: unknown, maximumFractionDigits?: number): string;
export function honestText(value: unknown): string;

export const ERROR_MESSAGES: Readonly<Record<string, {
  kind: string; title: string; detail: string; canRetry: boolean;
}>>;
export const ENUMS: Readonly<Record<string, Record<string, [string, QualityTone]>>>;
