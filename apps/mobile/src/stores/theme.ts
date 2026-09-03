import { computed, onMounted, ref, watch } from "vue";

export type ThemeMode = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

const THEME_KEY = "theme";
const validModes: ThemeMode[] = ["light", "dark", "system"];

const getStoredMode = (): ThemeMode => {
  const value = localStorage.getItem(THEME_KEY) as ThemeMode | null;
  return value && validModes.includes(value) ? value : "light";
};

const getSystemTheme = (): EffectiveTheme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const mode = ref<ThemeMode>(getStoredMode());
const systemTheme = ref<EffectiveTheme>(getSystemTheme());
const effectiveTheme = computed<EffectiveTheme>(() =>
  mode.value === "system" ? systemTheme.value : mode.value,
);

let initialized = false;

export function useTheme() {
  const applyTheme = () => {
    document.documentElement.dataset.theme = effectiveTheme.value;
    document.documentElement.style.colorScheme = effectiveTheme.value;
  };

  const setMode = (value: ThemeMode) => {
    mode.value = value;
    localStorage.setItem(THEME_KEY, value);
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
