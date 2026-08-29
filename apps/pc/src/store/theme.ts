import { create } from 'zustand';
import darkCss from '@/theme/dark.json';
import lightCss from '@/theme/light.json';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ChatsFontSize = 'small' | 'medium' | 'large';

export type EffectiveMode = 'light' | 'dark';

const THEME_KEY = 'theme';
const FONT_KEY = 'chatFontSize';

const FONT_SCALE: Record<ChatsFontSize, string> = {
  small: '0.875',
  medium: '1',
  large: '1.125',
};

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];
const FONT_SIZES: ChatsFontSize[] = ['small', 'medium', 'large'];

export function getEffectiveMode(mode: ThemeMode): EffectiveMode {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function read<T extends string>(key: string, fallback: T, valid: T[]): T {
  try {
    const value = localStorage.getItem(key);
    return value !== null && valid.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function applyCssVars(mode: ThemeMode) {
  const css = getEffectiveMode(mode) === 'dark' ? darkCss : lightCss;
  const root = document.documentElement;
  css.forEach((item) => root.style.setProperty(item.name, item.value));
}

export function applyFontVars(fontSize: ChatsFontSize) {
  document.documentElement.style.setProperty(
    '--chat-font-scale',
    FONT_SCALE[fontSize],
  );
}

interface ThemeState {
  mode: ThemeMode;
  fontSize: ChatsFontSize;
  setMode: (mode: ThemeMode) => void;
  setFontSize: (fontSize: ChatsFontSize) => void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  mode: read(THEME_KEY, 'light', THEME_MODES),
  fontSize: read(FONT_KEY, 'medium', FONT_SIZES),
  setMode: (mode) => {
    localStorage.setItem(THEME_KEY, mode);
    set({ mode });
  },
  setFontSize: (fontSize) => {
    localStorage.setItem(FONT_KEY, fontSize);
    set({ fontSize });
  },
}));
