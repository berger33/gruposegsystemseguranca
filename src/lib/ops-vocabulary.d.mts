export type OpsTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type OpsErrorKind = 'auth' | 'denied' | 'retry' | 'invalid' | 'conflict' | 'network' | 'error';
export type OpsErrorDescriptor = {
  code: string | null;
  kind: OpsErrorKind;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
};

export function describeOpsError(code: string | null | undefined, status?: number): OpsErrorDescriptor;
export function opsErrorVariant(descriptor: OpsErrorDescriptor | null | undefined): 'denied' | 'error';
export function opsErrorFootnote(descriptor: OpsErrorDescriptor | null | undefined): string;

export function allocationStatusLabel(value: string | null | undefined): string;
export function allocationStatusTone(value: string | null | undefined): OpsTone;
export function scheduleVersionStatusLabel(value: string | null | undefined): string;
export function scheduleVersionStatusTone(value: string | null | undefined): OpsTone;
export function scheduleEntryStatusLabel(value: string | null | undefined): string;
export function dimensioningStatusLabel(value: string | null | undefined): string;
export function gapStatusLabel(value: string | null | undefined): string;
export function coverageRequestStatusLabel(value: string | null | undefined): string;
export function handoverStatusLabel(value: string | null | undefined): string;
export function occurrenceStatusLabel(value: string | null | undefined): string;
export function checklistStatusLabel(value: string | null | undefined): string;
export function occurrenceSeverityLabel(value: string | null | undefined): string;
export function occurrenceSeverityTone(value: string | null | undefined): OpsTone;
export function postTypeLabel(value: string | null | undefined): string;
export function roleTypeLabel(value: string | null | undefined): string;
export function shiftTypeLabel(value: string | null | undefined): string;
export function weekdayLabel(value: number | string | null | undefined): string;
