import {
  BellOutlined,
  CodeOutlined,
  FolderOutlined,
  InfoCircleOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined,
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
import AuthFactor from './components/AuthFactor';
import BlackList from './components/BlackList';
import DeveloperPanel from './components/DeveloperPanel';
import FileManager from './components/FileManager';
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
      key: 'authFactor',
      icon: <SafetyCertificateOutlined />,
      label: intl.formatMessage({ id: 'settings.authFactor.menu' }),
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
      key: 'files',
      icon: <FolderOutlined />,
      label: intl.formatMessage({ id: 'settings.fileManager.menu' }),
    },
    {
      key: 'about',
      icon: <InfoCircleOutlined />,
      label: intl.formatMessage({ id: 'settings.about' }),
    },
    {
      key: 'developer',
      icon: <CodeOutlined />,
      label: intl.formatMessage({ id: 'settings.developer' }),
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return <AccountPrivacy />;
      case 'authFactor':
        return <AuthFactor />;
      case 'general':
        return <GeneralSettings />;
      case 'notification':
        return <NotificationSettings />;
      case 'plaza':
        return <PlazaSettings />;
      case 'blacklist':
        return <BlackList />;
      case 'files':
        return <FileManager />;
      case 'about':
        return <AboutApp />;
      case 'developer':
        return <DeveloperPanel />;
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
