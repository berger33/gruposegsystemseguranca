export interface Theme {
  id: string;
  name: string;
  desc: string;
}
export const THEMES: Theme[];
export const DEFAULT_THEME: string;
export function getThemeTokens(id: string): Record<string, string>;
