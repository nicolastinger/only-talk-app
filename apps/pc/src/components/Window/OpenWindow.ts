import { WebviewOptions } from '@tauri-apps/api/webview';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { WindowOptions } from '@tauri-apps/api/window';

const openNewWindow = async (
  label: string,
  window: WebviewOptions | WindowOptions,
  oldWindow: any,
  title?: string,
) => {
  const newWindow = new WebviewWindow(label, {
    ...window,
    decorations: false,
    center: true,
    title: title,
  });

  await newWindow.once('tauri://created', () => {
    console.log('New window created successfully!');
    if (oldWindow) {
      setTimeout(() => {
        oldWindow.close().catch((err: any) => {
          console.error('Failed to close the current window:', err);
        });
      }, 500);
    }
  });

  await newWindow.once('tauri://error', (e) => {
    console.error('Failed to create new window:', e.payload);
  });
};

const openNewWindowWithoutClose = async (
  label: string,
  window: WebviewOptions,
  config: WindowOptions,
) => {
  const newWindow = new WebviewWindow(label, {
    ...window,
    ...config,
    decorations: false,
  });

  await newWindow.once('tauri://created', () => {
    console.log('New window created successfully!');
  });

  await newWindow.once('tauri://error', (e) => {
    console.error('创建新窗口失败', e.payload);
  });
};

export { openNewWindow, openNewWindowWithoutClose };
