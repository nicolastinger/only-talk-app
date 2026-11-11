<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { subscribe } from '@workspace/services';
import { useI18n } from '@/i18n';
import styles from './style/VideoReceiver.module.css';

const { t } = useI18n();
const videoRef = ref<HTMLVideoElement | null>(null);
// 卸载时模板 ref 会先被置空，这里保留元素引用用于释放 ObjectURL
let videoEl: HTMLVideoElement | null = null;
let mediaSource: MediaSource | null = null;
let sourceBuffer: SourceBuffer | null = null;
let unlisten: (() => void) | null = null;
const isMediaSourceOpen = ref(false);
const restart = ref(0);
const isReceiving = ref(false);

const cleanup = () => {
  const video = videoEl;

  // 清理资源
  if (unlisten) {
    unlisten();
    unlisten = null;
  }

  if (mediaSource) {
    if (mediaSource.readyState === 'open') {
      try {
        if (sourceBuffer) {
          mediaSource.removeSourceBuffer(sourceBuffer);
        }
        mediaSource.endOfStream();
      } catch (err) {
        console.error('清理 MediaSource 失败:', err);
      }
    }
    if (video) {
      URL.revokeObjectURL(video.src);
    }
  }

  isMediaSourceOpen.value = false;
  sourceBuffer = null;
  mediaSource = null;
  videoEl = null;
};

const setupMediaSource = () => {
  const video = videoRef.value;
  if (!video) return;
  videoEl = video;

  // 创建 MediaSource
  const currentMediaSource = new MediaSource();
  mediaSource = currentMediaSource;
  video.src = URL.createObjectURL(currentMediaSource);

  // 等待 MediaSource 打开
  const handleSourceOpen = async () => {
    try {
      // 创建 SourceBuffer
      sourceBuffer = currentMediaSource.addSourceBuffer(
        'video/webm;codecs=vp8',
      );
      isMediaSourceOpen.value = true;
      let initFlag = false;

      // 监听视频帧事件
      unlisten = subscribe('video_frame', (payload) => {
        console.log('流长度', payload.length);
        if (!sourceBuffer) {
          console.warn('MediaSource 未就绪或已关闭');
          return;
        }

        // 开始信号
        if (!initFlag && payload.length === 7) {
          console.log('初始化信息', payload);
          const isSignal = payload.find((item) => item === 1);
          if (isSignal === undefined) {
            console.log('收到开始信号，开始接收视频数据');
            initFlag = true;
            isReceiving.value = true;
            return;
          }
        }

        // 结束信号
        if (initFlag && payload.length === 8) {
          const isSignal = payload.find((item) => item === 1);
          if (isSignal === undefined) {
            console.log('收到停止信号，停止接收视频数据');
            // 重置状态，准备接收下一次开始信号
            isReceiving.value = false;
            restart.value += 1;
            return;
          }
        }

        if (initFlag && payload.length > 0) {
          try {
            // 将数据转换为 ArrayBuffer
            const arrayBuffer = new Uint8Array(payload).buffer;

            // 如果 SourceBuffer 正在更新，等待它完成
            if (sourceBuffer.updating) {
              const handleUpdateEnd = () => {
                try {
                  if (sourceBuffer && isMediaSourceOpen.value) {
                    sourceBuffer.appendBuffer(arrayBuffer);
                  }
                } catch (err) {
                  console.error('追加视频帧失败:', err);
                }
                sourceBuffer?.removeEventListener('updateend', handleUpdateEnd);
              };
              sourceBuffer.addEventListener('updateend', handleUpdateEnd, {
                once: true,
              });
            } else {
              sourceBuffer.appendBuffer(arrayBuffer);
            }
          } catch (err) {
            console.error('处理视频帧失败:', err);
          }
        }
      });
    } catch (err) {
      console.error('初始化视频接收器失败:', err);
    }
  };

  currentMediaSource.addEventListener('sourceopen', handleSourceOpen);
};

onMounted(setupMediaSource);

watch(restart, () => {
  cleanup();
  setupMediaSource();
});

onUnmounted(cleanup);
</script>

<template>
  <div :class="styles.videoReceiver">
    <div :class="styles.videoContainer">
      <video
        ref="videoRef"
        autoplay
        playsinline
        :class="styles.videoPreview"
      />
      <div v-if="!isReceiving" :class="styles.statusOverlay">
        <span>{{ t('media.waitingVideoSignal') }}</span>
      </div>
    </div>
  </div>
</template>
