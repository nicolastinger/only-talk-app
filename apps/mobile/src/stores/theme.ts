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

/** 主题切换遮罩状态：active 时用旧主题色遮罩覆盖全屏，再收缩揭示新主题 */
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

/** 读取当前生效的主题背景色（切换前调用取到的是旧主题色） */
const currentThemeBg = (): string =>
  getComputedStyle(document.documentElement)
    .getPropertyValue("--bg-color")
    .trim() || "#ffffff";

export const endReveal = () => {
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
      themeReveal.value = {
        active: true,
        color: currentThemeBg(),
        x: origin?.x ?? window.innerWidth / 2,
        y: origin?.y ?? window.innerHeight / 2,
        key: themeReveal.value.key + 1,
      };
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
