export type FinTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type FinErrorKind = 'auth' | 'denied' | 'retry' | 'invalid' | 'conflict' | 'network' | 'error';
export type FinErrorDescriptor = {
  code: string | null;
  kind: FinErrorKind;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
};

export function describeFinError(code: string | null | undefined, status?: number): FinErrorDescriptor;
export function finErrorVariant(descriptor: FinErrorDescriptor | null | undefined): 'denied' | 'error';
export function finErrorFootnote(descriptor: FinErrorDescriptor | null | undefined): string;

export function accountStatusLabel(value: string | null | undefined): string;
export function accountStatusTone(value: string | null | undefined): FinTone;
export function conciliationStatusLabel(value: string | null | undefined): string;
export function conciliationStatusTone(value: string | null | undefined): FinTone;
export function budgetStatusLabel(value: string | null | undefined): string;
export function moneyLabel(cents: string | number | null | undefined): string;
