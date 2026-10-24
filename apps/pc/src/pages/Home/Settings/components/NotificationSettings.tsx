import { EyeOutlined, MessageOutlined, MoonOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import {
  getDoNotDisturbRange,
  isDoNotDisturbEnabled,
  isMessageSoundEnabled,
  playMessageSound,
  setDoNotDisturbEnabled,
  setDoNotDisturbRange,
  setMessageSoundEnabled,
  subscribeMessageSoundChange,
} from '@workspace/services';
import { Card, Checkbox, Divider, TimePicker, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import styles from '../Settings.less';

const { Title, Text } = Typography;

/** "HH:mm" -> dayjs(今天, 指定时分)，供 TimePicker 使用 */
const toDayjs = (hhmm: string): Dayjs => {
  const [hour, minute] = hhmm.split(':').map(Number);
  return dayjs().hour(hour).minute(minute).second(0);
};

const NotificationSettings = () => {
  const intl = useIntl();
  // 消息提示音开关(持久化在 client_config: app.message_sound)
  const [soundEnabled, setSoundEnabled] = useState(() =>
    isMessageSoundEnabled(),
  );
  // 免打扰开关与时段(持久化在 client_config: app.do_not_disturb*)
  const [dndEnabled, setDndEnabled] = useState(() => isDoNotDisturbEnabled());
  const [dndRange, setDndRange] = useState(() => getDoNotDisturbRange());

  // 顶栏静音按钮改的也是同一个开关，双向同步
  useEffect(
    () => subscribeMessageSoundChange((enabled) => setSoundEnabled(enabled)),
    [],
  );

  const changeSoundEnabled = (enabled: boolean) => {
    setSoundEnabled(enabled);
    setMessageSoundEnabled(enabled).catch(() => {});
    // 打开时试听一次，方便确认效果
    if (enabled) playMessageSound();
  };

  const changeDndEnabled = (enabled: boolean) => {
    setDndEnabled(enabled);
    setDoNotDisturbEnabled(enabled).catch(() => {});
  };

  const changeDndTime = (which: 'start' | 'end', value: string) => {
    const next = { ...dndRange, [which]: value };
    setDndRange(next);
    setDoNotDisturbRange(next.start, next.end).catch(() => {});
  };

  const renderTimePicker = (which: 'start' | 'end') => (
    <TimePicker
      className={styles.dndTimePicker}
      value={toDayjs(dndRange[which])}
      format="HH:mm"
      minuteStep={5}
      allowClear={false}
      size="small"
      disabled={!dndEnabled}
      onChange={(_, timeString) => {
        const value = Array.isArray(timeString) ? timeString[0] : timeString;
        if (value) changeDndTime(which, value);
      }}
    />
  );

  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.notificationSettings.title' })}
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <MessageOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({
              id: 'settings.notificationSettings.messageNotification',
            })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          {intl.formatMessage({
            id: 'settings.notificationSettings.receiveNewMessage',
          })}
        </Checkbox>
        <Checkbox
          className={styles.settingCheckbox}
          checked={soundEnabled}
          onChange={(e) => changeSoundEnabled(e.target.checked)}
        >
          {intl.formatMessage({
            id: 'settings.notificationSettings.soundReminder',
          })}
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({
            id: 'settings.notificationSettings.messageNotificationDesc',
          })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <EyeOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({
              id: 'settings.notificationSettings.notificationDetails',
            })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          {intl.formatMessage({
            id: 'settings.notificationSettings.showMessagePreview',
          })}
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({
            id: 'settings.notificationSettings.notificationDetailsDesc',
          })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <MoonOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({
              id: 'settings.notificationSettings.doNotDisturb',
            })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox
          className={styles.settingCheckbox}
          checked={dndEnabled}
          onChange={(e) => changeDndEnabled(e.target.checked)}
        >
          {intl.formatMessage({
            id: 'settings.notificationSettings.nightDoNotDisturb',
          })}
        </Checkbox>
        <div className={styles.dndRange}>
          <Text type="secondary">
            {intl.formatMessage({
              id: 'settings.notificationSettings.doNotDisturbRange',
            })}
          </Text>
          {renderTimePicker('start')}
          <span className={styles.dndRangeSep}>–</span>
          {renderTimePicker('end')}
        </div>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({
            id: 'settings.notificationSettings.nightDoNotDisturbDesc',
          })}
        </Text>
      </Card>
    </div>
  );
};

export default NotificationSettings;
