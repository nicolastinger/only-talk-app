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

/** 主题切换遮罩状态：active 时用旧主题色遮罩覆盖全屏，再收缩揭示新主题 */
export interface ThemeRevealState {
  active: boolean;
  color: string;
  x: number;
  y: number;
  key: number;
}

interface ThemeState {
  mode: ThemeMode;
  fontSize: ChatsFontSize;
  reveal: ThemeRevealState;
  setMode: (mode: ThemeMode, origin?: { x: number; y: number }) => void;
  setFontSize: (fontSize: ChatsFontSize) => void;
  endReveal: () => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => {
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
    reveal: { active: false, color: '', x: 0, y: 0, key: 0 },
    setMode: (mode, origin) => {
      const from = getEffectiveMode(get().mode);
      const to = getEffectiveMode(mode);
      kv_set(THEME_KEY, mode).catch(() => {});
      set((s) => ({
        mode,
        reveal:
          from !== to
            ? {
                active: true,
                color:
                  getComputedStyle(document.documentElement)
                    .getPropertyValue('--bg-color')
                    .trim() || 'white',
                x: origin?.x ?? window.innerWidth / 2,
                y: origin?.y ?? window.innerHeight / 2,
                key: s.reveal.key + 1,
              }
            : s.reveal,
      }));
    },
    setFontSize: (fontSize) => {
      kv_set(FONT_KEY, fontSize).catch(() => {});
      set({ fontSize });
    },
    endReveal: () =>
      set({
        reveal: { active: false, color: '', x: 0, y: 0, key: 0 },
      }),
  };
});
