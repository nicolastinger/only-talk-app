<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  src?: string | null;
  loading?: boolean;
  alt?: string;
}>();

const emit = defineEmits<{
  (e: "preview"): void;
}>();

const error = ref(false);

const onImgError = () => {
  error.value = true;
};

const onClick = () => {
  if (props.src && !error.value) emit("preview");
};
</script>

<template>
  <div class="image-msg">
    <img
      v-if="src && !error"
      :src="src"
      :alt="alt || '图片消息'"
      class="img"
      @click="onClick"
      @error="onImgError"
    />
    <div v-else-if="loading" class="image-placeholder">
      <span>加载中...</span>
    </div>
    <div v-else class="image-placeholder">
      <span>图片加载失败</span>
    </div>
  </div>
</template>

<style scoped lang="less">
.image-msg {
  .img {
    max-width: 220px;
    max-height: 300px;
    border-radius: 10px;
    box-shadow: var(--shadow-md);
    object-fit: cover;
    display: block;
  }
}
.image-placeholder {
  width: 140px;
  height: 105px;
  border-radius: 10px;
  background: var(--surface-alt);
  border: 1px dashed var(--border-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-placeholder);
}
</style>
