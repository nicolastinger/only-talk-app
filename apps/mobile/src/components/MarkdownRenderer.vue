<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";

const props = defineProps<{
  content: string;
  /** 是否允许渲染原始 HTML(用于公告等富文本) */
  allowHtml?: boolean;
}>();

const html = computed(() => {
  const source = props.content || "";
  const rendered: string = props.allowHtml
    ? source
    : marked.parse(source, { async: false });
  return DOMPurify.sanitize(rendered || "");
});
</script>

<template>
  <div class="markdown-body" v-html="html"></div>
</template>

<style scoped lang="less">
.markdown-body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  color: var(--text-primary);
  line-height: 1.7;
  font-size: 15px;
  word-break: break-word;

  h1,
  h2,
  h3 {
    font-weight: 700;
    margin: 1.4em 0 0.5em;
  }
  h1 {
    font-size: 1.6em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid var(--border-medium);
  }
  h2 {
    font-size: 1.35em;
    padding-bottom: 0.2em;
    border-bottom: 1px solid var(--border-medium);
  }
  h3 {
    font-size: 1.15em;
  }
  p {
    margin: 1em 0;
  }
  ul,
  ol {
    margin: 1em 0 1em 1.5em;
  }
  code {
    background: var(--surface-alt);
    color: var(--color-error);
    padding: 0.2em 0.4em;
    border-radius: 4px;
    font-size: 0.97em;
    font-family: Consolas, Menlo, monospace;
  }
  pre {
    background: var(--surface-alt);
    color: var(--text-primary);
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 0.95em;
    margin: 1em 0;
    code {
      background: transparent;
      padding: 0;
      color: inherit;
    }
  }
  blockquote {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid var(--border-medium);
    background: var(--surface-alt);
    color: var(--text-tertiary);
    border-radius: 4px;
  }
  table {
    border-collapse: collapse;
    margin: 1em 0;
    width: 100%;
  }
  th,
  td {
    border: 1px solid var(--border-medium);
    padding: 0.5em 0.75em;
  }
  a {
    color: var(--brand-blue);
    text-decoration: underline;
    word-break: break-all;
  }
  img {
    max-width: 100%;
    border-radius: 8px;
  }
  hr {
    border: none;
    border-top: 1px solid var(--border-medium);
    margin: 1em 0;
  }
}
</style>
