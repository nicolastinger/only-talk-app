import AvatarCropModal, { CropRect } from '@/components/AvatarCropModal';
import { convertPathToTauriUrl } from '@workspace/services';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useRef, useState } from 'react';

export const AVATAR_OUTPUT_SIZE = 512;

export const CROP_CANCELLED_ERROR = 'crop-cancelled';

/**
 * 头像缩放裁剪流程：
 * 1. startCrop(filePath) 打开裁剪弹窗并挂起
 * 2. 用户在弹窗内缩放/拖动确认后，调用 crop_image_to_webp_command
 *    裁剪为方形并压缩为 WebP，返回可上传的文件路径
 * 3. 取消时 Promise 以 CROP_CANCELLED_ERROR 拒绝
 */
export const useAvatarCropper = () => {
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const cropFilePathRef = useRef('');
  const resolverRef = useRef<{
    resolve: (path: string) => void;
    reject: (error: Error) => void;
  } | null>(null);

  const startCrop = useCallback((filePath: string): Promise<string> => {
    cropFilePathRef.current = filePath;
    setCropSrc(convertPathToTauriUrl(filePath));
    return new Promise<string>((resolve, reject) => {
      resolverRef.current = { resolve, reject };
    });
  }, []);

  const handleConfirm = useCallback(async (rect: CropRect) => {
    try {
      const outputPath = await invoke<string>('crop_image_to_webp_command', {
        inputPath: cropFilePathRef.current,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        outputSize: AVATAR_OUTPUT_SIZE,
      });
      resolverRef.current?.resolve(outputPath);
    } catch (error) {
      resolverRef.current?.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      resolverRef.current = null;
      setCropSrc(null);
    }
  }, []);

  const handleCancel = useCallback(() => {
    resolverRef.current?.reject(new Error(CROP_CANCELLED_ERROR));
    resolverRef.current = null;
    setCropSrc(null);
  }, []);

  const cropModalElement = cropSrc ? (
    <AvatarCropModal
      open={!!cropSrc}
      src={cropSrc}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
    />
  ) : null;

  return { startCrop, cropModalElement };
};