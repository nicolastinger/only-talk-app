import { create } from 'zustand';
import darkCss from '@/theme/dark.json';
import lightCss from '@/theme/light.json';
import { kv_get, kv_set } from '@workspace/services';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ChatsFontSize = 'small' | 'medium' | 'large';

export type EffectiveMode = 'light' | 'dark';

const THEME_KEY = 'ui_theme';
const FONT_KEY = 'ui_chat_font_size';

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

export const useThemeStore = create<ThemeState>()((set) => {
  kv_get(THEME_KEY)
    .then((value) => {
      if (value && (THEME_MODES as string[]).includes(value)) {
        set({ mode: value as ThemeMode });
      }
    })
    .catch(() => {});
  kv_get(FONT_KEY)
    .then((value) => {
      if (value && (FONT_SIZES as string[]).includes(value)) {
        set({ fontSize: value as ChatsFontSize });
      }
    })
    .catch(() => {});

  return {
    mode: 'light',
    fontSize: 'medium',
    setMode: (mode) => {
      kv_set(THEME_KEY, mode).catch(() => {});
      set({ mode });
    },
    setFontSize: (fontSize) => {
      kv_set(FONT_KEY, fontSize).catch(() => {});
      set({ fontSize });
    },
  };
});
