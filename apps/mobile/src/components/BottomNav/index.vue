<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUnreadStore } from "@/stores/unread";

interface NavItem {
  name: string;
  path: string;
}

const route = useRoute();
const router = useRouter();
const { chatBadge, friendBadge, friendPlazaBadge, feedBadge } =
  useUnreadStore();

const navItems: NavItem[] = [
  { name: "chat", path: "/chats" },
  { name: "friends", path: "/friends" },
  { name: "friendPlaza", path: "/plaza/friend" },
  { name: "feed", path: "/plaza" },
  { name: "profile", path: "/profile" },
];

const badgeOf = (name: string) => {
  if (name === "chat") return chatBadge.value;
  if (name === "friends") return friendBadge.value;
  if (name === "friendPlaza") return friendPlazaBadge.value;
  if (name === "feed") return feedBadge.value;
  return 0;
};

const formatBadge = (count: number) => (count > 99 ? "99+" : String(count));

// 最长前缀匹配，避免 /plaza 误命中 /plaza/friend
const active = computed(() => {
  const path = route.path;
  let best = "";
  for (const item of navItems) {
    if (path === item.path || path.startsWith(item.path + "/")) {
      if (item.path.length > best.length) best = item.path;
    }
  }
  return best || "/chats";
});

const onChange = (path: string) => {
  router.replace(path);
};
</script>

<template>
  <div class="bottom-nav">
    <button
      v-for="item in navItems"
      :key="item.path"
      class="nav-btn"
      :class="{ active: active === item.path }"
      @click="onChange(item.path)"
    >
      <!-- Chat: speech bubble with animated dots -->
      <svg
        v-if="item.name === 'chat'"
        class="nav-icon"
        viewBox="0 0 32 32"
        fill="none"
      >
        <path
          class="bubble"
          d="M24 6H10a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h1.5l4 4 4-4H24a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3z"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle class="dot dot1" cx="13" cy="16" r="1.5" fill="currentColor" />
        <circle class="dot dot2" cx="17" cy="16" r="1.5" fill="currentColor" />
        <circle class="dot dot3" cx="21" cy="16" r="1.5" fill="currentColor" />
      </svg>

      <!-- Friends: two people with connecting pulse -->
      <svg
        v-else-if="item.name === 'friends'"
        class="nav-icon"
        viewBox="0 0 32 32"
        fill="none"
      >
        <circle
          class="pulse-ring"
          cx="14"
          cy="12"
          r="6"
          stroke="currentColor"
          stroke-width="0.6"
        />
        <circle
          class="person-head1"
          cx="14"
          cy="10"
          r="2.5"
          stroke="currentColor"
          stroke-width="1.8"
        />
        <path
          class="person-body1"
          d="M7 22c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
        <circle
          class="person-head2"
          cx="22"
          cy="8"
          r="2.2"
          stroke="currentColor"
          stroke-width="1.6"
        />
        <path
          class="person-body2"
          d="M17 18.5c0-2.5 2.2-4 5-4s5 1.5 5 4"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>

      <!-- 交友广场: heart with pulsing ring -->
      <svg
        v-else-if="item.name === 'friendPlaza'"
        class="nav-icon"
        viewBox="0 0 32 32"
        fill="none"
      >
        <circle
          class="heart-pulse"
          cx="16"
          cy="16"
          r="10"
          stroke="currentColor"
          stroke-width="0.7"
        />
        <path
          class="heart-base"
          d="M16 27C16 27 5 20.5 5 13a5.5 5.5 0 0 1 11-3 5.5 5.5 0 0 1 11 3c0 7.5-11 14-11 14z"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
      </svg>

      <!-- 动态广场: globe with orbiting ring -->
      <svg
        v-else-if="item.name === 'feed'"
        class="nav-icon"
        viewBox="0 0 32 32"
        fill="none"
      >
        <circle
          class="globe-base"
          cx="16"
          cy="16"
          r="9"
          stroke="currentColor"
          stroke-width="1.8"
        />
        <ellipse
          class="globe-equator"
          cx="16"
          cy="16"
          rx="9"
          ry="3.5"
          stroke="currentColor"
          stroke-width="1.2"
        />
        <path
          class="globe-meridian"
          d="M16 7v18M7 16h18"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
        <circle
          class="orbit-ring"
          cx="16"
          cy="16"
          r="12"
          stroke="currentColor"
          stroke-width="0.8"
          stroke-dasharray="6 3"
        />
        <circle class="satellite" cx="28" cy="16" r="1.8" fill="currentColor" />
      </svg>

      <!-- Profile: person with glowing accent -->
      <svg
        v-else-if="item.name === 'profile'"
        class="nav-icon"
        viewBox="0 0 32 32"
        fill="none"
      >
        <circle
          class="profile-ring"
          cx="16"
          cy="16"
          r="11"
          stroke="currentColor"
          stroke-width="0.8"
          stroke-dasharray="8 5"
        />
        <circle
          class="profile-head"
          cx="16"
          cy="11"
          r="3.5"
          stroke="currentColor"
          stroke-width="2"
        />
        <path
          class="profile-body"
          d="M7 28c0-5 4-8.5 9-8.5s9 3.5 9 8.5"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
        <circle
          class="accent-dot"
          cx="27"
          cy="7"
          r="2.5"
          fill="var(--nav-active-color)"
        />
      </svg>

      <span
        v-if="badgeOf(item.name) > 0"
        class="nav-badge"
        >{{ formatBadge(badgeOf(item.name)) }}</span
      >
    </button>
  </div>
