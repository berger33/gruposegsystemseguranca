export type KnowledgeErrorDescriptor = {
  kind: string;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
  code: string | null;
};

export const ABSENT: string;
export const KNOWLEDGE_ERROR_MESSAGES: Readonly<Record<string, { kind: string; title: string; detail: string; canRetry: boolean }>>;
export const KNOWLEDGE_LIFECYCLE: readonly string[];
export const KNOWLEDGE_ACCESS_ROLES: readonly string[];
export const KNOWLEDGE_CATEGORY_SUGGESTIONS: readonly string[];
export const KNOWLEDGE_TRANSITIONS: Readonly<Record<string, readonly string[]>>;

export function describeKnowledgeError(code: string | null | undefined, status?: number): KnowledgeErrorDescriptor;
export function knowledgeErrorVariant(descriptor: KnowledgeErrorDescriptor): 'denied' | 'error';
export function knowledgeErrorFootnote(descriptor: KnowledgeErrorDescriptor): string;
export function enumLabel(group: string, value: unknown): string;
export function enumTone(group: string, value: unknown): string;
export function knowledgeStatusLabel(value: unknown): string;
export function knowledgeStatusTone(value: unknown): string;
export function knowledgeRoleLabel(value: unknown): string;
export function knowledgeRoleTone(value: unknown): string;
export function knowledgeAccessRolesLabel(value: unknown): string;
export function knowledgeCategoryLabel(value: unknown): string;
export function knowledgeCategoryTone(value: unknown): string;
export function knowledgeAcknowledgmentSourceLabel(value: unknown): string;
export function knowledgeTagLabel(value: unknown): string;
export function knowledgeTagsLabel(value: unknown): string;
export function honestText(value: unknown, absent?: string): string;
export function honestDate(value: unknown): string;
export function honestDateTime(value: unknown): string;
export function honestCount(value: unknown): string;
export function knowledgeHistorySummary(value: unknown): string;
