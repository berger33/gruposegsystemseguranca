// UX-10 / EXT-09 — tipos do vocabulário da família EXPANSÃO.
// Declarações para o consumo em TypeScript; a implementação real e comentada
// está em `expansion-vocabulary.mjs`.

export type ExpansionErrorKind =
  | 'conflict'
  | 'invalid'
  | 'not_found'
  | 'denied'
  | 'unavailable'
  | 'network'
  | 'error';

export type ExpansionErrorDescriptor = {
  code: string | null;
  status: number;
  kind: ExpansionErrorKind;
  title: string;
  detail: string;
  canRetry: boolean;
};

export type ExpansionTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export declare const ERROR_MESSAGES: Readonly<Record<string, Omit<ExpansionErrorDescriptor, 'code' | 'status'>>>;
export declare const ENUMS: Readonly<Record<string, Record<string, [string, ExpansionTone]>>>;
export declare const PLAN_TRANSITIONS: Readonly<Record<string, readonly string[]>>;
export declare const TERMINAL_STATUSES: readonly string[];
export declare const READ_ROLES: readonly string[];
export declare const EDIT_ROLES: readonly string[];
export declare const APPROVE_ROLES: readonly string[];
export declare const APPROVAL_ONLY_TRANSITIONS: readonly string[];
export declare const JUSTIFICATION_REQUIRED_TRANSITIONS: readonly string[];

export declare const ABSENT: string;
export declare const MONEY_ABSENT: string;
export declare const MARGIN_NOT_CALCULATED: string;
export declare const PERCENT_NOT_CALCULATED: string;
export declare const CAPACITY_ABSENT: string;
export declare const ESTIMATE_BOUNDARY: string;
export declare const EXTERNAL_BOUNDARY: string;

export declare function describeExpansionError(code: string | null, status?: number): ExpansionErrorDescriptor;
export declare function expansionErrorMessage(code: string | null, status?: number): string;
export declare function expansionErrorVariant(descriptor?: ExpansionErrorDescriptor): 'denied' | 'error';
export declare function expansionErrorFootnote(descriptor?: ExpansionErrorDescriptor): string;

export declare function enumLabel(group: string, value: unknown): string;
export declare function enumTone(group: string, value: unknown): ExpansionTone;
export declare const planStatusLabel: (value: unknown) => string;
export declare const planStatusTone: (value: unknown) => ExpansionTone;
export declare const transitionActionLabel: (value: unknown) => string;
export declare const transitionActionTone: (value: unknown) => ExpansionTone;
export declare const planEventLabel: (value: unknown) => string;
export declare const planEventTone: (value: unknown) => ExpansionTone;

export declare function allowedTransitions(status: unknown): readonly string[];
export declare function isTerminalStatus(status: unknown): boolean;
export declare function requiresJustification(status: unknown): boolean;
export declare function requiresApprovalRole(status: unknown): boolean;

export declare function honestMoney(value: unknown): string;
export declare function honestMargin(value: unknown): string;
export declare function honestCapacity(value: unknown): string;
export declare function count(value: unknown): string;
export declare function honestPercent(value: unknown, maximumFractionDigits?: number): string;
export declare function honestDate(value: unknown): string;
export declare function honestDateTime(value: unknown): string;
export declare function honestText(value: unknown): string;
export declare function honestMilestone(value: unknown, pendingLabel: string): string;
