import { openNewWindow } from '@/components/Window/OpenWindow';
import { useBearStore } from '@/store/store';
import { LockOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { WebviewOptions } from '@tauri-apps/api/webview';
import { Window, WindowOptions } from '@tauri-apps/api/window';
import { history, useIntl } from '@umijs/max';
import { Button, Card, Checkbox, Divider, Typography, message } from 'antd';
import styles from '../Settings.less';

const { Title, Text } = Typography;

const AccountPrivacy = () => {
  const intl = useIntl();
  const setIsLogin = useBearStore((state) => state.setIsLogin);
  const setUserInfo = useBearStore((state) => state.setUserInfo);

  const handleLogout = async () => {
    try {
      const res = await invoke('logout');
      console.log('登出结果:', res);

      setIsLogin(false);
      setUserInfo({ uuid: '' });

      await invoke('clear_user_info');

      history.push('/signIn');

      const webviewOptions: WebviewOptions = {
        x: 0,
        y: 0,
        url: `/signIn`,
        height: 480,
        width: 380,
      };
      const config: WindowOptions = {
        title: 'Only Talk',
        resizable: true,
        fullscreen: false,
        decorations: false,
        center: true,
      };

      const configs: WebviewOptions | WindowOptions = {
        ...config,
        ...webviewOptions,
      };
      let currentWindow = Window.getCurrent();
      await openNewWindow('main', configs, currentWindow);
    } catch (error) {
      console.error('登出失败:', error);
      message.error(
        intl.formatMessage({ id: 'settings.accountPrivacy.logoutFailed' }),
      );
    }
  };

  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.accountPrivacy.title' })}
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <UserOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.accountPrivacy.accountInfo' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <div className={styles.accountInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.accountPrivacy.loginAccount' })}
          </Text>
          <Text className={styles.accountValue}>user@example.com</Text>
        </div>
        <div className={styles.accountInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.accountPrivacy.phoneNumber' })}
          </Text>
          <Text className={styles.accountValue}>138****1234</Text>
        </div>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <UserOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({
              id: 'settings.accountPrivacy.privacySettings',
            })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          {intl.formatMessage({
            id: 'settings.accountPrivacy.allowSearchByPhone',
          })}
        </Checkbox>
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          {intl.formatMessage({ id: 'settings.accountPrivacy.allowRecommend' })}
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.accountPrivacy.privacyDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <LockOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({
              id: 'settings.accountPrivacy.securitySettings',
            })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Button type="primary">
          {intl.formatMessage({ id: 'settings.accountPrivacy.changePassword' })}
        </Button>
        <Button
          type="primary"
          danger
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          style={{ marginTop: '10px' }}
        >
          {intl.formatMessage({ id: 'settings.accountPrivacy.logout' })}
        </Button>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.accountPrivacy.securityDesc' })}
        </Text>
      </Card>
    </div>
  );
};

export default AccountPrivacy;
