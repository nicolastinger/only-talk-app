import PlazaList from '@/pages/Home/Plaza/components/PlazaList';
import { SettingOutlined } from '@ant-design/icons';
import { history, useIntl } from '@umijs/max';
import styles from './index.less';

const PlazaLayout = () => {
  const intl = useIntl();

  const routeToSettings = () => {
    history.push('/home/settings?tab=plaza');
  };

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
        <button className={styles.manageBtn} onClick={routeToSettings}>
          <SettingOutlined />
          <span>{intl.formatMessage({ id: 'plaza.manage' })}</span>
        </button>
      </div>
      <div className={styles.body}>
        <PlazaList />
      </div>
    </div>
  );
};

export default PlazaLayout;
