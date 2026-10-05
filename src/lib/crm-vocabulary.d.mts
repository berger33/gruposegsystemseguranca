export type CrmOption = { value: string; label: string; hint?: string };
export type CrmErrorKind = 'auth' | 'denied' | 'retry' | 'invalid';
export type CrmErrorDescriptor = { code: string; kind: CrmErrorKind; title: string; detail: string };

export const OPPORTUNITY_STAGES: readonly CrmOption[];
export const OPEN_OPPORTUNITY_STAGES: readonly string[];
export const OPPORTUNITY_PRIORITIES: readonly CrmOption[];
export const COMPANY_TYPES: readonly CrmOption[];
export const COMPANY_STATUS: readonly CrmOption[];
export const IMPORT_ROW_STATUS: readonly CrmOption[];

export function stageLabel(value: string | null | undefined): string;
export function stageHint(value: string | null | undefined): string;
export function priorityLabel(value: string | null | undefined): string;
export function companyTypeLabel(value: string | null | undefined): string;
export function companyStatusLabel(value: string | null | undefined): string;
export function importRowStatusLabel(value: string | null | undefined): string;
export function isOpenStage(value: string | null | undefined): boolean;
export function describeCrmError(code: string | null | undefined, status?: number): CrmErrorDescriptor;
export function isRetryable(descriptor: CrmErrorDescriptor | null | undefined): boolean;
