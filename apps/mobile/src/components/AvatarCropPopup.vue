<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
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

// 销毁并重建实例。重建不再依赖 <img> 的 load 事件 —— Vant popup 的 lazyRender 会让
// <img> 常驻 DOM, 再次打开同一张图 src 不变不会触发 load, 旧实现导致 cropper 永远为 null。
const rebuildCropper = async () => {
  cropper?.destroy();
  cropper = null;
  if (!props.show || !props.src || !imgEl.value) return;
  await nextTick();
  if (!props.show || !props.src || !imgEl.value) return;
  initCropper();
};

watch(
  [() => props.show, () => props.src],
  () => {
    rebuildCropper();
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

const onClosed = () => {
  cropper?.destroy();
  cropper = null;
};

onBeforeUnmount(() => {
  cropper?.destroy();
});
</script>

<template>
  <van-popup
    :show="show"
    position="center"
    round
    class="avatar-crop-popup"
    :style="{ width: '88%' }"
    :close-on-click-overlay="false"
    @closed="onClosed"
  >
    <div class="crop-body">
      <div class="crop-title">裁剪头像</div>
      <div class="crop-container">
        <img ref="imgEl" :src="src" alt="avatar" class="crop-img" />
      </div>
      <div class="crop-zoom">
        <van-button size="small" plain type="default" icon="zoom-out" @click="onZoomOut" />
        <span class="crop-zoom-tip">双指缩放 · 拖动调整位置</span>
        <van-button size="small" plain type="default" icon="zoom-in" @click="onZoomIn" />
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

.crop-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}
</style>