// Tipos do vocabulário UX-07 / EXT-02 (família TERCEIROS).
export type ThirdPartyErrorKind =
  | 'network' | 'error' | 'invalid' | 'conflict' | 'denied' | 'not_found' | 'unavailable';

export type ThirdPartyErrorDescriptor = {
  kind: ThirdPartyErrorKind | string;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
  code: string | null;
};

export type ThirdPartyTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const ABSENT: string;
export const NO_RESPONSIBLE: string;
export const NO_CONTRACT: string;
export const NO_EVALUATION: string;
export const NO_THIRD_PARTY_REGISTERED: string;
export const EXTERNAL_BOUNDARY: string;

export function describeThirdPartyError(code: string | null | undefined, status?: number): ThirdPartyErrorDescriptor;
export function thirdPartyErrorMessage(code: string | null | undefined, status?: number): string;
export function thirdPartyErrorVariant(descriptor: ThirdPartyErrorDescriptor): 'denied' | 'error';
export function thirdPartyErrorFootnote(descriptor: ThirdPartyErrorDescriptor): string;

export function enumLabel(group: string, value: unknown): string;
export function enumTone(group: string, value: unknown): ThirdPartyTone;

export function thirdPartyStatusLabel(value: unknown): string;
export function thirdPartyStatusTone(value: unknown): ThirdPartyTone;
export function scopeKindLabel(value: unknown): string;
export function scopeKindTone(value: unknown): ThirdPartyTone;
export function windowStatusLabel(value: unknown): string;
export function windowStatusTone(value: unknown): ThirdPartyTone;
export function accessSituationLabel(value: unknown): string;
export function accessSituationTone(value: unknown): ThirdPartyTone;
export function decisionReasonLabel(value: unknown): string;
export function decisionReasonTone(value: unknown): ThirdPartyTone;
export function documentExpiryLabel(value: unknown): string;
export function documentExpiryTone(value: unknown): ThirdPartyTone;
export function thirdPartyEventLabel(value: unknown): string;
export function thirdPartyEventTone(value: unknown): ThirdPartyTone;
export function documentRuleAbsenceLabel(value: unknown): string;

export function honestDate(value: unknown): string;
export function honestDateTime(value: unknown): string;
export function count(value: unknown): string;
export function honestText(value: unknown): string;
export function responsibleLabel(value: unknown): string;
export function evaluationScoreLabel(value: unknown): string;
export function windowSummary(window: unknown): string;
export function expirySummary(expiry: unknown): string;
export function errorCodes(): string[];

export const ERROR_MESSAGES: Readonly<Record<string, {
  kind: string; title: string; detail: string; canRetry: boolean;
}>>;
export const ENUMS: Readonly<Record<string, Record<string, [string, ThirdPartyTone]>>>;
