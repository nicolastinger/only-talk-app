import { computed, onMounted, ref, watch } from "vue";
import { kv_get, kv_set } from "@workspace/services";

export type ThemeMode = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

const THEME_KEY = "ui_theme";
const validModes: ThemeMode[] = ["light", "dark", "system"];

/** 与 theme.css 的 --page-bg 保持一致，用于无 View Transitions 时的遮罩兜底 */
const PAGE_BG: Record<EffectiveTheme, string> = {
  light: "#f5f8fd",
  dark: "#1a1a1a",
};

const getSystemTheme = (): EffectiveTheme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const mode = ref<ThemeMode>("light");
const systemTheme = ref<EffectiveTheme>(getSystemTheme());
const effectiveTheme = computed<EffectiveTheme>(() =>
  mode.value === "system" ? systemTheme.value : mode.value,
);

function applyTheme(theme: EffectiveTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

/** 点击点到最远角的距离，作为圆形遮罩的半径 */
function revealRadius(x: number, y: number): number {
  return Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
}

/**
 * 切换主题并播放圆形遮罩动画（参考 apps/web/src/theme.ts）：
 * 优先使用 View Transitions API，从点击位置圆形展开；
 * 不支持时降级为 JS 遮罩层动画。
 */
function revealTheme(
  nextMode: ThemeMode,
  next: EffectiveTheme,
  x: number,
  y: number,
) {
  const commit = () => {
    mode.value = nextMode;
    applyTheme(next);
    kv_set(THEME_KEY, nextMode).catch(() => {});
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
            easing: "ease-in",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {});
    return;
  }

  const radius = revealRadius(x, y);
  const mask = document.createElement("div");
  mask.className = "theme-mask";
  mask.style.background = PAGE_BG[next];
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
        { duration: 600, easing: "ease-in", fill: "forwards" },
      )
      .addEventListener("finish", () => {
        // 遮罩全覆盖后再切换主题，避免提前切换导致遮罩不可见
        commit();
        mask.remove();
      });
  });
}

kv_get(THEME_KEY)
  .then((value) => {
    if (value && validModes.includes(value as ThemeMode)) {
      mode.value = value as ThemeMode;
    }
  })
  .catch(() => {});

let initialized = false;

export function useTheme() {
  const setMode = (value: ThemeMode, origin?: { x: number; y: number }) => {
    if (value === mode.value) return;
    const next = value === "system" ? getSystemTheme() : value;
    if (effectiveTheme.value === next) {
      mode.value = value;
      kv_set(THEME_KEY, value).catch(() => {});
      return;
    }
    revealTheme(
      value,
      next,
      origin?.x ?? window.innerWidth / 2,
      origin?.y ?? window.innerHeight / 2,
    );
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
