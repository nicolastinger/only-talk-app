<script setup lang="ts">
import { ref } from 'vue';
import { selectFile } from '@workspace/services';

const selectedFiles = ref<string[]>([]);
const loading = ref(false);

const handleSingleSelect = async () => {
  loading.value = true;
  try {
    const files = await selectFile(false);
    if (files) {
      selectedFiles.value = files;
    }
  } catch (error) {
    console.error('单选文件失败:', error);
  } finally {
    loading.value = false;
  }
};

const handleMultiSelect = async () => {
  loading.value = true;
  try {
    const files = await selectFile(true);
    if (files) {
      selectedFiles.value = files;
    }
  } catch (error) {
    console.error('多选文件失败:', error);
  } finally {
    loading.value = false;
  }
};

const handleClear = () => {
  selectedFiles.value = [];
};
</script>

<template>
  <a-card title="文件选择器测试" :bordered="false">
    <a-space direction="vertical" size="large" style="width: 100%">
      <div>
        <a-typography-title :level="4">操作</a-typography-title>
        <a-space>
          <a-button
            type="primary"
            :loading="loading"
            @click="handleSingleSelect"
          >
            单选文件
          </a-button>
          <a-button :loading="loading" @click="handleMultiSelect">
            多选文件
          </a-button>
          <a-button :disabled="selectedFiles.length === 0" @click="handleClear">
            清空
          </a-button>
        </a-space>
      </div>

      <div>
        <a-typography-title :level="4">选择结果</a-typography-title>
        <a-typography-text v-if="selectedFiles.length === 0" type="secondary">
          未选择任何文件
        </a-typography-text>
        <a-list v-else bordered :data-source="selectedFiles">
          <template #renderItem="{ item, index }">
            <a-list-item>
              <a-space>
                <a-tag color="blue">{{ index + 1 }}</a-tag>
                <a-typography-text code>{{ item }}</a-typography-text>
              </a-space>
            </a-list-item>
          </template>
        </a-list>
      </div>

      <div>
        <a-typography-title :level="4">统计信息</a-typography-title>
        <a-space>
          <a-typography-text>
            已选择文件数量:
            <a-tag color="green">{{ selectedFiles.length }}</a-tag>
          </a-typography-text>
        </a-space>
      </div>
    </a-space>
  </a-card>
</template>
