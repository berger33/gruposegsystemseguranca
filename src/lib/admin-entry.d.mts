// Declarações para src/lib/admin-entry.mjs (módulo .mjs puro usado por páginas TSX).

export const ADMIN_HOME_FALLBACK: "/admin";

export const ROLE_HOME: Readonly<Record<string, string>>;
export const ROLE_LABEL: Readonly<Record<string, string>>;

export function roleHome(role: unknown): string;
export function roleLabel(role: unknown): string;
export function sanitizeAdminNext(candidate: unknown): string;
export function resolvePostLoginTarget(input: { role: unknown; next: unknown }): string;
export function legacyLoginEnabled(envLike: unknown): boolean;
export function loginErrorMessage(code: unknown, mode?: "individual" | "legacy"): string;
