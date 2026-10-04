import NotificationBell from '@/components/NotificationBell';
import NotificationPanel from '@/components/NotificationPanel';
import CrushList from '@/pages/Home/Plaza/components/CrushList';
import MatchList from '@/pages/Home/Plaza/components/MatchList';
import PlazaList from '@/pages/Home/Plaza/components/PlazaList';
import SwipeDeck from '@/pages/Home/Plaza/components/SwipeDeck';
import { useBearStore } from '@/store/store';
import { SettingOutlined } from '@ant-design/icons';
import { history, useIntl } from '@umijs/max';
import { Tabs } from 'antd';
import { useState } from 'react';
import styles from './index.less';

const PlazaLayout = () => {
  const intl = useIntl();
  const [notifyVisible, setNotifyVisible] = useState(false);
  const menuUnread = useBearStore((state) => state.menuUnread);

  const routeToSettings = () => {
    history.push('/home/settings?tab=plaza');
  };

  const items = [
    {
      key: 'discover',
      label: intl.formatMessage({ id: 'plaza.tabDiscover' }),
      children: <PlazaList />,
    },
    {
      key: 'swipe',
      label: intl.formatMessage({ id: 'plaza.tabSwipe' }),
      children: <SwipeDeck />,
    },
    {
      key: 'crush',
      label: intl.formatMessage({ id: 'plaza.tabCrush' }),
      children: <CrushList />,
    },
    {
      key: 'match',
      label: intl.formatMessage({ id: 'plaza.tabMatch' }),
      children: <MatchList />,
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.title}>
            {intl.formatMessage({ id: 'plaza.title' })}
          </div>
          <div className={styles.subtitle}>
            {intl.formatMessage({ id: 'plaza.subtitle' })}
          </div>
        </div>
        <div className={styles.headerActions}>
          <NotificationBell
            count={menuUnread.plaza}
            onClick={() => setNotifyVisible(true)}
          />
          <button className={styles.manageBtn} onClick={routeToSettings}>
            <SettingOutlined />
            <span>{intl.formatMessage({ id: 'plaza.manage' })}</span>
          </button>
        </div>
      </div>
      <div className={styles.body}>
        <Tabs
          className={styles.tabs}
          defaultActiveKey="discover"
          items={items}
        />
      </div>
      <NotificationPanel
        visible={notifyVisible}
        onClose={() => setNotifyVisible(false)}
        type="plaza"
      />
    </div>
  );
};

export default PlazaLayout;
