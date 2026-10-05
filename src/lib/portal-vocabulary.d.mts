export type PortalTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type PortalErrorKind = 'auth' | 'denied' | 'retry' | 'invalid' | 'conflict' | 'network' | 'error';
export type PortalErrorDescriptor = {
  code: string | null;
  kind: PortalErrorKind;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
};
export type PortalOption = { value: string; label: string; tone?: PortalTone };

export const EMPLOYEE_REQUEST_TYPES: readonly PortalOption[];
export const EMPLOYEE_SEVERITIES: readonly PortalOption[];
export const EMPLOYEE_OCCURRENCE_CATEGORIES: readonly PortalOption[];

export function describePortalError(code: string | null | undefined, status?: number): PortalErrorDescriptor;
export function portalErrorVariant(descriptor: PortalErrorDescriptor | null | undefined): 'denied' | 'error';
export function portalErrorFootnote(descriptor: PortalErrorDescriptor | null | undefined): string;
export function portalShouldSignIn(descriptor: PortalErrorDescriptor | null | undefined): boolean;
export function accountStatusLabel(value: string | null | undefined): string;
export function accountStatusTone(value: string | null | undefined): PortalTone;
export function ticketStatusLabel(value: string | null | undefined): string;
export function ticketStatusTone(value: string | null | undefined): PortalTone;
export function employeeItemStatusLabel(value: string | null | undefined): string;
export function employeeItemStatusTone(value: string | null | undefined): PortalTone;
