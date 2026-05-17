import {
  BellOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Layout, Menu } from 'antd';
import { useState } from 'react';
import styles from './Settings.less';
import AboutApp from './components/AboutApp';
import AccountPrivacy from './components/AccountPrivacy';
import GeneralSettings from './components/GeneralSettings';
import NotificationSettings from './components/NotificationSettings';

const { Sider, Content } = Layout;

const SettingsPage = () => {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState('account');

  const menuItems = [
    {
      key: 'account',
      icon: <UserOutlined />,
      label: intl.formatMessage({ id: 'settings.account' }),
    },
    {
      key: 'general',
      icon: <SettingOutlined />,
      label: intl.formatMessage({ id: 'settings.general' }),
    },
    {
      key: 'notification',
      icon: <BellOutlined />,
      label: intl.formatMessage({ id: 'settings.notification' }),
    },
    {
      key: 'about',
      icon: <InfoCircleOutlined />,
      label: intl.formatMessage({ id: 'settings.about' }),
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
        <div className={styles.sidebarTitle}>
          {intl.formatMessage({ id: 'settings.title' })}
        </div>
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