</template>

<style scoped lang="less">
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: var(--nav-bg, rgba(255, 255, 255, 0.92));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid var(--nav-border, rgba(74, 144, 255, 0.08));
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 1000;
  padding: 0 8px;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -2px 20px rgba(74, 144, 255, 0.06);
}

.nav-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: transparent;
  border: none;
  cursor: pointer;
  position: relative;
  transition: all 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  padding: 0;

  /* 活跃态由图标颜色 + 底部小圆点指示 */
  .nav-icon {
    position: relative;
    width: var(--nav-icon-size, 28px);
    height: var(--nav-icon-size, 28px);
    color: var(--nav-inactive-color, #b0c4de);
    transition: color 0.15s ease;
  }

  &.active .nav-icon {
    color: var(--nav-active-color);
  }

  &::after {
    content: "";
    position: absolute;
    bottom: 7px;
    left: 50%;
    transform: translateX(-50%) scale(0);
    width: 4px;
    height: 4px;
    background: var(--nav-active-color);
    border-radius: 50%;
    transition: transform 0.15s ease;
  }

  &.active::after {
    transform: translateX(-50%) scale(1);
  }

  .nav-badge {
    position: absolute;
    top: 7px;
    left: calc(50% + 9px);
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    color: var(--badge-text, #fff);
    background: var(--badge-bg, #ef4444);
    border-radius: var(--radius-full, 999px);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
  }
}

// ===== Chat icon animations =====
.dot {
  opacity: 0;
}
.nav-btn.active .dot {
  animation: chatBounce 1.4s ease-in-out infinite;
}
.nav-btn.active .dot1 {
  animation-delay: 0s;
}
.nav-btn.active .dot2 {
  animation-delay: 0.2s;
}
.nav-btn.active .dot3 {
  animation-delay: 0.4s;
}
.nav-btn:not(.active) .dot {
  opacity: 0;
  animation: none;
}

@keyframes chatBounce {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

// ===== Friends icon animations =====
.pulse-ring {
  opacity: 0;
}
.nav-btn.active .pulse-ring {
  animation: friendsPulse 2s ease-out infinite;
  transform-origin: 14px 12px;
}
.nav-btn.active .person-head1,
.nav-btn.active .person-body1 {
  animation: friendsGlow 2s ease-in-out infinite;
}
.nav-btn.active .person-head2,
.nav-btn.active .person-body2 {
  animation: friendsGlow 2s ease-in-out 0.3s infinite;
}

@keyframes friendsPulse {
  0% {
    opacity: 0;
    r: 6;
  }
  50% {
    opacity: 0.4;
    r: 10;
  }
  100% {
    opacity: 0;
    r: 14;
  }
}
@keyframes friendsGlow {
  0%,
  100% {
    opacity: 0.8;
  }
  50% {
    opacity: 1;
  }
}

// ===== 交友广场 icon animations =====
.heart-pulse {
  opacity: 0;
}
.nav-btn.active .heart-pulse {
  animation: heartPulse 2s ease-out infinite;
  transform-origin: 16px 16px;
}
.nav-btn.active .heart-base {
  animation: heartBeat 2s ease-in-out infinite;
  transform-origin: 16px 16px;
}

@keyframes heartPulse {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }
  40% {
    opacity: 0.5;
    transform: scale(1.15);
  }
  100% {
    opacity: 0;
    transform: scale(1.25);
  }
}
@keyframes heartBeat {
  0%,
  100% {
    transform: scale(1);
  }
  12% {
    transform: scale(1.12);
  }
  24% {
    transform: scale(1);
  }
}

// ===== 动态广场 icon animations =====
.orbit-ring {
  transform-origin: 16px 16px;
}
.nav-btn.active .orbit-ring {
  animation: orbitSpin 3s linear infinite;
}
.nav-btn.active .satellite {
  animation: satelliteOrbit 3s linear infinite;
  transform-origin: 16px 16px;
}
.nav-btn.active .globe-base {
  animation: globePulse 3s ease-in-out infinite;
}

@keyframes orbitSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
@keyframes satelliteOrbit {
  from {
    transform: rotate(0deg) translateX(0);
  }
  to {
    transform: rotate(-360deg) translateX(0);
  }
}
@keyframes globePulse {
  0%,
  100% {
    opacity: 0.8;
  }
  50% {
    opacity: 1;
    stroke-width: 2.2;
  }
}

// ===== Profile icon animations =====
.profile-ring {
  transform-origin: 16px 16px;
}
.nav-btn.active .profile-ring {
  animation: profileSpin 4s linear infinite;
}
.nav-btn.active .accent-dot {
  animation: accentPulse 1.5s ease-in-out infinite;
}
.nav-btn.active .profile-head {
  animation: profileGlow 1.5s ease-in-out infinite;
}

@keyframes profileSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
@keyframes accentPulse {
  0%,
  100% {
    r: 2.5;
    opacity: 0.8;
  }
  50% {
    r: 3.5;
    opacity: 1;
  }
}
@keyframes profileGlow {
  0%,
  100% {
    opacity: 0.8;
  }
  50% {
    opacity: 1;
  }
}
</style>
