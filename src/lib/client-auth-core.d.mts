export declare const PASSWORD_MIN_LENGTH: number;
export declare const PASSWORD_MAX_LENGTH: number;
export declare const SCRYPT_FORMAT: string;
export declare const SCRYPT_N: number;
export declare const SCRYPT_R: number;
export declare const SCRYPT_P: number;
export declare const SCRYPT_KEYLEN: number;
export declare const SCRYPT_SALT_BYTES: number;
export declare const TOKEN_BYTES: number;
export declare const SESSION_TTL_MS: number;
export declare const INVITE_TTL_MS: number;
export declare const CONFIRM_EMAIL_TTL_MS: number;
export declare const PASSWORD_RESET_TTL_MS: number;
export declare const RESEND_MAX_PER_ADDRESS_24H: number;
export declare const RESEND_MIN_INTERVAL_MS: number;
export declare const LOGIN_FREE_ATTEMPTS: number;
export declare const LOGIN_DELAY_TIERS_SECONDS: readonly [number, number, number];
export declare const LOGIN_FAILURE_RESET_MS: number;
export declare const COMMON_PASSWORDS: readonly string[];

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; error: "password_required" | "password_too_short" | "password_too_long" | "password_common" };

export declare function validatePasswordPolicy(password: unknown): PasswordPolicyResult;
export declare function normalizeEmail(candidate: unknown): { value: string } | { error: "invalid_email" };
export declare function generateToken(): string;
export declare function hashToken(token: string): string;
export declare function hashOrigin(ip: string): string;
export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(password: string, stored: unknown): Promise<boolean>;
export declare function loginThrottleDelaySeconds(consecutiveFailures: number): number;
export declare function throttleShouldReset(lastFailureAt: number | Date | null | undefined, now: number): boolean;
export declare function resendPolicyAllows(recentTimestamps: Array<Date | number>, now: number): boolean;
