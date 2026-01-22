import { openNewWindow } from '@/components/Window/OpenWindow';
import { useBearStore } from '@/store/store';
import { LockOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { WebviewOptions } from '@tauri-apps/api/webview';
import { Window, WindowOptions } from '@tauri-apps/api/window';
import { history } from '@umijs/max';
import { Button, Card, Checkbox, Divider, Typography, message } from 'antd';
import styles from '../Settings.less';

const { Title, Text } = Typography;

const AccountPrivacy = () => {
  const setIsLogin = useBearStore((state) => state.setIsLogin);
  const setUserInfo = useBearStore((state) => state.setUserInfo);

  const handleLogout = async () => {
    try {
      // 调用后端登出接口
      const res = await invoke('logout');
      console.log('登出结果:', res);

      // 重置前端状态
      setIsLogin(false);
      setUserInfo({ uuid: ''});

      // 清除全局用户信息
      await invoke('clear_user_info');

      // 跳转到登录页面
      history.push('/signIn');

      const webviewOptions: WebviewOptions = {
        x: 0,
        y: 0,
        url: `/signIn`,
        height: 480,
        width: 380,
      };
      const config: WindowOptions = {
        title: '歪比巴卜',
        resizable: true,
        fullscreen: false,
        decorations: false,
        center: true,
      };

      const configs: WebviewOptions | WindowOptions = {
        ...config,
        ...webviewOptions,
      };
      // 重新打开登录窗口
      let currentWindow = Window.getCurrent();
      await openNewWindow('main', configs, currentWindow);
    } catch (error) {
      console.error('登出失败:', error);
      message.error('登出失败');
    }
  };

  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        账号与隐私
      </Title>

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
        <Button
          type="primary"
          danger
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          style={{ marginTop: '10px' }}
        >
          退出登录
        </Button>
        <Text type="secondary" className={styles.description}>
          定期更改密码以保护账号安全
        </Text>
      </Card>
    </div>
  );
};

export default AccountPrivacy;
