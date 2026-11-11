<script setup lang="ts">
import { ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@/i18n';
import { useBearStore } from '@/stores/app';
import styles from './style/CameraControl.module.css';

interface CameraControlProps {
  onStreamReady?: (stream: MediaStream) => void;
  isReceiver?: boolean;
  uuid: string;
  callType?: string;
  remoteStream?: MediaStream;
}

const props = withDefaults(defineProps<CameraControlProps>(), {
  isReceiver: false,
});

const { t } = useI18n();
const store = useBearStore();
const videoRef = ref<HTMLVideoElement | null>(null);
const stream = ref<MediaStream | null>(null);
const error = ref<string>('');
const isCameraOn = ref(false);
const availableCameras = ref<MediaDeviceInfo[]>([]);
const selectedCamera = ref<string>('');
const mediaRecorderRef = ref<MediaRecorder | null>(null);

const videoConfig = () => store.videoConfig;

watch(
  videoConfig,
  (config) => {
    console.log('videoConfig', config, props.uuid);
    // 发送视频配置
    invoke('send_p2p_video_config', {
      videoConfig: JSON.stringify(config),
      uuid: props.uuid,
    });
  },
  { immediate: true },
);

// 获取可用的摄像头设备
const getAvailableCameras = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(
      (device) => device.kind === 'videoinput',
    );
    availableCameras.value = videoDevices;

    if (videoDevices.length > 0) {
      selectedCamera.value = videoDevices[0].deviceId;
    }
  } catch (err) {
    error.value = t('media.cameraListError');
    console.error('获取摄像头列表失败:', err);
  }
};

// 启动摄像头
const startCamera = async () => {
  try {
    // 发送开始信号到 Rust 后端
    const startBuffer = new ArrayBuffer(7);
    await invoke('send_video_frame', {
      frameData: Array.from(new Uint8Array(startBuffer)),
      uuid: props.uuid,
    });
    const config = store.videoConfig;
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: selectedCamera.value
          ? { exact: selectedCamera.value }
          : undefined,
        width: { ideal: config.width },
        height: { ideal: config.height },
        facingMode: 'user',
        frameRate: config.fps,
      },
      audio: config.audio,
    });

    if (videoRef.value) {
      videoRef.value.srcObject = mediaStream;
    }

    stream.value = mediaStream;
    isCameraOn.value = true;

    if (props.onStreamReady) {
      //props.onStreamReady(mediaStream);
    }

    // 使用 MediaRecorder 捕获视频流
    if (props.isReceiver) {
      // 检查浏览器支持的编码格式
      const mimeType = config.encode;
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.error('当前浏览器不支持 VP8 编码');
        error.value = t('media.codecNotSupported');
        return;
      }

      try {
        const mediaRecorder = new MediaRecorder(mediaStream, {
          mimeType: mimeType,
          videoBitsPerSecond: config.bitrate, // 1 Mbps
        });

        mediaRecorderRef.value = mediaRecorder;

        mediaRecorder.onerror = (event) => {
          console.error('MediaRecorder 错误:', event);
          error.value = t('media.recordingError');
        };

        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            try {
              // 将视频数据转换为 ArrayBuffer
              const arrayBuffer = await event.data.arrayBuffer();

              // 发送到 Rust 后端
              await invoke('send_video_frame', {
                frameData: Array.from(new Uint8Array(arrayBuffer)),
                uuid: props.uuid,
              });
            } catch (err) {
              console.error('发送视频帧失败:', err);
            }
          } else {
            console.warn('收到空的视频帧数据');
          }
        };

        // 每 30ms 捕获一次数据
        mediaRecorder.start(30);
      } catch (err) {
        console.error('创建 MediaRecorder 失败:', err);
        error.value = t('media.recorderCreateFailed');
      }
    }
  } catch (err) {
    error.value = t('media.cameraAccessError');
    console.error('启动摄像头失败:', err);
  }
};

// 停止摄像头
const stopCamera = () => {
  if (stream.value) {
    // 发送开始信号到 Rust 后端
    const startBuffer = new ArrayBuffer(8);
    invoke('send_video_frame', {
      frameData: Array.from(new Uint8Array(startBuffer)),
      uuid: props.uuid,
    });
    stream.value.getTracks().forEach((track) => track.stop());
    if (videoRef.value) {
      videoRef.value.srcObject = null;
    }
    stream.value = null;
    isCameraOn.value = false;

    // 停止 MediaRecorder
    if (
      mediaRecorderRef.value &&
      mediaRecorderRef.value.state !== 'inactive'
    ) {
      mediaRecorderRef.value.stop();
    }
  }
};

// 切换摄像头
const switchCamera = async () => {
  if (stream.value) {
    stopCamera();
    const currentIndex = availableCameras.value.findIndex(
      (cam) => cam.deviceId === selectedCamera.value,
    );
    const nextIndex = (currentIndex + 1) % availableCameras.value.length;
    selectedCamera.value = availableCameras.value[nextIndex].deviceId;
    await startCamera();
  }
};

// 暴露方法给父组件
defineExpose({
  startCamera,
  stopCamera,
  switchCamera,
  isCameraOn: () => isCameraOn.value,
});

// 处理远程视频流
watch(
  [() => props.isReceiver, () => props.remoteStream],
  ([isReceiver, remoteStream]) => {
    if (isReceiver && remoteStream && videoRef.value) {
      videoRef.value.srcObject = remoteStream;
    }
  },
);

// 组件挂载时获取可用摄像头
watch(
  () => props.isReceiver,
  (isReceiver, _old, onCleanup) => {
    if (!isReceiver) {
      getAvailableCameras();
    }
    onCleanup(() => {
      stopCamera();
    });
  },
  { immediate: true },
);

const handleSelectCamera = (e: Event) => {
  selectedCamera.value = (e.target as HTMLSelectElement).value;
};
</script>

<template>
  <div :class="styles.cameraControl">
    <div :class="styles.videoContainer">
      <video
        ref="videoRef"
        autoplay
        playsinline
        muted
        :class="styles.videoPreview"
      />
    </div>

    <div v-if="error" :class="styles.errorMessage">{{ error }}</div>

    <template v-if="!isReceiver">
      <div :class="styles.controls">
        <button
          v-if="false"
          type="button"
          :class="styles.controlButton"
          @click="isCameraOn ? stopCamera : startCamera"
        >
          {{ isCameraOn ? t('media.closeCamera') : t('media.openCamera') }}
        </button>

        <button
          v-if="isCameraOn && availableCameras.length > 1"
          type="button"
          :class="styles.controlButton"
          @click="switchCamera"
        >
          {{ t('media.switchCamera') }}
        </button>
      </div>

      <select
        v-if="availableCameras.length > 1"
        :value="selectedCamera"
        :class="styles.cameraSelect"
        @change="handleSelectCamera"
      >
        <option
          v-for="camera in availableCameras"
          :key="camera.deviceId"
          :value="camera.deviceId"
        >
          {{
            camera.label ||
            `${t('media.camera')} ${camera.deviceId.slice(0, 5)}`
          }}
        </option>
      </select>
    </template>
  </div>
</template>
