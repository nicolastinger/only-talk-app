<script setup lang="ts">
import { computed } from "vue";
import { GITHUB_RELEASES_URL } from "@/config/downloads";
import { locale, useMessages } from "@/i18n";

const { t } = useMessages();

const links = computed(() => [
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
</script>

<template>
  <footer class="footer">
    <div class="container footer-inner">
      <div class="footer-left">
        <span class="footer-brand">Only Talk</span>
        <span class="footer-slogan">{{ t.common.footerSlogan }}</span>
      </div>

      <div class="footer-links">
        <router-link
          v-for="link in links"
          :key="link.to.path"
          :to="link.to"
          class="footer-link"
        >
          {{ link.name }}
        </router-link>
        <a
          class="footer-link"
          :href="GITHUB_RELEASES_URL"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t.common.githubReleases }}
        </a>
      </div>
    </div>

    <div class="container footer-copy">
      <p>{{ t.common.footerCopyright }}</p>
    </div>
  </footer>
</template>

<style scoped lang="less">
.footer {
  background: var(--surface);
  border-top: 1px solid var(--border-subtle);
  padding: 32px 0 24px;
  margin-top: auto;
}

.footer-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}

.footer-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.footer-brand {
  font-size: 16px;
  font-weight: 700;
}

.footer-slogan {
  font-size: 13px;
  color: var(--text-tertiary);
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.footer-link {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text-secondary);
  transition: color var(--transition-fast), background var(--transition-fast);

  &:hover {
    color: var(--blue-600);
    background: var(--blue-50);
  }
}

.footer-copy {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12px;
  color: var(--text-placeholder);

  p {
    margin: 0;
    text-align: center;
  }
}

@media (max-width: 640px) {
  .footer-inner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
