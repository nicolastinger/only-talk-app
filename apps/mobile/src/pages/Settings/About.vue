<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { getVersion } from "@tauri-apps/api/app";

const router = useRouter();
const version = ref("1.0.0");

onMounted(async () => {
  try {
    version.value = await getVersion();
  } catch {
    // 浏览器环境中无 Tauri 运行时，展示静态版本号
  }
});

const goBack = () => router.back();

const infoRows = [
  { name: "应用名称", value: "Only Talk" },
  { name: "当前版本", value: version },
];

const onComingSoon = (row: string) => {
  showToast({ message: `${row}功能开发中`, icon: "none" });
};
</script>

<template>
  <div class="settings-page">
    <van-nav-bar title="关于 Only Talk" left-arrow @click-left="goBack" />

    <div class="about-header">
      <div class="logo">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-1.2 1.5-2.4 3-3.6 4.5 1.3 1.9 2.6 3.8 3.9 5.7-.9-.1-1.8-.4-2.6-.9-.9-.5-1.7-1.1-2.5-1.8-.8.7-1.6 1.3-2.5 1.8-.8.5-1.7.8-2.6.9 1.3-1.9 2.6-3.8 3.9-5.7-1.2-1.5-2.4-3-3.6-4.5.9.1 1.8.4 2.6.9.9.5 1.7 1.1 2.5 1.8.8-.7 1.6-1.3 2.5-1.8.8-.5 1.7-.8 2.6-.9z"
          />
        </svg>
      </div>
      <div class="app-name">Only Talk</div>
      <div class="app-slogan">极速 · 安全 · 畅聊无限</div>
      <div class="app-version">Version {{ version }}</div>
    </div>

    <div class="info-card">
      <div class="info-row" v-for="row in infoRows" :key="row.name">
        <span class="info-name">{{ row.name }}</span>
        <span class="info-value">{{ row.value }}</span>
      </div>
    </div>

    <div class="menu-card">
      <div class="menu-item" @click="onComingSoon('用户协议')">
        <span class="menu-name">用户协议</span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
      <div class="menu-item" @click="onComingSoon('隐私政策')">
        <span class="menu-name">隐私政策</span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
      <div class="menu-item" @click="onComingSoon('开源许可')">
        <span class="menu-name">开源许可</span>
        <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </div>
    </div>

    <p class="copyright">© 2026 Only Talk. All rights reserved.</p>
  </div>
</template>

<style scoped lang="less">
.settings-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;

  :deep(.van-nav-bar) {
    position: sticky;
    top: 0;
    z-index: 100;
  }
}

.about-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36px 0 24px;
}

.logo {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-lg);
  background: var(--gradient-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-glow-sm);

  svg {
    width: 40px;
    height: 40px;
    color: #fff;
  }
}

.app-name {
  margin-top: 14px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.app-slogan {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.app-version {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-placeholder);
}

.info-card,
.menu-card {
  margin: 0 16px 16px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 16px;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.info-name {
  font-size: 15px;
  color: var(--text-secondary);
}

.info-value {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 16px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background var(--transition-fast);

  &:last-child {
    border-bottom: none;
  }

  &:active {
    background: var(--surface-hover);
  }
}

.menu-name {
  font-size: 15px;
  color: var(--text-primary);
}

.arrow {
  width: 18px;
  height: 18px;
  color: var(--text-placeholder);
}

.copyright {
  margin: 20px 16px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-placeholder);
}
</style>
