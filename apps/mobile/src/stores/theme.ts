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

  const setMode = (value: ThemeMode) => {
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
