<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import styles from './index.module.less';

const props = withDefaults(
  defineProps<{
    content: string;
    /** 是否允许渲染原始 HTML(用于公告等富文本) */
    allowHtml?: boolean;
    /** 去掉默认容器(背景/内边距/阴影)，交由外部容器包裹 */
    bare?: boolean;
  }>(),
  {
    allowHtml: false,
    bare: false,
  },
);

const html = computed(() => {
  const source = props.content || '';
  const rendered: string = props.allowHtml
    ? source
    : marked.parse(source, { async: false });
  return DOMPurify.sanitize(rendered || '');
});
</script>

<template>
  <div :class="[styles.markdownBody, bare ? styles.bare : '']" v-html="html" />
</template>
