import { computed, onMounted, ref, watch } from "vue";
import { kv_get, kv_set } from "@workspace/services";

export type ThemeMode = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";
export type ChatsFontSize = "small" | "medium" | "large";

const THEME_KEY = "ui_theme";
const FONT_KEY = "ui_chat_font_size";
const validModes: ThemeMode[] = ["light", "dark", "system"];
const validFontSizes: ChatsFontSize[] = ["small", "medium", "large"];

/** 与 PC apps/pc/src/store/theme.ts 保持一致: 仅缩放聊天消息字体 */
const FONT_SCALE: Record<ChatsFontSize, string> = {
  small: "0.875",
  medium: "1",
  large: "1.125",
};

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

const fontSize = ref<ChatsFontSize>("medium");

/** 应用聊天字体缩放(仅影响聊天消息字体) */
function applyFontVars(size: ChatsFontSize) {
  document.documentElement.style.setProperty("--chat-font-scale", FONT_SCALE[size]);
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

kv_get(FONT_KEY)
  .then((value) => {
    if (value && validFontSizes.includes(value as ChatsFontSize)) {
      fontSize.value = value as ChatsFontSize;
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

  watch(fontSize, applyFontVars, { immediate: true });

  const setFontSize = (value: ChatsFontSize) => {
    if (value === fontSize.value) return;
    fontSize.value = value;
    kv_set(FONT_KEY, value).catch(() => {});
  };

  return { mode, fontSize, effectiveTheme, setMode, setFontSize };
}
