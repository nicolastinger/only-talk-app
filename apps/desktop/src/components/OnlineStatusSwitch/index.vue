<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  CheckCircleFilled,
  CheckCircleOutlined,
  DownOutlined,
} from '@ant-design/icons-vue';
import { useI18n } from '@/i18n';
import { isPresenceExpired, usePresenceStore } from '@/stores/presence';
import { feedback } from '@/utils/feedback';
import type { PresenceMode } from '@workspace/types';
import { PRESENCE_META } from '@/components/PresenceTag/meta';
import styles from './index.module.less';

/** 可选状态; online 表示"无状态/清除", 与在线离线无关 */
const STATUS_OPTIONS: PresenceMode[] = [
  'online',
  'busy',
  'away',
  'studying',
  'working',
  'custom',
];

const IDLE_COLOR = '#52c41a';
const PRESENCE_TTL_MS = 48 * 60 * 60 * 1000;
const CUSTOM_MAX_LEN = 32;

const { t } = useI18n();
const presenceStore = usePresenceStore();

const open = ref(false);
const editing = ref(false);
const customText = ref('');
const saving = ref(false);

onMounted(() => {
  presenceStore.loadMyPresence();
});

const alpha = (hex: string, value: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${value})`;
};

const active = computed(
  () =>
    !!presenceStore.myPresence &&
    presenceStore.myPresence.mode !== 'online' &&
    !isPresenceExpired(presenceStore.myPresence),
);

const currentMode = computed<PresenceMode>(() =>
  active.value && presenceStore.myPresence
    ? presenceStore.myPresence.mode
    : 'online',
);

const currentColor = computed(() =>
  currentMode.value === 'online'
    ? IDLE_COLOR
    : PRESENCE_META[currentMode.value as Exclude<PresenceMode, 'online'>].color,
);

const labelOf = (mode: PresenceMode): string => {
  if (mode === 'online') return t('onlineStatus.online');
  if (mode === 'custom') {
    return active.value && presenceStore.myPresence?.text
      ? presenceStore.myPresence.text
      : t('onlineStatus.custom');
  }
  return t(PRESENCE_META[mode as Exclude<PresenceMode, 'online'>].labelId);
};

const currentLabel = computed(() => labelOf(currentMode.value));

const apply = async (mode: PresenceMode, text?: string) => {
  try {
    await presenceStore.updateMyPresence(mode, text);
  } catch (e) {
    console.error('[presence] 设置状态失败', e);
    feedback.message.error(t('onlineStatus.setFailed'));
    throw e;
  }
};

const handleOpenChange = (next: boolean) => {
  open.value = next;
  if (!next) editing.value = false;
};

const handleSelect = (mode: PresenceMode) => {
  if (mode === 'custom') {
    customText.value =
      presenceStore.myPresence?.mode === 'custom'
        ? presenceStore.myPresence.text || ''
        : '';
    editing.value = true;
    return;
  }
  handleOpenChange(false);
  apply(mode).catch(() => {});
};

const submitCustom = async () => {
  const text = customText.value.trim();
  if (!text) {
    feedback.message.warning(t('onlineStatus.customEmpty'));
    return;
  }
  saving.value = true;
  try {
    await apply('custom', text);
    handleOpenChange(false);
  } catch {
    // 错误已由 apply 统一提示
  } finally {
    saving.value = false;
  }
};

const remainingMs = computed(() =>
  active.value && presenceStore.myPresence
    ? Math.max(0, presenceStore.myPresence.expires_at - Date.now())
    : 0,
);
const remainingHours = computed(() =>
  Math.max(1, Math.ceil(remainingMs.value / 3_600_000)),
);
const remainingPercent = computed(() =>
  Math.min(100, Math.max(0, (remainingMs.value / PRESENCE_TTL_MS) * 100)),
);

const tooltip = computed(() =>
  active.value && remainingMs.value > 0
    ? `${currentLabel.value} · ${t('onlineStatus.remainingHours', {
        hours: remainingHours.value,
      })}`
    : t('onlineStatus.title'),
);
</script>

<template>
  <a-popover
    v-model:open="open"
    trigger="click"
    placement="bottomLeft"
    :arrow="false"
    :overlay-style="{
      padding: 0,
      background: 'transparent',
      boxShadow: 'none',
    }"
    @open-change="handleOpenChange"
  >
    <template #content>
      <div :class="styles.panel">
        <div :class="styles.panelHeader">
          <span :class="styles.panelTitle">{{ t('onlineStatus.title') }}</span>
          <span
            v-if="active"
            :class="styles.currentChip"
            :style="{
              color: currentColor,
              background: alpha(currentColor, 0.12),
            }"
          >
            {{ currentLabel }}
          </span>
        </div>

        <div v-if="editing" :class="styles.editor">
          <div :class="styles.editorField">
            <a-input
              v-model:value="customText"
              autofocus
              variant="borderless"
              :maxlength="CUSTOM_MAX_LEN"
              :placeholder="t('onlineStatus.customPlaceholder')"
              @press-enter="submitCustom"
            />
          </div>
          <div :class="styles.editorBar">
            <span :class="styles.counter">
              {{ customText.length }}/{{ CUSTOM_MAX_LEN }}
            </span>
            <div :class="styles.editorActions">
              <a-button size="small" type="text" @click="editing = false">
                {{ t('common.cancel') }}
              </a-button>
              <a-button
                size="small"
                type="primary"
                :loading="saving"
                @click="submitCustom"
              >
                {{ t('common.save') }}
              </a-button>
            </div>
          </div>
        </div>

        <div v-else :class="styles.grid">
          <button
            v-for="mode in STATUS_OPTIONS"
            :key="mode"
            type="button"
            :aria-pressed="currentMode === mode"
            :class="[styles.cell, currentMode === mode ? styles.cellActive : '']"
            :style="
              (() => {
                const meta =
                  mode === 'online'
                    ? null
                    : PRESENCE_META[mode as Exclude<PresenceMode, 'online'>];
                const color = meta?.color ?? IDLE_COLOR;
                return {
                  '--cell-soft': alpha(color, 0.12),
                  '--cell-ring': alpha(color, 0.32),
                  '--cell-glow': alpha(color, 0.18),
                };
              })()
            "
            @click="handleSelect(mode)"
          >
            <span
              :class="styles.cellIcon"
              :style="{
                color:
                  mode === 'online'
                    ? IDLE_COLOR
                    : PRESENCE_META[mode as Exclude<PresenceMode, 'online'>]
                        .color,
              }"
            >
              <component
                :is="
                  mode === 'online'
                    ? CheckCircleOutlined
                    : PRESENCE_META[mode as Exclude<PresenceMode, 'online'>]
                        .icon
                "
              />
            </span>
            <span :class="styles.cellLabel">{{ labelOf(mode) }}</span>
            <CheckCircleFilled
              v-if="currentMode === mode"
              :class="styles.cellCheck"
              :style="{
                color:
                  mode === 'online'
                    ? IDLE_COLOR
                    : PRESENCE_META[mode as Exclude<PresenceMode, 'online'>]
                        .color,
              }"
            />
          </button>
        </div>

        <div :class="styles.panelFooter">
          <div :class="styles.footerRow">
            <span :class="styles.footerText">
              {{ t('onlineStatus.expireShort') }}
            </span>
            <span
              v-if="active && remainingMs > 0"
              :class="styles.footerRemain"
              :style="{ color: currentColor }"
            >
              {{ t('onlineStatus.remainingHours', { hours: remainingHours }) }}
            </span>
          </div>
          <div v-if="active" :class="styles.progressTrack">
            <div
              :class="styles.progressFill"
              :style="{
                width: `${remainingPercent}%`,
                background: currentColor,
              }"
            />
          </div>
        </div>
      </div>
    </template>

    <button
      type="button"
      :title="tooltip"
      :aria-label="tooltip"
      :aria-expanded="open"
      :class="[
        styles.trigger,
        active ? styles.triggerActive : '',
        open ? styles.triggerOpen : '',
      ]"
      :style="
        active
          ? {
              '--trigger-soft': alpha(currentColor, 0.12),
              '--trigger-ring': alpha(currentColor, 0.32),
              '--trigger-hover': alpha(currentColor, 0.2),
            }
          : undefined
      "
    >
      <span
        :class="[styles.dot, active ? '' : styles.dotIdle]"
        :style="
          active
            ? {
                background: currentColor,
                boxShadow: `0 0 0 3px ${alpha(currentColor, 0.16)}`,
              }
            : undefined
        "
      />
      <span :class="styles.triggerLabel">{{ currentLabel }}</span>
      <DownOutlined :class="[styles.chevron, open ? styles.chevronOpen : '']" />
    </button>
  </a-popover>
</template>
