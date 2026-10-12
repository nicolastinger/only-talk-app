<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  useTemplateRef,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import { DOWNLOADS } from "@/config/downloads";
import { locale, useMessages } from "@/i18n";

const { t } = useMessages();
const router = useRouter();

const highlights = computed(() => t.value.home.highlights);
const featureGroups = computed(() => t.value.home.featureGroups);
const stack = computed(() => t.value.home.stack);

const platformName = (id: string) =>
  (t.value.platforms[id as keyof typeof t.value.platforms] ?? { name: id })
    .name;

const goDownload = () => {
  router.push("/download");
};

const homeRef = useTemplateRef<HTMLElement>("home");
let observer: IntersectionObserver | null = null;

const observeReveals = async () => {
  await nextTick();
  const root = homeRef.value;
  if (!root || !observer) {
    return;
  }
  const targets = root.querySelectorAll<HTMLElement>(".reveal:not(.reveal-in)");
  targets.forEach((el) => observer?.observe(el));
};

onMounted(async () => {
  await nextTick();
  const root = homeRef.value;
  if (!root) {
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-in");
          observer?.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15 }
  );
  await observeReveals();
});

watch(locale, observeReveals);

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div ref="home" class="home">
    <section class="hero">
      <div class="hero-blob hero-blob-a"></div>
      <div class="hero-blob hero-blob-b"></div>
      <div class="hero-blob hero-blob-c"></div>

      <div class="container hero-inner">
        <div class="hero-logo hero-in">
          <img src="/images/app-icon.png" alt="Only Talk" />
        </div>
        <h1 class="hero-title hero-in" :style="{ '--d': '120ms' }">
          {{ t.home.heroTitle }}
        </h1>
        <p class="hero-slogan hero-in" :style="{ '--d': '240ms' }">
          {{ t.home.heroSlogan }}
        </p>
        <p class="hero-desc hero-in" :style="{ '--d': '360ms' }">
          {{ t.home.heroDesc }}
        </p>
        <div class="hero-actions hero-in" :style="{ '--d': '480ms' }">
          <button
            class="btn btn-primary btn-shine"
            type="button"
            @click="goDownload"
          >
            {{ t.home.downloadNow }}
          </button>
        </div>
        <div class="hero-platforms hero-in" :style="{ '--d': '600ms' }">
          <span
            v-for="(item, index) in DOWNLOADS"
            :key="item.id"
            class="hero-platform"
            :style="{ '--fd': `${index * 160}ms` }"
          >
            {{ item.icon }} {{ platformName(item.id) }}
          </span>
        </div>
      </div>
    </section>

    <section class="highlights">
      <div class="container">
        <h2 class="section-title reveal">{{ t.home.whyTitle }}</h2>
        <p class="section-subtitle reveal">{{ t.home.whySubtitle }}</p>
        <div class="highlight-grid">
          <div
            v-for="(item, index) in highlights"
            :key="item.title"
            class="highlight-card reveal"
            :style="{ '--d': `${index * 80}ms` }"
          >
            <div class="highlight-icon float-soft">{{ item.icon }}</div>
            <h3 class="highlight-title">{{ item.title }}</h3>
            <p class="highlight-desc">{{ item.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="features">
      <div class="container">
        <h2 class="section-title reveal">{{ t.home.featureTitle }}</h2>
        <p class="section-subtitle reveal">{{ t.home.featureSubtitle }}</p>
        <div class="feature-grid">
          <div
            v-for="(group, index) in featureGroups"
            :key="group.title"
            class="feature-group reveal"
            :style="{ '--d': `${(index % 2) * 100}ms` }"
          >
            <div class="feature-group-head">
              <span class="feature-group-icon float-soft">{{
                group.icon
              }}</span>
              <h3 class="feature-group-title">{{ group.title }}</h3>
            </div>
            <ul class="feature-group-list">
              <li
                v-for="item in group.items"
                :key="item"
                class="feature-group-item"
              >
                <span class="feature-check">✓</span>
                {{ item }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="stack">
      <div class="container">
        <h2 class="section-title reveal">{{ t.home.stackTitle }}</h2>
        <p class="section-subtitle reveal">{{ t.home.stackSubtitle }}</p>
        <div class="stack-grid">
          <div
            v-for="(s, index) in stack"
            :key="s.name"
            class="stack-card reveal"
            :style="{ '--d': `${index * 80}ms` }"
          >
            <div class="stack-name">{{ s.name }}</div>
            <div class="stack-tech">{{ s.tech }}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="cta">
      <div class="container cta-inner">
        <div>
          <h2 class="cta-title">{{ t.home.ctaTitle }}</h2>
          <p class="cta-desc">{{ t.home.ctaDesc }}</p>
        </div>
        <button
          class="btn btn-primary btn-shine"
          type="button"
          @click="goDownload"
        >
          {{ t.home.viewAllDownloads }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="less">
.hero {
  position: relative;
  overflow: hidden;
  background: var(--gradient-hero);
  padding: 80px 0 72px;
  text-align: center;
}

.hero-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.55;
  pointer-events: none;
  animation: blobFloat 16s ease-in-out infinite;
}

.hero-blob-a {
  width: 420px;
  height: 420px;
  top: -160px;
  left: -120px;
  background: rgba(64, 150, 255, 0.35);
}

.hero-blob-b {
  width: 360px;
  height: 360px;
  top: -80px;
  right: -100px;
  background: rgba(26, 92, 255, 0.28);
  animation-delay: -5s;
}

.hero-blob-c {
  width: 300px;
  height: 300px;
  bottom: -140px;
  left: 38%;
  background: rgba(140, 196, 255, 0.4);
  animation-delay: -10s;
}

.hero-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-logo {
  width: 96px;
  height: 96px;
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-glow);
  animation: popIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.hero-title {
  margin: 24px 0 0;
  font-size: 44px;
  font-weight: 800;
  letter-spacing: 1px;
  background: var(--gradient-primary);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: gradientShift 6s ease infinite;
}

.hero-slogan {
  margin: 10px 0 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--blue-600);
}

.hero-desc {
  max-width: 620px;
  margin: 18px 0 0;
  font-size: 16px;
  color: var(--text-secondary);
}

.hero-actions {
  display: flex;
  gap: 16px;
  margin-top: 32px;
  flex-wrap: wrap;
  justify-content: center;
}

.hero-platforms {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 36px;
}

.hero-platform {
  font-size: 13px;
  color: var(--text-tertiary);
  background: var(--pill-bg);
  border: 1px solid var(--border-light);
  border-radius: 999px;
  padding: 6px 14px;
  animation: fadeUp 0.6s ease both;
  animation-delay: var(--fd);
}

.hero-in {
  animation: fadeUp 0.7s ease both;
  animation-delay: var(--d, 0ms);
}

.btn-shine {
  position: relative;
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: -80%;
    width: 50%;
    height: 100%;
    background: linear-gradient(
      100deg,
      transparent 0%,
      rgba(255, 255, 255, 0.45) 50%,
      transparent 100%
    );
    transform: skewX(-20deg);
    animation: shine 3.2s ease-in-out infinite;
  }
}

.highlights,
.features,
.stack {
  padding: 72px 0;
}

.highlights {
  background: var(--surface);
}

.highlight-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.highlight-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 28px 22px;
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition-fast),
    box-shadow var(--transition-fast);

  &:hover {
    transform: translateY(-6px);
    box-shadow: var(--shadow-md);
  }
}

