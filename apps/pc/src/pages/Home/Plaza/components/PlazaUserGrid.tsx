import { useIntl } from '@umijs/max';
import { PlazaListResult, PlazaUser } from '@workspace/types';
import { Button, Spin } from 'antd';
import { useEffect, useState } from 'react';
import PlazaCard from './PlazaCard';
import ProfileModal from './ProfileModal';
import styles from './styles/PlazaList.less';

const PAGE_SIZE = 20;

const PlazaUserGrid = (props: {
  fetch: (page: number, pageSize: number) => Promise<PlazaListResult>;
  addType?: string;
  emptyText: string;
}) => {
  const { fetch, addType, emptyText } = props;
  const intl = useIntl();
  const [users, setUsers] = useState<PlazaUser[]>([]);
  const [selected, setSelected] = useState<PlazaUser | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = async (p: number, reset: boolean) => {
    setLoading(true);
    try {
      const result = await fetch(p, PAGE_SIZE);
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
  }, []);

  const loadMore = () => load(page + 1, false);
  const hasMore = users.length < total;

  return (
    <>
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
                showCrush={false}
                onClick={() => setSelected(user)}
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
        <div className={styles.empty}>{emptyText}</div>
      )}
      <ProfileModal
        user={selected}
        onClose={() => setSelected(null)}
        addType={addType}
      />
    </>
  );
};

export default PlazaUserGrid;
