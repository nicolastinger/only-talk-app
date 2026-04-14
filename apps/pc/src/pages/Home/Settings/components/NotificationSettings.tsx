import { EyeOutlined, MessageOutlined, MoonOutlined } from '@ant-design/icons';
import { Card, Checkbox, Divider, Typography } from 'antd';
import { useIntl } from '@umijs/max';
import styles from '../Settings.less';

const { Title, Text } = Typography;

const NotificationSettings = () => {
  const intl = useIntl();
  
  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.notificationSettings.title' })}
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <MessageOutlined className={styles.cardIcon} />
          <Text strong>{intl.formatMessage({ id: 'settings.notificationSettings.messageNotification' })}</Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          {intl.formatMessage({ id: 'settings.notificationSettings.receiveNewMessage' })}
        </Checkbox>
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          {intl.formatMessage({ id: 'settings.notificationSettings.soundReminder' })}
        </Checkbox>
        <Checkbox className={styles.settingCheckbox}>{intl.formatMessage({ id: 'settings.notificationSettings.vibrationReminder' })}</Checkbox>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.notificationSettings.messageNotificationDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <EyeOutlined className={styles.cardIcon} />
          <Text strong>{intl.formatMessage({ id: 'settings.notificationSettings.notificationDetails' })}</Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          {intl.formatMessage({ id: 'settings.notificationSettings.showMessagePreview' })}
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.notificationSettings.notificationDetailsDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <MoonOutlined className={styles.cardIcon} />
          <Text strong>{intl.formatMessage({ id: 'settings.notificationSettings.doNotDisturb' })}</Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox className={styles.settingCheckbox}>{intl.formatMessage({ id: 'settings.notificationSettings.nightDoNotDisturb' })}</Checkbox>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.notificationSettings.doNotDisturbDesc' })}
        </Text>
      </Card>
    </div>
  );
};

export default NotificationSettings;
