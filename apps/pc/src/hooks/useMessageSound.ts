import {
  armMessageSound,
  isDoNotDisturbEnabled,
  isInDoNotDisturbWindow,
  isMessageSoundEnabled,
  playMessageSound,
} from '@workspace/services';
import { useEffect } from 'react';
import { useBackendEvent } from './useBackendEvent';

/**
 * 来消息提示音。
 *
 * 复用 Rust 端 `alert_incoming_message`：已过滤自己其它端的回推、系统消息、
 * 当前正在查看的会话，并按会话做去抖；设置里关闭提示音时不播放。
 * 声音为 WebAudio 合成，启动时先解锁音频上下文以绕过自动播放限制。
 */
const useMessageSound = () => {
  useEffect(() => {
    armMessageSound();
  }, []);

  useBackendEvent('alert_incoming_message', () => {
    if (!isMessageSoundEnabled()) return;
    // 夜间免打扰时段不响(Rust 端已拦截，这里兜底旧版本后端)
    if (isDoNotDisturbEnabled() && isInDoNotDisturbWindow()) return;
    playMessageSound();
  });
};

export { useMessageSound };
