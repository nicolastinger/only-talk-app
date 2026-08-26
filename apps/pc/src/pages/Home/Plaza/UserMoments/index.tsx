import { DEFAULT_ICON } from '@/constants';
import MomentList from '@/pages/Home/Moments/components/MomentList';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { history, useIntl, useLocation } from '@umijs/max';
import { getFiles, get_plaza_user } from '@workspace/services';
import { PlazaUser } from '@workspace/types';
import { useEffect, useState } from 'react';
import styles from './index.less';

const UserMoments = () => {
  const intl = useIntl();
  const location = useLocation();
  const uuid = location.pathname.split('/').pop() || '';
  const [user, setUser] = useState<PlazaUser | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const u = await get_plaza_user(uuid);
        setUser(u);
        if (u.icon) {
          const files = await getFiles(u.icon);
          setAvatar(files?.[0]?.tauri_file_path || null);
        }
      } catch (error) {
        console.error(error);
      }
    };
    load();
  }, [uuid]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => history.back()}>
          <ArrowLeftOutlined />
        </button>
        <img
          className={styles.avatar}
          src={avatar || DEFAULT_ICON}
          alt="avatar"
          onError={(e) => {
            (e.target as HTMLImageElement).src = DEFAULT_ICON;
          }}
        />
        <div className={styles.headerInfo}>
          <div className={styles.name}>
            {user?.username ||
              intl.formatMessage({ id: 'plaza.userMomentsTitle' })}
          </div>
          <div className={styles.subtitle}>
            {intl.formatMessage({ id: 'plaza.userMomentsSubtitle' })}
          </div>
        </div>
      </div>
      <MomentList
        refreshKey={0}
        authorUuid={uuid}
        emptyText={intl.formatMessage({ id: 'plaza.momentsEmpty' })}
      />
    </div>
  );
};

export default UserMoments;
