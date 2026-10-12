import { useBearStore } from '@/store/store';
import { history, useIntl } from '@umijs/max';
import { get_plaza_users } from '@workspace/services';
import { PlazaUser } from '@workspace/types';
import { Button, Spin } from 'antd';
import { useEffect, useState } from 'react';
import MatchModal from './MatchModal';
import PlazaCard from './PlazaCard';
import PlazaFilter, { PlazaFilterState } from './PlazaFilter';
import ProfileModal from './ProfileModal';
import styles from './styles/PlazaList.less';

const PAGE_SIZE = 20;

const PlazaList = () => {
  const intl = useIntl();
  const [users, setUsers] = useState<PlazaUser[]>([]);
  const [selected, setSelected] = useState<PlazaUser | null>(null);
  const [matched, setMatched] = useState<PlazaUser | null>(null);
  const refreshFlag = useBearStore((state) => state.refreshFlag);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<PlazaFilterState>({});

  const load = async (p: number, reset: boolean) => {
    setLoading(true);
    try {
      const result = await get_plaza_users(p, PAGE_SIZE, filter);
      setTotal(result.total || 0);
      setUsers((prev) =>
        reset ? result.list || [] : [...prev, ...(result.list || [])],
      );
      setPage(p);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (refreshFlag > 0) {
      load(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshFlag]);

  const loadMore = () => load(page + 1, false);
  const hasMore = users.length < total;

  const handleTagClick = (tag: string) =>
    setFilter((prev) => ({ ...prev, tag }));

  const routeToSettings = () => {
    history.push('/home/settings?tab=plaza');
  };

  return (
    <>
      <PlazaFilter value={filter} onChange={setFilter} />
      {loading && users.length === 0 ? (
        <div className={styles.loading}>
          <Spin />
        </div>
      ) : users.length > 0 ? (
        <>
          <div className={styles.grid}>
            {users.map((user) => (
              <PlazaCard
                key={user.uuid}
                user={user}
                onClick={() => setSelected(user)}
                onTagClick={handleTagClick}
                onMatched={setMatched}
              />
            ))}
          </div>
          {hasMore && (
            <div className={styles.loadMore}>
              <Button loading={loading} onClick={loadMore}>
                {intl.formatMessage({ id: 'plaza.loadMore' })}
              </Button>
            </div>
          )}
        </>
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
      <MatchModal user={matched} onClose={() => setMatched(null)} />
    </>
  );
};

export default PlazaList;
