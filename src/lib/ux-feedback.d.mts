export type UxFailureKind =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'gone'
  | 'rate_limited'
  | 'invalid'
  | 'server';

export type UxFailure = {
  kind: UxFailureKind;
  title: string;
  message: string;
  canRetry: boolean;
  code: string | null;
  status: number | null;
};

export const UX_ERROR_MESSAGES: Readonly<Record<string, string>>;

export function describeFailure(input?: { status?: number | null; code?: string | null; cause?: unknown }): UxFailure;

export function readJsonResult<T = unknown>(response: Response): Promise<
  { ok: true; data: T; failure: null } | { ok: false; data: null; failure: UxFailure }
>;

export function failureFromCause(cause?: unknown): UxFailure;
