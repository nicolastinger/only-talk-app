import {
  BellOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Layout, Menu } from 'antd';
import { useState } from 'react';
import styles from './Settings.less';
import AboutApp from './components/AboutApp';
import AccountPrivacy from './components/AccountPrivacy';
import GeneralSettings from './components/GeneralSettings';
import NotificationSettings from './components/NotificationSettings';

const { Sider, Content } = Layout;

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('account');

  const menuItems = [
    {
      key: 'account',
      icon: <UserOutlined />,
      label: '账号与隐私',
    },
    {
      key: 'general',
      icon: <SettingOutlined />,
      label: '通用设置',
    },
    {
      key: 'notification',
      icon: <BellOutlined />,
      label: '通知设置',
    },
    {
      key: 'about',
      icon: <InfoCircleOutlined />,
      label: '关于应用',
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return <AccountPrivacy />;
      case 'general':
        return <GeneralSettings />;
      case 'notification':
        return <NotificationSettings />;
      case 'about':
        return <AboutApp />;
      default:
        return <AccountPrivacy />;
    }
  };

  return (
    <Layout className={styles.settingsContainer}>
      <Sider width={250} className={styles.settingsSidebar}>
        <div className={styles.sidebarTitle}>设置</div>
        <Menu
          mode="inline"
          selectedKeys={[activeTab]}
          items={menuItems}
          onClick={({ key }) => setActiveTab(key)}
          className={styles.menu}
        />
      </Sider>
      <Content className={styles.settingsContent}>{renderContent()}</Content>
    </Layout>
  );
};

export default SettingsPage;
