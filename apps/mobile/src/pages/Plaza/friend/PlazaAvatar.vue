<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { useAvatar } from "@/hooks/useAvatar";
import { DEFAULT_AVATAR } from "@/stores/user";

const props = withDefaults(
  defineProps<{
    icon?: string;
    size?: number;
  }>(),
  { size: 48 }
);

const { getAvatarUrl } = useAvatar();
const url = ref("");

const load = async () => {
  if (!props.icon) {
    url.value = "";
    return;
  }
  url.value = (await getAvatarUrl(props.icon)) || "";
};

watch(() => props.icon, load);
onMounted(load);
</script>

<template>
  <span
    class="plaza-avatar"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <img
      v-if="url"
      :src="url"
      alt="avatar"
      class="img"
      @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
    />
    <span v-else class="img fallback" :style="{ fontSize: `${size * 0.42}px` }">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
        />
      </svg>
    </span>
  </span>
</template>

<style scoped lang="less">
.plaza-avatar {
  flex-shrink: 0;
  display: inline-flex;
  border-radius: 50%;
  overflow: hidden;
  background: var(--surface-hover);
  vertical-align: middle;
}

.img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: var(--gradient-primary);

  svg {
    width: 55%;
    height: 55%;
  }
}
</style>
