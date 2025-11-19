import React from 'react';
import { Card, Button, Checkbox, Divider, Typography } from 'antd';
import { LockOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import styles from '../Settings.less';

const { Title, Text } = Typography;

const AccountPrivacy = () => {
  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>账号与隐私</Title>
      
      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <UserOutlined className={styles.cardIcon} />
          <Text strong>账号信息</Text>
        </div>
        <Divider className={styles.divider} />
        <div className={styles.accountInfo}>
          <Text type="secondary">登录账号</Text>
          <Text className={styles.accountValue}>user@example.com</Text>
        </div>
        <div className={styles.accountInfo}>
          <Text type="secondary">手机号码</Text>
          <Text className={styles.accountValue}>138****1234</Text>
        </div>
      </Card>
      
      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <UserOutlined className={styles.cardIcon} />
          <Text strong>隐私设置</Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          允许通过手机号搜索到我
        </Checkbox>
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          允许推荐给通讯录朋友
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          控制谁可以看到您的个人信息
        </Text>
      </Card>
      
      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <LockOutlined className={styles.cardIcon} />
          <Text strong>安全设置</Text>
        </div>
        <Divider className={styles.divider} />
        <Button type="primary">修改密码</Button>
        <Text type="secondary" className={styles.description}>
          定期更改密码以保护账号安全
        </Text>
      </Card>
    </div>
  );
};

export default AccountPrivacy;