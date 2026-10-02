<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const props = defineProps<{
  show: boolean;
  src: string;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "confirm", rect: CropRect): void;
}>();

const imgEl = ref<HTMLImageElement | null>(null);
const confirming = ref(false);
let cropper: Cropper | null = null;

const initCropper = () => {
  if (!imgEl.value) return;
  // 图片必须已加载完成(有真实尺寸), 否则 cropperjs 用 0 尺寸计算会卡死主线程
  if (!imgEl.value.complete || !imgEl.value.naturalWidth) return;
  cropper = new Cropper(imgEl.value, {
    viewMode: 1,
    dragMode: "move",
    aspectRatio: 1,
    autoCropArea: 1,
    cropBoxMovable: false,
    cropBoxResizable: false,
    modal: true,
    guides: false,
    center: false,
    highlight: false,
    // Android asset:// 静态协议不带 CORS, 关闭跨域克隆避免初始化失败
    checkCrossOrigin: false,
    minContainerWidth: 0,
    minContainerHeight: 0,
  });
};

// 图片加载完成后初始化。img 用 v-if="show" 每次打开都会重新挂载,
// 重新设置 src 必然触发 load, 不依赖 src 是否变化(同图重开也生效)。
const onImgLoad = () => {
  if (cropper || !props.show || !props.src) return;
  initCropper();
};

const destroyCropper = () => {
  try {
    cropper?.destroy();
  } catch (e) {
    console.error("销毁裁剪器失败:", e);
  }
  cropper = null;
};

// show 关闭时销毁; 打开时 img 通过 v-if 重新挂载, load 事件驱动初始化
watch(
  () => props.show,
  (val) => {
    if (!val) {
      destroyCropper();
    }
  },
  { immediate: true }
);

const onZoomIn = () => cropper?.zoom(0.1);
const onZoomOut = () => cropper?.zoom(-0.1);

const onConfirm = () => {
  if (!cropper || confirming.value) return;
  confirming.value = true;
  try {
    const d = cropper.getData(true);
    emit("confirm", {
      x: Math.round(d.x),
      y: Math.round(d.y),
      width: Math.round(d.width),
      height: Math.round(d.height),
    });
  } finally {
    confirming.value = false;
  }
};

const onCancel = () => emit("cancel");

onBeforeUnmount(() => {
  destroyCropper();
});
</script>

<template>
  <van-popup
    :show="show"
    position="center"
    round
    class="avatar-crop-popup"
    :style="{ width: '88%', zIndex: 3000 }"
    :close-on-click-overlay="false"
  >
    <div class="crop-body">
      <div class="crop-title">裁剪头像</div>
      <div class="crop-container">
        <img
          v-if="show"
          ref="imgEl"
          :src="src"
          alt="avatar"
          class="crop-img"
          @load="onImgLoad"
        />
      </div>
      <div class="crop-zoom">
        <van-button size="small" plain type="default" @click="onZoomOut" aria-label="缩小">
          <svg viewBox="0 0 24 24" fill="currentColor" class="zoom-icon">
            <path d="M5 11h14v2H5z" />
          </svg>
        </van-button>
        <span class="crop-zoom-tip">双指缩放 · 拖动调整位置</span>
        <van-button size="small" plain type="default" @click="onZoomIn" aria-label="放大">
          <svg viewBox="0 0 24 24" fill="currentColor" class="zoom-icon">
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
          </svg>
        </van-button>
      </div>
      <div class="crop-footer">
        <van-button size="small" plain type="default" @click="onCancel">
          取消
        </van-button>
        <van-button size="small" type="primary" :loading="confirming" @click="onConfirm">
          确定
        </van-button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped lang="less">
.crop-body {
  padding: 16px;
}

.crop-title {
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.crop-container {
  position: relative;
  width: 100%;
  height: 300px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.crop-img {
  display: block;
  max-width: 100%;
  max-height: 100%;
}

.crop-zoom {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 12px;
}

.crop-zoom-tip {
  font-size: 12px;
  color: var(--text-secondary, #999);
}

.zoom-icon {
  width: 16px;
  height: 16px;
  display: block;
}

.crop-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}
</style>