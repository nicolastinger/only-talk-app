import React from 'react';
import { Card, Checkbox, Divider, Typography } from 'antd';
import { MessageOutlined, EyeOutlined, MoonOutlined } from '@ant-design/icons';
import styles from '../Settings.less';

const { Title, Text } = Typography;

const NotificationSettings = () => {
  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>通知设置</Title>
      
      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <MessageOutlined className={styles.cardIcon} />
          <Text strong>消息通知</Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          接收新消息通知
        </Checkbox>
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          声音提醒
        </Checkbox>
        <Checkbox className={styles.settingCheckbox}>
          震动提醒
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          控制是否接收消息通知及提醒方式
        </Text>
      </Card>
      
      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <EyeOutlined className={styles.cardIcon} />
          <Text strong>通知详情</Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          在通知中显示消息预览
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          关闭后通知将只显示"您有新消息"
        </Text>
      </Card>
      
      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <MoonOutlined className={styles.cardIcon} />
          <Text strong>免打扰</Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox className={styles.settingCheckbox}>
          夜间免打扰
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          开启后将在指定时间段内静音通知
        </Text>
      </Card>
    </div>
  );
};

export default NotificationSettings;