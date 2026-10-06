export type OpsTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type OpsErrorKind = 'auth' | 'denied' | 'retry' | 'invalid' | 'conflict' | 'network';
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
export function dimensioningStatusLabel(value: string | null | undefined): string;
export function dimensioningStatusTone(value: string | null | undefined): OpsTone;
export function coverageGapStatusLabel(value: string | null | undefined): string;
export function coverageGapStatusTone(value: string | null | undefined): OpsTone;
export function scheduleVersionStatusLabel(value: string | null | undefined): string;
export function scheduleVersionStatusTone(value: string | null | undefined): OpsTone;
export function coverageRequestStatusLabel(value: string | null | undefined): string;
export function coverageRequestStatusTone(value: string | null | undefined): OpsTone;
export function handoverStatusLabel(value: string | null | undefined): string;
export function handoverStatusTone(value: string | null | undefined): OpsTone;
export function occurrenceStatusLabel(value: string | null | undefined): string;
export function occurrenceStatusTone(value: string | null | undefined): OpsTone;
export function severityLabel(value: string | null | undefined): string;
export function severityTone(value: string | null | undefined): OpsTone;
export function checklistInstanceStatusLabel(value: string | null | undefined): string;
export function checklistInstanceStatusTone(value: string | null | undefined): OpsTone;
export function postTypeLabel(value: string | null | undefined): string;
export function jobRoleTypeLabel(value: string | null | undefined): string;
export function weekdayLabel(value: number | string | null | undefined): string;
export function activeLabel(value: boolean | null | undefined): string;
export function activeTone(value: boolean | null | undefined): OpsTone;
