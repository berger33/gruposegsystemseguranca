// Tipos do vocabulário UX-07 / EXT-07 (família COMPLIANCE).
export type ComplianceErrorKind =
  | 'network' | 'error' | 'invalid' | 'conflict' | 'denied' | 'not_found' | 'unavailable';

export type ComplianceErrorDescriptor = {
  kind: ComplianceErrorKind | string;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
  code: string | null;
};

export type ComplianceTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const ABSENT: string;
export const PERCENT_NOT_CALCULATED: string;

export function describeComplianceError(code: string | null | undefined, status?: number): ComplianceErrorDescriptor;
export function complianceErrorMessage(code: string | null | undefined, status?: number): string;
export function complianceErrorVariant(descriptor: ComplianceErrorDescriptor): 'denied' | 'error';
export function complianceErrorFootnote(descriptor: ComplianceErrorDescriptor): string;

export function enumLabel(group: string, value: unknown): string;
export function enumTone(group: string, value: unknown): ComplianceTone;

export function documentStatusLabel(value: unknown): string;
export function documentStatusTone(value: unknown): ComplianceTone;
export function complianceTypeLabel(value: unknown): string;
export function complianceTypeTone(value: unknown): ComplianceTone;
export function obligationStatusLabel(value: unknown): string;
export function obligationStatusTone(value: unknown): ComplianceTone;
export function criticalityLabel(value: unknown): string;
export function criticalityTone(value: unknown): ComplianceTone;
export function taskStatusLabel(value: unknown): string;
export function taskStatusTone(value: unknown): ComplianceTone;
export function planStatusLabel(value: unknown): string;
export function planStatusTone(value: unknown): ComplianceTone;
export function planTypeLabel(value: unknown): string;
export function planTypeTone(value: unknown): ComplianceTone;
export function referenceTypeLabel(value: unknown): string;
export function referenceTypeTone(value: unknown): ComplianceTone;
export function complianceOriginLabel(value: unknown): string;
export function complianceOriginTone(value: unknown): ComplianceTone;
export function runStatusLabel(value: unknown): string;
export function runStatusTone(value: unknown): ComplianceTone;
export function runOriginLabel(value: unknown): string;
export function complianceEventLabel(value: unknown): string;
export function complianceEventTone(value: unknown): ComplianceTone;
export function failedClosedReasonLabel(value: unknown): string;
export function failedClosedList(entries: unknown): string;

export function honestDate(value: unknown): string;
export function honestDateTime(value: unknown): string;
export function count(value: unknown): string;
export function honestNumber(value: unknown, maximumFractionDigits?: number): string;
export function honestPercent(value: unknown, maximumFractionDigits?: number): string;
export function honestText(value: unknown): string;

export const ERROR_MESSAGES: Readonly<Record<string, {
  kind: string; title: string; detail: string; canRetry: boolean;
}>>;
export const ENUMS: Readonly<Record<string, Record<string, [string, ComplianceTone]>>>;
