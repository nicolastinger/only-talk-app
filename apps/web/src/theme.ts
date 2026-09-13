import { ref } from "vue";

export type Theme = "light" | "dark";

const STORAGE_KEY = "only-talk-theme";
const current = ref<Theme>("light");

/** 与 theme.css 中 --page-bg 保持一致，用于无 View Transitions 时的遮罩兜底 */
const PAGE_BG: Record<Theme, string> = {
  light: "#f5f8fd",
  dark: "#0f1524",
};

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme) {
  current.value = theme;
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  if (meta) {
    meta.content = PAGE_BG[theme];
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 隐私模式等场景下忽略
  }
}

/** 应用启动时调用：优先读取存储，其次跟随系统 */
export function initTheme() {
  applyTheme(storedTheme() ?? systemTheme());
}

export function useTheme() {
  return current;
}

/**
 * 切换主题并播放圆形遮罩动画。
 * 优先使用 View Transitions API（从点击位置圆形展开）；
 * 不支持时退化为 JS 遮罩层动画。
 */
export async function toggleTheme(x: number, y: number): Promise<Theme> {
  const next: Theme = current.value === "dark" ? "light" : "dark";

  if (document.startViewTransition) {
    const transition = document.startViewTransition(() => applyTheme(next));
    await transition.ready;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${radius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 600,
        easing: "ease-in",
        pseudoElement: "::view-transition-new(root)",
      }
    );
    return next;
  }

  fallbackMask(x, y, next);
  applyTheme(next);
  return next;
}

function fallbackMask(x: number, y: number, next: Theme) {
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );
  const mask = document.createElement("div");
  mask.className = "theme-mask";
  mask.style.background = PAGE_BG[next];
  mask.style.clipPath = `circle(0px at ${x}px ${y}px)`;

  requestAnimationFrame(() => {
    document.body.appendChild(mask);
    applyTheme(next);
    mask
      .animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        { duration: 600, easing: "ease-in", fill: "forwards" }
      )
      .addEventListener("finish", () => mask.remove());
  });
}
