import { computed, ref } from 'vue';
import { openNewWindowWithoutClose } from '@/components/Window/OpenWindow';
import { useBearStore } from '@/stores/app';
import { invoke } from '@tauri-apps/api/core';
import type { WebviewOptions } from '@tauri-apps/api/webview';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { WindowOptions } from '@tauri-apps/api/window';
import type { TextQuicMsgVo } from '@workspace/types';
import { useBackendEvent } from './useBackendEvent';

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
 */
const getWebRTCWindowCount = async (): Promise<number> => {
  try {
    const windowInfoStr = await invoke<string>('get_user_map', {
      key: 'webrtc_windows',
    }).catch(() => '{}');
    const windowInfo = JSON.parse(windowInfoStr || '{}') as Record<
      string,
      string
    >;
    let count = 0;
    for (const friendId of Object.keys(windowInfo)) {
      if (await isWebRTCWindowOpen(friendId)) {
        count++;
      } else {
        delete windowInfo[friendId];
      }
    }
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
    const windowInfo = JSON.parse(windowInfoStr || '{}') as Record<
      string,
      string
    >;
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
  sessionId?: string,
) => {
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

  const windowCount = await getWebRTCWindowCount();
  if (windowCount >= MAX_WEBRTC_WINDOWS) {
    console.warn(
      `[WebRTC] 已达到最大WebRTC窗口数(${MAX_WEBRTC_WINDOWS})，无法打开新窗口`,
    );
    return;
  }

  const label = getWebRTCWindowLabel(friendId);
  let url = `/webrtc/chat?friendId=${friendId}&localUserId=${localUserId}&initiator=${isInitiator}`;
  if (signalData) {
    url += `&signalData=${encodeURIComponent(signalData)}`;
  }
  if (sessionId) {
    url += `&sessionId=${encodeURIComponent(sessionId)}`;
  }
  const webviewOptions: WebviewOptions = {
    x: 0,
    y: 0,
    url,
    height: 600,
    width: 800,
  };
  const config: WindowOptions = {
    center: true,
  };

  try {
    await openNewWindowWithoutClose(label, webviewOptions, config);
    await updateWebRTCWindowState(friendId, 'open');
    console.log(
      `[WebRTC] ✅ WebRTC窗口已打开 - friendId: ${friendId}, label: ${label}`,
    );
  } catch (e) {
    console.error('[WebRTC] 打开窗口失败:', e);
  }
};

export const useWebRTCSignalApi = () => {
  const state = ref<boolean>(false);

  // WebRTC 窗口的开启由「邀请(12)来电监听 / 发起方直接开窗」流程驱动。
  // 100 信令只在已打开的 WebRTC 窗口内部处理，本 hook 不再监听信令自动开窗。
  return { state };
};

/**
 * 全局监听视频通话来电（text_type=12），在 RootLayout 中调用，
 * 避免依赖聊天会话窗口的 useMessageApi 而漏接。作为被叫打开 WebRTC 窗口（responder）。
 */
export const useWebRTCIncomingCall = () => {
  const store = useBearStore();
  const meUuid = computed(() => store.userInfo?.uuid || '');

  useBackendEvent(
    'call_control',
    async (payload) => {
      if (!meUuid.value) return;
      const text: TextQuicMsgVo = JSON.parse(payload);
      if (text.recv_user !== meUuid.value) return;
      // 自己发给自己的邀请(self-echo)：忽略，避免打开自呼窗口形成本端自连
      if (text.send_user === meUuid.value) return;
      if (text.text_type !== 12) return; // MSG_TYPE_P2P_VIDEO_CALL_INVITE

      let sessionId = '';
      try {
        const parsed = JSON.parse(text.raw);
        sessionId = parsed.sessionId || '';
      } catch {
        // 忽略解析失败
      }

      console.log(
        `[WebRTC] 收到来电邀请 - 发起方: ${text.send_user}, sessionId: ${sessionId}`,
      );
      await openWebRTCChatHandler(
        text.send_user,
        meUuid.value,
        false,
        undefined,
        sessionId,
      ).catch((e) => {
        console.error('[WebRTC] 打开被叫窗口失败:', e);
      });
    },
    () => !!meUuid.value,
  );
};

export {
  getWebRTCWindowLabel,
  isWebRTCWindowOpen,
  openWebRTCChatHandler,
  updateWebRTCWindowState,
};
