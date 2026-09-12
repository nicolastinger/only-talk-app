export type ThemeMode = "light" | "dark";

export interface ThemeConfig {
  mode: ThemeMode;
  primaryColor: string;
  custom?: Record<string, unknown>;
}

export interface ThemeState extends ThemeConfig {
  useSystemTheme: boolean;
  useCustomTheme: boolean;
}
