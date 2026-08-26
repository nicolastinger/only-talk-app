import {
  BellOutlined,
  InfoCircleOutlined,
  RadarChartOutlined,
  SettingOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useIntl, useLocation } from '@umijs/max';
import { Layout, Menu } from 'antd';
import { useEffect, useState } from 'react';
import styles from './Settings.less';
import AboutApp from './components/AboutApp';
import AccountPrivacy from './components/AccountPrivacy';
import BlackList from './components/BlackList';
import GeneralSettings from './components/GeneralSettings';
import NotificationSettings from './components/NotificationSettings';
import PlazaSettings from './components/PlazaSettings';

const { Sider, Content } = Layout;

const SettingsPage = () => {
  const intl = useIntl();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const queryTab = params.get('tab');
  const [activeTab, setActiveTab] = useState(queryTab || 'account');

  useEffect(() => {
    if (queryTab) {
      setActiveTab(queryTab);
    }
  }, [queryTab]);

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
      key: 'plaza',
      icon: <RadarChartOutlined />,
      label: intl.formatMessage({ id: 'settings.plaza' }),
    },
    {
      key: 'blacklist',
      icon: <StopOutlined />,
      label: intl.formatMessage({ id: 'settings.blacklistMenu' }),
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
      case 'plaza':
        return <PlazaSettings />;
      case 'blacklist':
        return <BlackList />;
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
