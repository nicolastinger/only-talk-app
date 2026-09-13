<script setup lang="ts">
import { DOWNLOADS, GITHUB_RELEASES_URL } from "@/config/downloads";
import { useMessages } from "@/i18n";

const { t } = useMessages();

const platformInfo = (id: (typeof DOWNLOADS)[number]["id"]) =>
  t.value.platforms[id];
</script>

<template>
  <div class="download container">
    <h1 class="download-title">{{ t.download.title }}</h1>
    <p class="download-subtitle">{{ t.download.subtitle }}</p>

    <div class="notice">{{ t.download.notice }}</div>

    <section>
      <h2 class="section-heading">{{ t.download.clientTitle }}</h2>
      <div class="platform-grid">
        <div v-for="item in DOWNLOADS" :key="item.id" class="platform-card">
          <div class="platform-icon">{{ item.icon }}</div>
          <h3 class="platform-name">{{ platformInfo(item.id).name }}</h3>
          <p class="platform-desc">{{ platformInfo(item.id).desc }}</p>
          <div class="platform-actions">
            <a
              class="btn btn-primary btn-sm"
              :href="item.releaseUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ t.download.viaReleases }}
            </a>
            <a
              class="btn btn-ghost btn-sm"
              :href="item.localUrl"
              :download="item.isPlaceholder ? undefined : item.localUrl"
              target="_blank"
            >
              {{
                item.isPlaceholder
                  ? t.download.placeholderDirect
                  : t.download.direct
              }}
            </a>
          </div>
        </div>
      </div>
    </section>

    <section class="releases">
      <p class="releases-text">
        {{ t.download.releasesText }}
        <a
          :href="GITHUB_RELEASES_URL"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t.common.githubReleases }}
        </a>
      </p>
    </section>
  </div>
</template>

<style scoped lang="less">
.download {
  max-width: 880px;
}

.download-title {
  margin: 0 0 8px;
  font-size: 32px;
  font-weight: 800;
  text-align: center;
}

.download-subtitle {
  margin: 0 0 28px;
  font-size: 16px;
  color: var(--text-secondary);
  text-align: center;
}

.notice {
  background: var(--notice-bg);
  border: 1px solid var(--notice-border);
  color: var(--notice-text);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  font-size: 14px;
  margin-bottom: 40px;
  text-align: center;
}

.section-heading {
  margin: 0 0 20px;
  font-size: 20px;
  font-weight: 700;
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 48px;
}

.platform-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
}

.platform-icon {
  font-size: 36px;
}

.platform-name {
  margin: 12px 0 6px;
  font-size: 18px;
  font-weight: 700;
}

.platform-desc {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--text-secondary);
}

.platform-actions {
  margin-top: auto;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 9px 18px;
  font-size: 14px;
}

.releases {
  text-align: center;
}

.releases-text {
  font-size: 14px;
  color: var(--text-tertiary);
}

@media (max-width: 640px) {
  .download-title {
    font-size: 26px;
  }

  .platform-grid {
    grid-template-columns: 1fr;
  }
}
</style>
