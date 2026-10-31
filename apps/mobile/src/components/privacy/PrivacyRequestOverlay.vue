<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { usePrivacyManager } from "@/privacy/manager";
import { useAvatar } from "@/hooks/useAvatar";
import { useI18n } from "@/i18n";
import { DEFAULT_AVATAR } from "@/stores/user";

const { state, acceptIncoming, rejectIncoming } = usePrivacyManager();
const { t } = useI18n();
const { getAvatarUrl } = useAvatar();

const show = computed(() => !!state.incoming);
const name = computed(
  () => state.incomingUser?.username || state.incoming?.request_uuid || ""
);

const avatar = ref(DEFAULT_AVATAR);
watch(
  () => state.incomingUser?.icon,
  async (icon) => {
    const url = await getAvatarUrl(icon);
    avatar.value = url || DEFAULT_AVATAR;
  },
  { immediate: true }
);
</script>

<template>
  <transition name="privacy-fade">
    <div v-if="show" class="privacy-overlay">
      <div class="privacy-card">
        <img
          class="privacy-avatar"
          :src="avatar"
          :alt="name"
          @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
        />
        <div class="privacy-name">{{ name }}</div>
        <div class="privacy-desc">{{ t("privacyChat.incomingRequest") }}</div>
        <div class="privacy-hint">{{ t("privacyChat.hint") }}</div>
        <div class="privacy-actions">
          <button class="privacy-btn reject" type="button" @click="rejectIncoming">
            {{ t("privacyChat.reject") }}
          </button>
          <button class="privacy-btn accept" type="button" @click="acceptIncoming">
            {{ t("privacyChat.accept") }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped lang="less">
.privacy-overlay {
  position: fixed;
  inset: 0;
  z-index: 3200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(10, 18, 32, 0.48);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.privacy-card {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 26px 22px 20px;
  border-radius: 20px;
  background: var(--surface);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-lg, 0 12px 40px rgba(15, 35, 75, 0.18));
}

.privacy-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: var(--shadow-sm);
}

.privacy-name {
  margin-top: 12px;
  max-width: 100%;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.privacy-desc {
  margin-top: 6px;
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
}

.privacy-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
}

.privacy-actions {
  width: 100%;
  display: flex;
  gap: 12px;
  margin-top: 22px;
}

.privacy-btn {
  flex: 1;
  height: 42px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--transition-fast, 0.15s ease);

  &:active {
    transform: scale(0.97);
  }

  &.reject {
    background: var(--surface-alt);
    color: var(--text-secondary);
    border: 1px solid var(--border-medium);
  }

  &.accept {
    background: var(--gradient-primary);
    color: #fff;
    box-shadow: var(--shadow-sm);
  }
}

.privacy-fade-enter-active,
.privacy-fade-leave-active {
  transition: opacity 0.18s ease;
}
.privacy-fade-enter-from,
.privacy-fade-leave-to {
  opacity: 0;
}
</style>
