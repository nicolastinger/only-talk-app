import { computed, reactive, watch } from 'vue';
import darkCss from '@/theme/dark.json';
import lightCss from '@/theme/light.json';
import { getAppTheme, kv_get, kv_set, setConfig } from '@workspace/services';
import { CLIENT_CONFIG_KEYS } from '@workspace/types';

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

/** 上一次主题写入的变量名, 切换时先移除, 避免"只在单侧主题定义"的变量残留 */
let appliedThemeVars: string[] = [];

export function applyCssVars(mode: ThemeMode) {
  const css = getEffectiveMode(mode) === 'dark' ? darkCss : lightCss;
  const root = document.documentElement;
  appliedThemeVars.forEach((name) => root.style.removeProperty(name));
  appliedThemeVars = css.map((item) => {
    root.style.setProperty(item.name, item.value);
    return item.name;
  });
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
}

export const themeState = reactive<ThemeState>({
  mode: 'light',
  fontSize: 'medium',
});

/** 系统主题变化监听是否已初始化 */
let systemThemeInitialized = false;

function syncSystemTheme() {
  if (themeState.mode === 'system') {
    applyCssVars(themeState.mode);
  }
}

/** 切换主题并播放圆形遮罩动画（参考 apps/web/src/theme.ts） */
function reveal(next: ThemeMode, x: number, y: number) {
  const commit = () => {
    themeState.mode = next;
    applyCssVars(next);
    kv_set(THEME_KEY, next).catch(() => {});
    setConfig(CLIENT_CONFIG_KEYS.appTheme, next).catch(() => {});
  };

  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => { ready: Promise<void> };
  };

  if (doc.startViewTransition) {
    const transition = doc.startViewTransition(commit);
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
        commit();
        mask.remove();
      });
  });
}

export function setThemeMode(
  mode: ThemeMode,
  origin?: { x: number; y: number },
) {
  if (mode === themeState.mode) return;
  const from = getEffectiveMode(themeState.mode);
  const to = getEffectiveMode(mode);
  if (from === to) {
    themeState.mode = mode;
    kv_set(THEME_KEY, mode).catch(() => {});
    setConfig(CLIENT_CONFIG_KEYS.appTheme, mode).catch(() => {});
    return;
  }
  reveal(
    mode,
    origin?.x ?? window.innerWidth / 2,
    origin?.y ?? window.innerHeight / 2,
  );
}

export function setThemeFontSize(fontSize: ChatsFontSize) {
  kv_set(FONT_KEY, fontSize).catch(() => {});
  themeState.fontSize = fontSize;
}

/** 启动时读取持久化主题/字号，并监听系统主题变化 */
export function initTheme() {
  kv_get(THEME_KEY)
    .then((value) => {
      const theme =
        value && (THEME_MODES as string[]).includes(value)
          ? value
          : getAppTheme();
      if (theme && (THEME_MODES as string[]).includes(theme)) {
        themeState.mode = theme as ThemeMode;
      }
    })
    .catch(() => {});

  kv_get(FONT_KEY)
    .then((value) => {
      if (value && (FONT_SIZES as string[]).includes(value)) {
        themeState.fontSize = value as ChatsFontSize;
      }
    })
    .catch(() => {});

  if (!systemThemeInitialized) {
    systemThemeInitialized = true;
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', syncSystemTheme);
  }

  applyCssVars(themeState.mode);
  applyFontVars(themeState.fontSize);

  watch(
    () => themeState.mode,
    (mode) => applyCssVars(mode),
  );
  watch(
    () => themeState.fontSize,
    (fontSize) => applyFontVars(fontSize),
  );
}

export function useTheme() {
  return {
    mode: computed(() => themeState.mode),
    fontSize: computed(() => themeState.fontSize),
    effectiveMode: computed(() => getEffectiveMode(themeState.mode)),
    setMode: setThemeMode,
    setFontSize: setThemeFontSize,
  };
}
