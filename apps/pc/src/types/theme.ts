export type ThemeMode = 'light' | 'dark';

export interface ThemeConfig {
  // 主题模式
  mode: ThemeMode;
  // 主题色
  primaryColor: string;
  // 自定义主题配置
  custom?: Record<string, any>;
}

export interface ThemeState extends ThemeConfig {
  // 是否使用系统主题
  useSystemTheme: boolean;
  // 是否使用自定义主题
  useCustomTheme: boolean;
}
