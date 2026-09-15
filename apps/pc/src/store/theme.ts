import { create } from 'zustand';
import { flushSync } from 'react-dom';
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

/** 读取指定主题的背景色，用于无 View Transitions 时的遮罩兜底 */
function themeBg(theme: EffectiveMode): string {
  const probe = document.createElement('div');
  const css = theme === 'dark' ? darkCss : lightCss;
  css.forEach((item) => probe.style.setProperty(item.name, item.value));
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).getPropertyValue('--bg-color').trim();
  probe.remove();
  return color || (theme === 'dark' ? '#000000' : '#ffffff');
}

/** 点击点到最远角的距离，作为圆形遮罩的半径 */
function revealRadius(x: number, y: number): number {
  return Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
}

interface ThemeState {
  mode: ThemeMode;
  fontSize: ChatsFontSize;
  setMode: (mode: ThemeMode, origin?: { x: number; y: number }) => void;
  setFontSize: (fontSize: ChatsFontSize) => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => {
  // 同步应用主题（含 antd）：遮罩全覆盖时调用，避免遮罩移除后闪现旧主题
  const commit = (next: ThemeMode) => {
    const body = document.body;
    const prevTransition = body.style.transition;
    body.style.transition = 'none';
    applyCssVars(next);
    flushSync(() => set({ mode: next }));
    void body.offsetHeight;
    body.style.transition = prevTransition;
    kv_set(THEME_KEY, next).catch(() => {});
  };

  // 切换主题并播放圆形遮罩动画（参考 apps/web/src/theme.ts）
  const reveal = (next: ThemeMode, x: number, y: number) => {
    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => { ready: Promise<void> };
    };

    if (doc.startViewTransition) {
      const transition = doc.startViewTransition(() => commit(next));
      transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${revealRadius(x, y)}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 600,
              easing: 'ease-in',
              pseudoElement: '::view-transition-new(root)',
            },
          );
        })
        .catch(() => {});
      return;
    }

    const radius = revealRadius(x, y);
    const mask = document.createElement('div');
    mask.className = 'theme-mask';
    mask.style.background = themeBg(getEffectiveMode(next));
    mask.style.clipPath = `circle(0px at ${x}px ${y}px)`;
    requestAnimationFrame(() => {
      document.body.appendChild(mask);
      mask
        .animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          { duration: 600, easing: 'ease-in', fill: 'forwards' },
        )
        .addEventListener('finish', () => {
          commit(next);
          mask.remove();
        });
    });
  };

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
    setMode: (mode, origin) => {
      if (mode === get().mode) return;
      const from = getEffectiveMode(get().mode);
      const to = getEffectiveMode(mode);
      if (from === to) {
        kv_set(THEME_KEY, mode).catch(() => {});
        set({ mode });
        return;
      }
      reveal(
        mode,
        origin?.x ?? window.innerWidth / 2,
        origin?.y ?? window.innerHeight / 2,
      );
    },
    setFontSize: (fontSize) => {
      kv_set(FONT_KEY, fontSize).catch(() => {});
      set({ fontSize });
    },
  };
});
