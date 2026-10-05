export type HrOption = { value: string; label: string; hint?: string; tone?: HrTone };
export type HrTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type HrErrorKind = 'auth' | 'denied' | 'retry' | 'invalid' | 'conflict' | 'network';
export type HrErrorDescriptor = {
  code: string | null;
  kind: HrErrorKind;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
};

export const EMPLOYEE_STATUS: readonly HrOption[];
export const ADMISSION_STATUS: readonly HrOption[];
export const SELF_REQUEST_TYPES: readonly HrOption[];
export const SELF_REQUEST_STATUS: readonly HrOption[];
export const DOCUMENT_STATUS: readonly HrOption[];
export const DOCUMENT_KINDS: readonly HrOption[];
export const TERMINATION_TYPES: readonly HrOption[];
export const COMPENSATION_DOCUMENT_KINDS: readonly string[];

export function employeeStatusLabel(value: string | null | undefined): string;
export function employeeStatusHint(value: string | null | undefined): string;
export function admissionStatusLabel(value: string | null | undefined): string;
export function selfRequestTypeLabel(value: string | null | undefined): string;
export function selfRequestStatusLabel(value: string | null | undefined): string;
export function selfRequestStatusTone(value: string | null | undefined): HrTone;
export function documentStatusLabel(value: string | null | undefined): string;
export function documentStatusTone(value: string | null | undefined): HrTone;
export function documentKindLabel(value: string | null | undefined): string;
export function terminationTypeLabel(value: string | null | undefined): string;
export function isTerminable(status: string | null | undefined): boolean;
export function describeHrError(code: string | null | undefined, status: number): HrErrorDescriptor;
export function hrErrorVariant(descriptor: HrErrorDescriptor | null | undefined): 'denied' | 'error';
