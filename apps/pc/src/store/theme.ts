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
  applyCssVarsTo(document.documentElement, getEffectiveMode(mode));
}

function applyCssVarsTo(el: HTMLElement, theme: EffectiveMode) {
  const css = theme === 'dark' ? darkCss : lightCss;
  css.forEach((item) => el.style.setProperty(item.name, item.value));
}

/** 读取指定主题的背景色（通过临时探针元素读取 CSS 变量，同步执行无闪烁） */
function getThemeBg(theme: EffectiveMode): string {
  const probe = document.createElement('div');
  applyCssVarsTo(probe, theme);
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).getPropertyValue('--bg-color').trim();
  probe.remove();
  return color || 'white';
}

export function applyFontVars(fontSize: ChatsFontSize) {
  document.documentElement.style.setProperty(
    '--chat-font-scale',
    FONT_SCALE[fontSize],
  );
}

/** 主题切换遮罩状态：active 时用新主题色从点击点向外扩散，覆盖完成后切换主题 */
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
  pendingMode: ThemeMode | null;
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
    pendingMode: null,
    setMode: (mode, origin) => {
      const from = getEffectiveMode(get().mode);
      const to = getEffectiveMode(mode);
      if (from !== to) {
        set((s) => ({
          pendingMode: mode,
          reveal: {
            active: true,
            color: getThemeBg(to),
            x: origin?.x ?? window.innerWidth / 2,
            y: origin?.y ?? window.innerHeight / 2,
            key: s.reveal.key + 1,
          },
        }));
        return;
      }
      kv_set(THEME_KEY, mode).catch(() => {});
      set({ mode });
    },
    setFontSize: (fontSize) => {
      kv_set(FONT_KEY, fontSize).catch(() => {});
      set({ fontSize });
    },
    endReveal: () => {
      const pending = get().pendingMode;
      if (pending) {
        // 遮罩仍全覆盖时同步切换主题变量，避免移除遮罩时闪回旧主题
        applyCssVars(pending);
        kv_set(THEME_KEY, pending).catch(() => {});
        set({
          mode: pending,
          pendingMode: null,
          reveal: { active: false, color: '', x: 0, y: 0, key: 0 },
        });
        return;
      }
      set({
        reveal: { active: false, color: '', x: 0, y: 0, key: 0 },
      });
    },
  };
});
