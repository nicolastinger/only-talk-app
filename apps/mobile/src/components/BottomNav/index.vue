<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

interface NavItem {
  name: string;
  path: string;
}

const route = useRoute();
const router = useRouter();

const navItems: NavItem[] = [
  { name: "chat", path: "/chats" },
  { name: "friends", path: "/friends" },
  { name: "moments", path: "/moments" },
  { name: "profile", path: "/profile" },
];

const active = computed(() => {
  const path = route.path;
  for (const item of navItems) {
    if (path.startsWith(item.path)) return item.path;
  }
  return "/chats";
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
      <svg v-if="item.name === 'chat'" class="nav-icon" viewBox="0 0 32 32" fill="none">
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
      <svg v-else-if="item.name === 'friends'" class="nav-icon" viewBox="0 0 32 32" fill="none">
        <circle class="pulse-ring" cx="14" cy="12" r="6" stroke="currentColor" stroke-width="0.6" />
        <circle class="person-head1" cx="14" cy="10" r="2.5" stroke="currentColor" stroke-width="1.8" />
        <path
          class="person-body1"
          d="M7 22c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
        <circle class="person-head2" cx="22" cy="8" r="2.2" stroke="currentColor" stroke-width="1.6" />
        <path
          class="person-body2"
          d="M17 18.5c0-2.5 2.2-4 5-4s5 1.5 5 4"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>

      <!-- Moments: globe with orbiting ring -->
      <svg v-else-if="item.name === 'moments'" class="nav-icon" viewBox="0 0 32 32" fill="none">
        <circle class="globe-base" cx="16" cy="16" r="9" stroke="currentColor" stroke-width="1.8" />
        <ellipse class="globe-equator" cx="16" cy="16" rx="9" ry="3.5" stroke="currentColor" stroke-width="1.2" />
        <path
          class="globe-meridian"
          d="M16 7v18M7 16h18"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
        <circle class="orbit-ring" cx="16" cy="16" r="12" stroke="currentColor" stroke-width="0.8" stroke-dasharray="6 3" />
        <circle class="satellite" cx="28" cy="16" r="1.8" fill="currentColor" />
      </svg>

      <!-- Profile: person with glowing accent -->
      <svg v-else-if="item.name === 'profile'" class="nav-icon" viewBox="0 0 32 32" fill="none">
        <circle class="profile-ring" cx="16" cy="16" r="11" stroke="currentColor" stroke-width="0.8" stroke-dasharray="8 5" />
        <circle class="profile-head" cx="16" cy="11" r="3.5" stroke="currentColor" stroke-width="2" />
        <path
          class="profile-body"
          d="M7 28c0-5 4-8.5 9-8.5s9 3.5 9 8.5"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
        <circle class="accent-dot" cx="27" cy="7" r="2.5" fill="var(--nav-active-color)" />
      </svg>
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
  transition: all var(--transition-normal, 0.3s ease);
  -webkit-tap-highlight-color: transparent;
  padding: 0;

  .nav-icon {
    width: var(--nav-icon-size, 28px);
    height: var(--nav-icon-size, 28px);
    color: var(--nav-inactive-color, #b0c4de);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    filter: drop-shadow(0 0 0 transparent);
  }

  &.active .nav-icon {
    color: var(--nav-active-color, #4a90ff);
    filter: drop-shadow(var(--nav-active-glow, 0 0 16px rgba(74, 144, 255, 0.5)));
    transform: scale(1.12);
  }

  // Active indicator dot
  &::after {
    content: "";
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%) scale(0);
    width: 4px;
    height: 4px;
    background: var(--nav-active-color, #4a90ff);
    border-radius: 50%;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 0 6px var(--nav-active-color, #4a90ff);
  }

  &.active::after {
    transform: translateX(-50%) scale(1);
  }
}

// ===== Chat icon animations =====
.bubble {
  transition: all 0.4s ease;
}
.nav-btn.active .bubble {
  stroke-width: 2.2;
}

.dot {
  opacity: 0;
  transition: opacity 0.2s ease;
}
.nav-btn.active .dot {
  animation: chatBounce 1.4s ease-in-out infinite;
}
.nav-btn.active .dot1 { animation-delay: 0s; }
.nav-btn.active .dot2 { animation-delay: 0.2s; }
.nav-btn.active .dot3 { animation-delay: 0.4s; }
.nav-btn:not(.active) .dot {
  opacity: 0;
  animation: none;
}

@keyframes chatBounce {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
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
  0% { opacity: 0; r: 6; }
  50% { opacity: 0.4; r: 10; }
  100% { opacity: 0; r: 14; }
}
@keyframes friendsGlow {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}

// ===== Moments icon animations =====
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
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes satelliteOrbit {
  from { transform: rotate(0deg) translateX(0); }
  to { transform: rotate(-360deg) translateX(0); }
}
@keyframes globePulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; stroke-width: 2.2; }
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
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes accentPulse {
  0%, 100% { r: 2.5; opacity: 0.8; }
  50% { r: 3.5; opacity: 1; }
}
@keyframes profileGlow {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
</style>
