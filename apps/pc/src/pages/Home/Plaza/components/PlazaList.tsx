import { useBearStore } from '@/store/store';
import { history, useIntl } from '@umijs/max';
import { get_plaza_users } from '@workspace/services';
import { PlazaUser } from '@workspace/types';
import { Button } from 'antd';
import { useEffect, useState } from 'react';
import PlazaCard from './PlazaCard';
import ProfileModal from './ProfileModal';
import styles from './styles/PlazaList.less';

const PlazaList = () => {
  const intl = useIntl();
  const [users, setUsers] = useState<PlazaUser[]>([]);
  const [selected, setSelected] = useState<PlazaUser | null>(null);
  const refreshFlag = useBearStore((state) => state.refreshFlag);

  useEffect(() => {
    getPlazaUsers();
  }, []);

  useEffect(() => {
    if (refreshFlag > 0) {
      getPlazaUsers();
    }
  }, [refreshFlag]);

  const getPlazaUsers = async () => {
    try {
      const result = await get_plaza_users();
      setUsers(result.list || []);
    } catch (error) {
      console.error(error);
    }
  };

  const routeToSettings = () => {
    history.push('/home/settings?tab=plaza');
  };

  return (
    <>
      {users.length > 0 ? (
        <div className={styles.grid}>
          {users.map((user) => (
            <PlazaCard
              key={user.uuid}
              user={user}
              onClick={() => setSelected(user)}
            />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyText}>
            {intl.formatMessage({ id: 'plaza.empty' })}
          </div>
          <Button type="primary" onClick={routeToSettings}>
            {intl.formatMessage({ id: 'plaza.emptyAction' })}
          </Button>
        </div>
      )}
      <ProfileModal user={selected} onClose={() => setSelected(null)} />
    </>
  );
};

export default PlazaList;
