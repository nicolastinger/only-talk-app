<script setup lang="ts">
import styles from './Guide.module.less';

interface Props {
  name: string;
}

defineProps<Props>();
</script>

<template>
  <a-layout>
    <a-row>
      <a-typography-title :level="3" :class="styles.title">
        欢迎使用 <strong>{{ name }}</strong> ！
      </a-typography-title>
    </a-row>
  </a-layout>
</template>
