import { ref } from 'vue';
import { convertPathToTauriUrl } from '@workspace/services';
import { invoke } from '@tauri-apps/api/core';

export const AVATAR_OUTPUT_SIZE = 512;
export const CROP_CANCELLED_ERROR = 'crop-cancelled';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 全局共享的裁剪状态：宿主组件统一渲染一次弹窗 */
const cropSrc = ref<string | null>(null);
let cropFilePath = '';
let resolver: {
  resolve: (path: string) => void;
  reject: (error: Error) => void;
} | null = null;

/**
 * 头像缩放裁剪流程：
 * 1. startCrop(filePath) 打开裁剪弹窗并挂起
 * 2. 用户在弹窗内缩放/拖动确认后，调用 crop_image_to_webp_command
 *    裁剪为方形并压缩为 WebP，返回可上传的文件路径
 * 3. 取消时 Promise 以 CROP_CANCELLED_ERROR 拒绝
 */
export const useAvatarCropper = () => {
  const startCrop = (filePath: string): Promise<string> => {
    cropFilePath = filePath;
    cropSrc.value = convertPathToTauriUrl(filePath);
    return new Promise<string>((resolve, reject) => {
      resolver = { resolve, reject };
    });
  };

  const handleConfirm = async (rect: CropRect) => {
    try {
      const outputPath = await invoke<string>('crop_image_to_webp_command', {
        inputPath: cropFilePath,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        outputSize: AVATAR_OUTPUT_SIZE,
      });
      resolver?.resolve(outputPath);
    } catch (error) {
      resolver?.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      resolver = null;
      cropSrc.value = null;
    }
  };

  const handleCancel = () => {
    resolver?.reject(new Error(CROP_CANCELLED_ERROR));
    resolver = null;
    cropSrc.value = null;
  };

  return { cropSrc, startCrop, handleConfirm, handleCancel };
};
