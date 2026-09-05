<script setup lang="ts">
import { ref, computed } from "vue";
import { EMOJI_LIST } from "@/chat/emojiList";

export type InputTool =
  | "emoji"
  | "image"
  | "file"
  | "audio"
  | "video";

const props = defineProps<{
  modelValue: string;
  tools?: InputTool[];
  placeholder?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "send", text: string): void;
  (e: "pick-image"): void;
  (e: "pick-file"): void;
  (e: "call", media: "audio" | "video"): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const showPanel = ref(false);
const showEmoji = ref(false);

const tools = computed<InputTool[]>(() => props.tools || ["emoji", "image", "file"]);

const toolDefs: Record<InputTool, { label: string; svg: string }> = {
  emoji: {
    label: "表情",
    svg: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z",
  },
  image: {
    label: "图片",
    svg: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  },
  file: {
    label: "文件",
    svg: "M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z",
  },
  audio: {
    label: "语音通话",
    svg: "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z",
  },
  video: {
    label: "视频通话",
    svg: "M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z",
  },
};

const togglePanel = () => {
  showPanel.value = !showPanel.value;
  if (showPanel.value) {
    showEmoji.value = false;
    inputRef.value?.blur();
  }
};

const clickTool = (tool: InputTool) => {
  if (tool === "emoji") {
    showEmoji.value = !showEmoji.value;
    return;
  }
  if (tool === "image") {
    emit("pick-image");
    return;
  }
  if (tool === "file") {
    emit("pick-file");
    return;
  }
  if (tool === "audio") {
    emit("call", "audio");
    return;
  }
  if (tool === "video") {
    emit("call", "video");
    return;
  }
};

const selectEmoji = (emoji: string) => {
  emit("update:modelValue", props.modelValue + emoji);
  showEmoji.value = false;
  inputRef.value?.focus();
};

const doSend = () => {
  const text = props.modelValue.trim();
  if (!text || props.disabled) return;
  emit("send", text);
};

const onInput = (e: Event) => {
  emit("update:modelValue", (e.target as HTMLInputElement).value);
};
</script>

<template>
  <div class="input-area">
    <!-- 工具面板 -->
    <transition name="panel">
      <div v-if="showPanel" class="tool-panel">
        <div class="tool-grid">
          <div
            v-for="tool in tools"
            :key="tool"
            class="tool-item"
            :class="{ active: tool === 'emoji' && showEmoji }"
            @click="clickTool(tool)"
          >
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path :d="toolDefs[tool].svg" />
              </svg>
            </span>
            <span class="tool-label">{{ toolDefs[tool].label }}</span>
          </div>
        </div>
        <div v-if="showEmoji" class="emoji-grid">
          <span
            v-for="(emoji, index) in EMOJI_LIST"
            :key="index"
            class="emoji-item"
            @click="selectEmoji(emoji)"
          >
            {{ emoji }}
          </span>
        </div>
      </div>
    </transition>

    <!-- 输入行 -->
    <div class="input-bar">
      <button
        class="tool-btn"
        :class="{ open: showPanel }"
        :aria-label="showPanel ? '收起工具面板' : '展开工具面板'"
        @click="togglePanel"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </button>
      <input
        ref="inputRef"
        :value="modelValue"
        class="text-input"
        :placeholder="placeholder || '输入消息...'"
        :disabled="disabled"
        @input="onInput"
        @keyup.enter="doSend"
      />
      <button
        class="send-btn"
        :disabled="disabled || !modelValue.trim()"
        @click="doSend"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped lang="less">
.input-area {
  flex-shrink: 0;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--border-light);
}

.tool-panel {
  border-top: 1px solid var(--border-light);
  animation: panel-in 0.18s ease;
}
@keyframes panel-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.tool-grid {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  padding: 14px 16px 12px;
  flex-wrap: wrap;
}
.tool-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  .tool-icon {
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    border: 1px solid var(--border-medium);
    border-radius: 16px;
    color: var(--text-tertiary);
    box-shadow: var(--shadow-xs);
    svg {
      width: 25px;
      height: 25px;
    }
  }
  .tool-label {
    font-size: 12px;
    color: var(--text-tertiary);
  }
  &:active .tool-icon {
    transform: scale(0.92);
    background: var(--surface-hover);
  }
  &.active .tool-icon {
    color: var(--brand-blue);
    border-color: var(--brand-blue);
    box-shadow: var(--shadow-glow-sm);
  }
}

.emoji-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px 12px 14px;
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid var(--border-light);
  animation: panel-in 0.15s ease;
  .emoji-item {
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 25px;
    border-radius: 8px;
    cursor: pointer;
    &:active {
      background: var(--surface-hover);
      transform: scale(0.9);
    }
  }
}

.input-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
}

.tool-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: 50%;
  color: var(--text-tertiary);
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  flex-shrink: 0;
  transition: transform 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  svg {
    width: 22px;
    height: 22px;
  }
  &.open {
    transform: rotate(45deg);
    color: var(--brand-blue);
    border-color: var(--brand-blue);
  }
  &:active {
    background: var(--surface-hover);
  }
}

.text-input {
  flex: 1;
  height: 40px;
  padding: 0 16px;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: 20px;
  outline: none;
  font-size: 15px;
  color: var(--text-primary);
  box-shadow: var(--shadow-xs);
  min-width: 0;
  &::placeholder {
    color: var(--text-placeholder);
  }
  &:focus {
    border-color: var(--brand-blue);
    box-shadow: var(--shadow-glow-sm);
  }
}

.send-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary);
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  svg {
    width: 20px;
    height: 20px;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  &:active:not(:disabled) {
    transform: scale(0.95);
  }
}
</style>
