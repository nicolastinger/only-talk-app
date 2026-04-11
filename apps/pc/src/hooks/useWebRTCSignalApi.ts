import { openNewWindowWithoutClose } from '@/components/Window/OpenWindow';
import { useBearStore } from '@/store/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WebviewOptions } from '@tauri-apps/api/webview';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { WindowOptions } from '@tauri-apps/api/window';
import { useEffect, useMemo, useState } from 'react';

interface WebRTCSignalMsgRaw {
  type: 'offer' | 'answer' | 'candidate';
  sender: string;
  receiver: string;
  sessionId: string;
  data: any;
  timestamp: number;
}

interface TextQuicMsgVo {
  nano_id: string;
  text_type: number;
  raw: string;
  recv_user: string;
  send_user: string;
  timestamp: number;
}

/** WebRTC窗口最大数量 */
const MAX_WEBRTC_WINDOWS = 2;

/**
 * 生成WebRTC窗口的固定label
 * 使用friendId作为标识，同一好友只会有一个窗口
 */
const getWebRTCWindowLabel = (friendId: string) => `webrtc-chat-${friendId}`;

/**
 * 检查指定friendId的WebRTC窗口是否已存在且未关闭
 */
const isWebRTCWindowOpen = async (friendId: string): Promise<boolean> => {
  try {
    const label = getWebRTCWindowLabel(friendId);
    const existingWindow = await WebviewWindow.getByLabel(label);
    if (existingWindow) {
      // 尝试访问窗口属性来确认窗口是否仍然存在
      try {
        const visible = await existingWindow.isVisible();
        return visible;
      } catch {
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
};

/**
 * 获取当前打开的WebRTC窗口数量
 * 通过遍历检查已知窗口label的方式统计
 */
const getWebRTCWindowCount = async (): Promise<number> => {
  try {
    // 从后端获取窗口状态
    const windowInfoStr = await invoke<string>('get_user_map', {
      key: 'webrtc_windows',
    }).catch(() => '{}');
    const windowInfo = JSON.parse(windowInfoStr || '{}') as Record<string, string>;
    // 过滤掉已关闭的窗口
    let count = 0;
    for (const friendId of Object.keys(windowInfo)) {
      if (await isWebRTCWindowOpen(friendId)) {
        count++;
      } else {
        // 清理已关闭窗口的记录
        delete windowInfo[friendId];
      }
    }
    // 如果有清理，更新后端
    await invoke('add_user_map', {
      map: { webrtc_windows: JSON.stringify(windowInfo) },
    }).catch(() => {});
    return count;
  } catch {
    return 0;
  }
};

/**
 * 记录WebRTC窗口状态到后端user_map
 */
const updateWebRTCWindowState = async (
  friendId: string,
  action: 'open' | 'close',
): Promise<void> => {
  try {
    const windowInfoStr = await invoke<string>('get_user_map', {
      key: 'webrtc_windows',
    }).catch(() => '{}');
    const windowInfo = JSON.parse(windowInfoStr || '{}') as Record<string, string>;

    if (action === 'open') {
      windowInfo[friendId] = Date.now().toString();
    } else {
      delete windowInfo[friendId];
    }

    await invoke('add_user_map', {
      map: { webrtc_windows: JSON.stringify(windowInfo) },
    });
  } catch (e) {
    console.error('[WebRTC] 更新窗口状态失败:', e);
  }
};

const openWebRTCChatHandler = async (
  friendId: string,
  localUserId: string,
  isInitiator: boolean,
  signalData?: string,
) => {
  // 检查是否已有该好友的WebRTC窗口
  const isAlreadyOpen = await isWebRTCWindowOpen(friendId);
  if (isAlreadyOpen) {
    console.log(`[WebRTC] 好友 ${friendId} 的WebRTC窗口已存在，聚焦现有窗口`);
    const label = getWebRTCWindowLabel(friendId);
    const existingWindow = await WebviewWindow.getByLabel(label);
    if (existingWindow) {
      try {
        await existingWindow.setFocus();
      } catch {
        // 忽略聚焦失败
      }
    }
    return;
  }

  // 检查WebRTC窗口总数是否超过限制
  const windowCount = await getWebRTCWindowCount();
  if (windowCount >= MAX_WEBRTC_WINDOWS) {
    console.warn(`[WebRTC] 已达到最大WebRTC窗口数(${MAX_WEBRTC_WINDOWS})，无法打开新窗口`);
    return;
  }

  // 使用固定的label，同一好友只会有一个窗口
  const label = getWebRTCWindowLabel(friendId);
  let url = `/webrtc/chat?friendId=${friendId}&localUserId=${localUserId}&initiator=${isInitiator}`;
  if (signalData) {
    url += `&signalData=${encodeURIComponent(signalData)}`;
  }
  const webviewOptions: WebviewOptions = {
    x: 0,
    y: 0,
    url: url,
    height: 600,
    width: 800,
  };
  const config: WindowOptions = {
    center: true,
  };

  try {
    await openNewWindowWithoutClose(label, webviewOptions, config);
    // 记录窗口状态到后端
    await updateWebRTCWindowState(friendId, 'open');
    console.log(`[WebRTC] ✅ WebRTC窗口已打开 - friendId: ${friendId}, label: ${label}`);
  } catch (e) {
    console.error(`[WebRTC] 打开窗口失败:`, e);
  }
};

const useWebRTCSignalApi = () => {
  const [state, setState] = useState<boolean>(false);
  const userInfo = useBearStore((state) => state.userInfo);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<string>('webrtc_signal', async (event) => {
          console.log('主窗口收到 WebRTC 信令消息:', event.payload);
          try {
            const msgVo: TextQuicMsgVo = JSON.parse(event.payload);
            const signalMsg: WebRTCSignalMsgRaw = JSON.parse(msgVo.raw);
            const localUserId = userInfo.uuid;

            if (signalMsg.type === 'offer') {
              // 检查是否已有该好友的WebRTC窗口
              const isAlreadyOpen = await isWebRTCWindowOpen(signalMsg.sender);
              if (isAlreadyOpen) {
                console.log(
                  `[WebRTC] 好友 ${signalMsg.sender} 的窗口已存在，信令将由Chat窗口自行处理`,
                );
                // Chat窗口自己监听了webrtc_signal事件，会自动处理
                // 只需聚焦已有窗口
                const label = getWebRTCWindowLabel(signalMsg.sender);
                const existingWindow = await WebviewWindow.getByLabel(label);
                if (existingWindow) {
                  try {
                    await existingWindow.setFocus();
                  } catch {
                    // 忽略聚焦失败
                  }
                }
                return;
              }
              console.log('收到 offer，打开 WebRTC 聊天窗口');
              await openWebRTCChatHandler(signalMsg.sender, localUserId, false, msgVo.raw);
            }
          } catch (e) {
            console.error('处理 WebRTC 信令失败:', e);
          }
        });
      } catch (e) {
        console.error('监听 WebRTC 信令失败:', e);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [userInfo.uuid]);

  return useMemo(() => ({ state }), [state]);
};

export {
  getWebRTCWindowLabel,
  isWebRTCWindowOpen,
  updateWebRTCWindowState,
  openWebRTCChatHandler,
  useWebRTCSignalApi,
};
