import {
  InfoCircleOutlined,
  MessageOutlined,
  QuestionCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Button, Card, Divider, Typography } from 'antd';
import styles from '../Settings.less';

const { Title, Text } = Typography;

const AboutApp = () => {
  const intl = useIntl();

  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.aboutApp.title' })}
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <InfoCircleOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.aboutApp.appInfo' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <div className={styles.appInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.aboutApp.appName' })}
          </Text>
          <Text>Only Talk</Text>
        </div>
        <div className={styles.appInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.aboutApp.version' })}
          </Text>
          <Text>v1.0.0</Text>
        </div>
        <div className={styles.appInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.aboutApp.developer' })}
          </Text>
          <Text>UMI Team</Text>
        </div>
        <div className={styles.appInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.aboutApp.copyright' })}
          </Text>
          <Text>© 2023 Only Talk. All rights reserved.</Text>
        </div>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <SyncOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.aboutApp.checkUpdate' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Button type="primary" icon={<SyncOutlined />}>
          {intl.formatMessage({ id: 'settings.aboutApp.checkNewVersion' })}
        </Button>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.aboutApp.latestVersion' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <QuestionCircleOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.aboutApp.feedbackHelp' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <div className={styles.buttonGroup}>
          <Button icon={<MessageOutlined />}>
            {intl.formatMessage({ id: 'settings.aboutApp.feedback' })}
          </Button>
          <Button
            icon={<QuestionCircleOutlined />}
            style={{ marginLeft: '10px' }}
          >
            {intl.formatMessage({ id: 'settings.aboutApp.helpDoc' })}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default AboutApp;
