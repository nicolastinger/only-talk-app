import {
  InfoCircleOutlined,
  MessageOutlined,
  QuestionCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Button, Card, Divider, Typography } from 'antd';
import styles from '../Settings.less';

const { Title, Text } = Typography;

const AboutApp = () => {
  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        关于应用
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <InfoCircleOutlined className={styles.cardIcon} />
          <Text strong>应用信息</Text>
        </div>
        <Divider className={styles.divider} />
        <div className={styles.appInfo}>
          <Text type="secondary">应用名称</Text>
          <Text>UMI Chat</Text>
        </div>
        <div className={styles.appInfo}>
          <Text type="secondary">版本号</Text>
          <Text>v1.0.0</Text>
        </div>
        <div className={styles.appInfo}>
          <Text type="secondary">开发者</Text>
          <Text>UMI Team</Text>
        </div>
        <div className={styles.appInfo}>
          <Text type="secondary">版权信息</Text>
          <Text>© 2023 UMI Chat. All rights reserved.</Text>
        </div>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <SyncOutlined className={styles.cardIcon} />
          <Text strong>检查更新</Text>
        </div>
        <Divider className={styles.divider} />
        <Button type="primary" icon={<SyncOutlined />}>
          检查新版本
        </Button>
        <Text type="secondary" className={styles.description}>
          当前已是最新版本
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <QuestionCircleOutlined className={styles.cardIcon} />
          <Text strong>反馈与帮助</Text>
        </div>
        <Divider className={styles.divider} />
        <div className={styles.buttonGroup}>
          <Button icon={<MessageOutlined />}>意见反馈</Button>
          <Button
            icon={<QuestionCircleOutlined />}
            style={{ marginLeft: '10px' }}
          >
            帮助文档
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default AboutApp;