.highlight-icon {
  font-size: 32px;
  display: inline-block;
}

.highlight-title {
  margin: 16px 0 8px;
  font-size: 18px;
  font-weight: 700;
}

.highlight-desc {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.7;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

.feature-group {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 28px 26px;
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition-fast),
    box-shadow var(--transition-fast);

  &:hover {
    transform: translateY(-6px);
    box-shadow: var(--shadow-md);
  }
}

.feature-group-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.feature-group-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  font-size: 22px;
  border-radius: var(--radius-md);
  background: var(--blue-50);
}

.feature-group-title {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
}

.feature-group-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.feature-group-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.feature-check {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--blue-50);
  color: var(--blue-600);
  font-size: 12px;
  font-weight: 700;
}

.stack {
  background: var(--surface);
}

.stack-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.stack-card {
  background: var(--page-bg);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 20px 22px;
  text-align: center;
  transition: transform var(--transition-fast),
    box-shadow var(--transition-fast);

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-md);
  }
}

.stack-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--blue-600);
  margin-bottom: 8px;
}

.stack-tech {
  font-size: 13px;
  color: var(--text-secondary);
}

.cta {
  padding: 0 0 80px;
}

.cta-inner {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  background: var(--gradient-primary);
  background-size: 220% 220%;
  border-radius: var(--radius-xl);
  padding: 40px 48px;
  color: var(--text-inverse);
  box-shadow: var(--shadow-glow);
  animation: gradientShift 8s ease infinite;
}

.cta-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
}

.cta-desc {
  margin: 8px 0 0;
  font-size: 15px;
  opacity: 0.9;
}

.cta .btn-primary {
  background: #fff;
  color: var(--brand-blue-dark);
  box-shadow: none;
}

/* ===== 滚动进入动画 ===== */
.reveal {
  opacity: 0;
  transform: translateY(28px);
  transition: opacity 0.7s ease var(--d, 0ms), transform 0.7s ease var(--d, 0ms);

  &.reveal-in {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ===== Keyframes ===== */
@keyframes popIn {
  0% {
    opacity: 0;
    transform: scale(0.6) translateY(20px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes fadeUp {
  0% {
    opacity: 0;
    transform: translateY(24px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes gradientShift {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

@keyframes blobFloat {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(40px, -30px) scale(1.1);
  }
  66% {
    transform: translate(-30px, 24px) scale(0.95);
  }
}

@keyframes shine {
  0% {
    left: -80%;
  }
  55%,
  100% {
    left: 130%;
  }
}

@keyframes softFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

.float-soft {
  animation: softFloat 3s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .hero-blob,
  .hero-title,
  .cta-inner,
  .btn-shine::after,
  .float-soft,
  .hero-in,
  .hero-platform,
  .reveal {
    animation: none !important;
    transition: none !important;
  }
}

@media (max-width: 900px) {
  .highlight-grid,
  .stack-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .hero {
    padding: 56px 0 48px;
  }

  .hero-title {
    font-size: 34px;
  }

  .highlights,
  .features,
  .stack {
    padding: 48px 0;
  }

  .highlight-grid,
  .feature-grid,
  .stack-grid {
    grid-template-columns: 1fr;
  }

  .cta-inner {
    padding: 28px 24px;
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
