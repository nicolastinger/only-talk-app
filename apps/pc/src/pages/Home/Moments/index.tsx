import { PictureOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Tabs } from 'antd';
import { useState } from 'react';
import MomentComposer from './components/MomentComposer';
import MomentList from './components/MomentList';
import styles from './index.less';

const Moments = () => {
  const intl = useIntl();
  const [composerOpen, setComposerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState('plaza');

  const handlePublished = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.title}>
            {intl.formatMessage({ id: 'moments.title' })}
          </div>
          <div className={styles.subtitle}>
            {intl.formatMessage({ id: 'moments.subtitle' })}
          </div>
        </div>
        <button className={styles.publishBtn} onClick={() => setComposerOpen(true)}>
          <PictureOutlined />
          <span>{intl.formatMessage({ id: 'moments.publish' })}</span>
        </button>
      </div>
      <div className={styles.tabs}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'plaza',
              label: intl.formatMessage({ id: 'moments.tabs.plaza' }),
            },
            {
              key: 'following',
              label: intl.formatMessage({ id: 'moments.tabs.following' }),
            },
            {
              key: 'mine',
              label: intl.formatMessage({ id: 'moments.tabs.mine' }),
            },
          ]}
        />
      </div>
      <div className={styles.body}>
        <MomentList
          refreshKey={refreshKey}
          feed={tab}
          key={tab}
        />
      </div>
      <MomentComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSuccess={handlePublished}
      />
    </div>
  );
};

export default Moments;
