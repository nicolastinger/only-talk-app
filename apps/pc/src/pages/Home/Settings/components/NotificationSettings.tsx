import { EyeOutlined, MessageOutlined, MoonOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import {
  isDoNotDisturbEnabled,
  isMessageSoundEnabled,
  playMessageSound,
  setDoNotDisturbEnabled,
  setMessageSoundEnabled,
} from '@workspace/services';
import { Card, Checkbox, Divider, Typography } from 'antd';
import { useState } from 'react';
import styles from '../Settings.less';

const { Title, Text } = Typography;

const NotificationSettings = () => {
  const intl = useIntl();
  // 消息提示音开关(持久化在 client_config: app.message_sound)
  const [soundEnabled, setSoundEnabled] = useState(() =>
    isMessageSoundEnabled(),
  );
  // 夜间免打扰(持久化在 client_config: app.do_not_disturb)
  const [dndEnabled, setDndEnabled] = useState(() => isDoNotDisturbEnabled());

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
        <Checkbox className={styles.settingCheckbox}>
          {intl.formatMessage({
            id: 'settings.notificationSettings.vibrationReminder',
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
