<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons-vue';
import { invoke } from '@tauri-apps/api/core';
import CameraControl from '@/components/Media/CameraControl.vue';
import VideoReceiver from '@/components/Media/VideoReceiver.vue';
import { useI18n } from '@/i18n';
import styles from './index.module.less';

const { t } = useI18n();
const route = useRoute();
const friendId = computed(() => String(route.query.friendId ?? ''));
// 默认接受,1-客户端,0-服务端
const callType = computed(() => String(route.query.callType ?? '1'));
console.log('callType', callType.value, friendId.value);
const showMe = ref(false);
// CameraControl 通过 defineExpose 暴露的实例方法
const cameraRef = ref<InstanceType<typeof CameraControl> | null>(null);
const isReceiver = ref(false);

const getVideoConfig = async (uuid: string): Promise<string | null> => {
  try {
    const data: string = await invoke('get_user_map', {
      key: 'p2p_video_config_' + uuid,
    });
    console.log('视频配置', data);
    return data;
  } catch (e) {
    console.log('获取视频配置失败:', e);
    return null;
  }
};

// 获取对方的视频流配置
const getTargetVideoConfig = async () => {
  let flag = false;
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    // 调用方法获取flag的值
    const data = await getVideoConfig(friendId.value);
    if (data !== null) {
      console.log('对方视频配置:', data);
      isReceiver.value = true;
      flag = true;
      break;
    }
  }
  if (!flag) {
    alert(t('media.remoteVideoNotEnabled'));
  }
};

onMounted(() => {
  // 获取对方的视频流配置
  getTargetVideoConfig();
});

const handleStreamReady = (stream: MediaStream) => {
  console.log('摄像头流已就绪:', stream);
};

const handleStartCamera = async () => {
  if (cameraRef.value) {
    await cameraRef.value.startCamera();
  }
};

const handleStopCamera = () => {
  if (cameraRef.value) {
    cameraRef.value.stopCamera();
  }
};
</script>

<template>
  <div :class="styles.container">
    <div
      :class="showMe ? styles.mainVideo : styles.miniVideo"
      @click="showMe = !showMe"
    >
      <div>{{ t('media.capture') }}</div>
      <CameraControl
        ref="cameraRef"
        :is-receiver="isReceiver"
        :call-type="callType"
        :uuid="friendId"
        :on-stream-ready="handleStreamReady"
      />
    </div>

    <div v-if="isReceiver" :class="styles.btnList">
      <div :class="styles.btnContainer">
        <a-button danger @click="handleStopCamera">
          <template #icon><CloseOutlined /></template>
          {{ t('media.closeCamera') }}
        </a-button>
        <a-button type="primary" @click="handleStartCamera">
          <template #icon><CheckOutlined /></template>
          {{ t('media.openCamera') }}
        </a-button>
      </div>
    </div>

    <div
      :class="showMe ? styles.miniVideo : styles.mainVideo"
      @click="showMe = !showMe"
    >
      <div>{{ t('media.receive') }}</div>
      <VideoReceiver />
    </div>
  </div>
</template>
