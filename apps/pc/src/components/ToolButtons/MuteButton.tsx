import { SoundOutlined, StopOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import {
  isMessageSoundEnabled,
  playMessageSound,
  setMessageSoundEnabled,
  subscribeMessageSoundChange,
} from '@workspace/services';
import { Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import styles from './MuteButton.less';

/**
 * 顶栏静音按钮：切换消息提示音(app.message_sound)。
 *
 * 与「设置 → 通知 → 声音提醒」共用同一份配置，任一处修改都会同步另一边；
 * 从静音恢复时试听一次，方便确认效果。
 */
const MuteButton = () => {
  const intl = useIntl();
  const [muted, setMuted] = useState(() => !isMessageSoundEnabled());

  useEffect(
    () => subscribeMessageSoundChange((enabled) => setMuted(!enabled)),
    [],
  );

  const toggleMute = () => {
    // 当前静音 → 恢复提示音；当前开启 → 静音
    const nextEnabled = muted;
    setMessageSoundEnabled(nextEnabled)
      .then(() => {
        if (nextEnabled) playMessageSound();
      })
      .catch(() => {});
  };

  const tooltip = intl.formatMessage({
    id: muted ? 'homeLayout.unmuteSound' : 'homeLayout.muteSound',
  });

  return (
    <Tooltip title={tooltip} placement="bottom">
      <div
        className={`${styles.muteButton} ${muted ? styles.muted : ''}`}
        onClick={toggleMute}
      >
        {muted ? <StopOutlined /> : <SoundOutlined />}
      </div>
    </Tooltip>
  );
};

export default MuteButton;
