export type AdminNavModule = { href: string; label: string; roles?: readonly string[] };
export type AdminNavGroup<T extends AdminNavModule> = { id: string; label: string; modules: T[] };
export const ADMIN_GROUPS: readonly { id: string; label: string; hrefs: readonly string[] }[];
export function groupAdminModules<T extends AdminNavModule>(modules: readonly T[]): AdminNavGroup<T>[];
export function searchAdminGroups<T extends AdminNavModule>(groups: readonly AdminNavGroup<T>[], term: string): AdminNavGroup<T>[];
