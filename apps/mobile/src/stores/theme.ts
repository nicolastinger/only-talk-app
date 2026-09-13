import { computed, onMounted, ref, watch } from "vue";
import { kv_get, kv_set } from "@workspace/services";

export type ThemeMode = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

const THEME_KEY = "ui_theme";
const validModes: ThemeMode[] = ["light", "dark", "system"];

const getSystemTheme = (): EffectiveTheme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const mode = ref<ThemeMode>("light");
const systemTheme = ref<EffectiveTheme>(getSystemTheme());
const effectiveTheme = computed<EffectiveTheme>(() =>
  mode.value === "system" ? systemTheme.value : mode.value,
);

/** 待切换主题：遮罩扩散动画结束后才真正应用 */
const pendingMode = ref<ThemeMode | null>(null);

/** 主题切换遮罩状态：active 时用新主题色从点击点向外扩散，覆盖完成后切换主题 */
export interface ThemeRevealState {
  active: boolean;
  color: string;
  x: number;
  y: number;
  key: number;
}

export const themeReveal = ref<ThemeRevealState>({
  active: false,
  color: "",
  x: 0,
  y: 0,
  key: 0,
});

/** 读取指定主题的背景色（临时切换 :root[data-theme] 读取 CSS 变量，同步执行无闪烁） */
const getThemeBg = (theme: EffectiveTheme): string => {
  const root = document.documentElement;
  const prev = root.dataset.theme;
  root.dataset.theme = theme;
  const color = getComputedStyle(root).getPropertyValue("--bg-color").trim();
  root.dataset.theme = prev;
  return color || (theme === "dark" ? "#000000" : "#ffffff");
};

/** 遮罩扩散完成：应用待切换主题并清除遮罩 */
export const endReveal = () => {
  if (pendingMode.value) {
    const next = pendingMode.value;
    pendingMode.value = null;
    mode.value = next;
    kv_set(THEME_KEY, next).catch(() => {});
  }
  themeReveal.value = { active: false, color: "", x: 0, y: 0, key: 0 };
};

kv_get(THEME_KEY)
  .then((value) => {
    if (value && validModes.includes(value as ThemeMode)) {
      mode.value = value as ThemeMode;
    }
  })
  .catch(() => {});

let initialized = false;

export function useTheme() {
  const applyTheme = () => {
    document.documentElement.dataset.theme = effectiveTheme.value;
    document.documentElement.style.colorScheme = effectiveTheme.value;
  };

  const setMode = (
    value: ThemeMode,
    origin?: { x: number; y: number },
  ) => {
    if (value === mode.value) return;
    const to = value === "system" ? getSystemTheme() : value;
    if (effectiveTheme.value !== to) {
      pendingMode.value = value;
      themeReveal.value = {
        active: true,
        color: getThemeBg(to),
        x: origin?.x ?? window.innerWidth / 2,
        y: origin?.y ?? window.innerHeight / 2,
        key: themeReveal.value.key + 1,
      };
      return;
    }
    mode.value = value;
    kv_set(THEME_KEY, value).catch(() => {});
  };

  onMounted(() => {
    if (!initialized) {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => {
        systemTheme.value = media.matches ? "dark" : "light";
      };
      media.addEventListener("change", onChange);
      initialized = true;
    }
  });

  watch(effectiveTheme, applyTheme, { immediate: true });

  return { mode, effectiveTheme, setMode };
}
