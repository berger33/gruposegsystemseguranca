export type AdmTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type AdmErrorKind = 'auth' | 'denied' | 'retry' | 'invalid' | 'conflict' | 'network';
export type AdmErrorDescriptor = {
  code: string | null;
  kind: AdmErrorKind;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
};
export type AdmOption = { value: string; label: string; tone?: AdmTone };

export const APPROVAL_DECISIONS: readonly AdmOption[];

export function describeAdmError(code: string | null | undefined, status?: number): AdmErrorDescriptor;
export function admErrorVariant(descriptor: AdmErrorDescriptor | null | undefined): 'denied' | 'error';
export function admErrorFootnote(descriptor: AdmErrorDescriptor | null | undefined): string;
export function admPriorityLabel(value: string | null | undefined): string;
export function admPriorityTone(value: string | null | undefined): AdmTone;
