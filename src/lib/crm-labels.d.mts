export const CRM_STAGE_VALUES: readonly string[];
export const CRM_PRIORITY_VALUES: readonly string[];
export const CRM_COMPANY_TYPE_VALUES: readonly string[];
export const CRM_OPEN_STAGE_VALUES: readonly string[];

export function stageLabel(value: string | null | undefined): string;
export function priorityLabel(value: string | null | undefined): string;
export function companyTypeLabel(value: string | null | undefined): string;
export function companyStatusLabel(value: string | null | undefined): string;
export function importRowStatusLabel(value: string | null | undefined): string;

export function stageOptions(): { value: string; label: string }[];
export function priorityOptions(): { value: string; label: string }[];
export function companyTypeOptions(): { value: string; label: string }[];

export function outcomeNote(opportunity: { is_won?: boolean; is_lost?: boolean } | null | undefined): string;
export function formatCurrencyBRL(value: string | number | null | undefined): string;
export function formatDateBR(value: string | null | undefined): string;
export function formatDateTimeBR(value: string | null | undefined): string;
