// Tipos do vocabulário UX-07 / EXT-08 (família CONHECIMENTO).
export type KnowledgeErrorKind =
  | 'network' | 'error' | 'invalid' | 'conflict' | 'denied' | 'not_found' | 'unavailable';

export type KnowledgeErrorDescriptor = {
  kind: KnowledgeErrorKind | string;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
  code: string | null;
};

export type KnowledgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const ABSENT: string;
export const PERCENT_NOT_CALCULATED: string;

export const KB_NEXT_STATUS: Readonly<Record<string, readonly string[]>>;

export function describeKnowledgeError(code: string | null | undefined, status?: number): KnowledgeErrorDescriptor;
export function knowledgeErrorMessage(code: string | null | undefined, status?: number): string;
export function knowledgeErrorVariant(descriptor: KnowledgeErrorDescriptor): 'denied' | 'error';
export function knowledgeErrorFootnote(descriptor: KnowledgeErrorDescriptor): string;

export function enumLabel(group: string, value: unknown): string;
export function enumTone(group: string, value: unknown): KnowledgeTone;

export function kbStatusLabel(value: unknown): string;
export function kbStatusTone(value: unknown): KnowledgeTone;
export function knowledgeOriginLabel(value: unknown): string;
export function knowledgeOriginTone(value: unknown): KnowledgeTone;
export function knowledgeEventLabel(value: unknown): string;
export function knowledgeEventTone(value: unknown): KnowledgeTone;
export function ackSourceLabel(value: unknown): string;
export function accessRoleLabel(value: unknown): string;
export function accessRoleTone(value: unknown): KnowledgeTone;
export function accessScopeLabel(roles: unknown): string;

export function honestDate(value: unknown): string;
export function honestDateTime(value: unknown): string;
export function count(value: unknown): string;
export function honestNumber(value: unknown, maximumFractionDigits?: number): string;
export function honestPercent(value: unknown, maximumFractionDigits?: number): string;
export function honestText(value: unknown): string;

export const ERROR_MESSAGES: Readonly<Record<string, {
  kind: string; title: string; detail: string; canRetry: boolean;
}>>;
export const ENUMS: Readonly<Record<string, Record<string, [string, KnowledgeTone]>>>;
