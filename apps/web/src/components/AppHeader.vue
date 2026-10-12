<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useTheme, toggleTheme } from "@/theme";
import { locale, setLocale, useMessages } from "@/i18n";
import type { Locale } from "@/i18n";

const { t } = useMessages();
const router = useRouter();
const theme = useTheme();

const navLinks = computed(() => [
  {
    name: t.value.common.navHome,
    to: { path: "/", query: { lang: locale.value } },
  },
  {
    name: t.value.common.navDownload,
    to: { path: "/download", query: { lang: locale.value } },
  },
  {
    name: t.value.common.navPrivacy,
    to: { path: "/privacy", query: { lang: locale.value } },
  },
  {
    name: t.value.common.navAgreement,
    to: { path: "/agreement", query: { lang: locale.value } },
  },
]);

const menuOpen = ref(false);

const closeMenu = () => {
  menuOpen.value = false;
};

const onToggleTheme = (event: MouseEvent) => {
  toggleTheme(event.clientX, event.clientY);
};

const toggleLang = () => {
  const next: Locale = locale.value === "zh" ? "en" : "zh";
  setLocale(next);
  router.replace({
    query: { ...router.currentRoute.value.query, lang: next },
  });
};
</script>

<template>
  <header class="header">
    <div class="container header-inner">
      <router-link to="/" class="brand" @click="closeMenu">
        <img src="/images/app-icon.png" alt="Only Talk" class="brand-logo" />
        <span class="brand-name">Only Talk</span>
      </router-link>

      <nav class="nav">
        <router-link
          v-for="link in navLinks"
          :key="link.to.path"
          :to="link.to"
          class="nav-link"
          active-class="is-active"
          :exact-active-class="link.to.path === '/' ? 'is-active' : ''"
        >
          {{ link.name }}
        </router-link>
      </nav>

      <div class="header-actions">
        <button
          class="lang-toggle"
          type="button"
          :aria-label="t.common.switchLang"
          :title="t.common.switchLang"
          @click="toggleLang"
        >
          {{ locale === "zh" ? "EN" : "中文" }}
        </button>

        <button
          class="theme-toggle"
          type="button"
          :aria-label="
            theme === 'dark'
              ? t.common.switchThemeLight
              : t.common.switchThemeDark
          "
          :title="
            theme === 'dark'
              ? t.common.switchThemeLight
              : t.common.switchThemeDark
          "
          @click="onToggleTheme"
        >
          <svg class="theme-icon sun" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4.2" />
            <g stroke-width="1.8" stroke-linecap="round">
              <line x1="12" y1="2.5" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="21.5" />
              <line x1="2.5" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="21.5" y2="12" />
              <line x1="5.2" y1="5.2" x2="6.9" y2="6.9" />
              <line x1="17.1" y1="17.1" x2="18.8" y2="18.8" />
              <line x1="18.8" y1="5.2" x2="17.1" y2="6.9" />
              <line x1="6.9" y1="17.1" x2="5.2" y2="18.8" />
            </g>
          </svg>
          <svg class="theme-icon moon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20.5 14.4A8.5 8.5 0 0 1 9.6 3.5 8.5 8.5 0 1 0 20.5 14.4Z"
            />
          </svg>
        </button>

        <button
          class="menu-toggle"
          type="button"
          :aria-label="menuOpen ? '关闭菜单' : '打开菜单'"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <span class="menu-bar" :class="{ open: menuOpen }"></span>
          <span class="menu-bar" :class="{ open: menuOpen }"></span>
          <span class="menu-bar" :class="{ open: menuOpen }"></span>
        </button>
      </div>
    </div>

    <nav class="mobile-nav" :class="{ open: menuOpen }">
      <router-link
        v-for="link in navLinks"
        :key="link.to.path"
        :to="link.to"
        class="mobile-nav-link"
        active-class="is-active"
        :exact-active-class="link.to.path === '/' ? 'is-active' : ''"
        @click="closeMenu"
      >
        {{ link.name }}
      </router-link>
    </nav>
  </header>
</template>

<style scoped lang="less">
.header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--header-bg);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--header-border);
}

.header-inner {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);

  &:hover {
    color: var(--text-primary);
  }
}

.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
}

.brand-name {
  font-size: 18px;
  font-weight: 700;
}

.nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-link {
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: 15px;
  color: var(--text-secondary);
  transition: color var(--transition-fast), background var(--transition-fast);

  &:hover {
    color: var(--blue-600);
    background: var(--blue-50);
  }

  &.is-active {
    color: var(--blue-600);
    font-weight: 600;
    background: var(--blue-50);
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lang-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);

  &:hover {
    color: var(--blue-600);
    background: var(--blue-50);
  }
}

.theme-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);

  &:hover {
    color: var(--blue-600);
    background: var(--blue-50);
  }
}

.theme-icon {
  position: absolute;
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  transition: transform 0.4s ease, opacity 0.25s ease;
}

.sun {
  opacity: 0;
  transform: rotate(-90deg) scale(0.5);
}

.moon {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

:root[data-theme="dark"] .sun {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

:root[data-theme="dark"] .moon {
  opacity: 0;
  transform: rotate(90deg) scale(0.5);
}

.menu-toggle {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 40px;
  height: 40px;
  padding: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
}

.menu-bar {
  display: block;
  width: 24px;
  height: 2px;
  border-radius: 2px;
  background: var(--text-primary);
  transition: transform var(--transition-fast), opacity var(--transition-fast);

  &.open:nth-child(1) {
    transform: translateY(7px) rotate(45deg);
  }

  &.open:nth-child(2) {
    opacity: 0;
  }

  &.open:nth-child(3) {
    transform: translateY(-7px) rotate(-45deg);
  }
}

.mobile-nav {
  display: none;
  overflow: hidden;
  max-height: 0;
  background: var(--surface);
  border-top: 1px solid var(--border-subtle);
  transition: max-height var(--transition-fast);

  &.open {
    max-height: 260px;
  }
}

.mobile-nav-link {
  display: block;
  padding: 14px 24px;
  font-size: 15px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle);

  &:last-child {
    border-bottom: none;
  }

  &.is-active {
    color: var(--blue-600);
    font-weight: 600;
  }
}

@media (max-width: 768px) {
  .nav {
    display: none;
  }

  .menu-toggle {
    display: flex;
  }

  .mobile-nav {
    display: block;
  }
}
</style>
