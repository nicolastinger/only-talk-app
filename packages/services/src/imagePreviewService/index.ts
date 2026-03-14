import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

/**
 * 打开图片预览窗口
 * @param imagePaths 图片路径列表
 * @param currentIndex 当前图片索引（可选）
 * @param title 窗口标题（可选，默认为"图片预览"）
 */
export const openImagePreviewWindow = async (
  imagePaths: string[],
  currentIndex: number = 0,
  title: string = '图片预览',
): Promise<void> => {
  try {
    const label = `image-preview-${Date.now()}`;
    
    const webviewWindow = new WebviewWindow(label, {
      title,
      url: `/imagePreview?images=${encodeURIComponent(JSON.stringify(imagePaths))}&index=${currentIndex}`,
      width: 800,
      height: 600,
      center: true,
      decorations: true,
      resizable: true,
      minimizable: true,
      maximizable: true,
      closable: true,
    });
    
    await webviewWindow.once('tauri://created', () => {
      console.log('Image preview window created successfully!');
    });
    
    await webviewWindow.once('tauri://error', (e) => {
      console.error('Failed to create image preview window:', e.payload);
    });
  } catch (error) {
    console.error('Failed to open image preview window:', error);
    throw error;
  }
};