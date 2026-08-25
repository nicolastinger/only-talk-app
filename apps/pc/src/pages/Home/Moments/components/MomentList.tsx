import { get_moment_list } from '@workspace/services';
import { MomentVo } from '@workspace/types';
import { Button, Spin } from 'antd';
import { useEffect, useState } from 'react';
import CommentModal from './CommentModal';
import MomentCard from './MomentCard';
import styles from './styles/MomentList.less';

const PAGE_SIZE = 10;

const MomentList = (props: { refreshKey: number }) => {
  const { refreshKey } = props;
  const [moments, setMoments] = useState<MomentVo[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MomentVo | null>(null);

  useEffect(() => {
    setPage(1);
    load(1, true);
  }, [refreshKey]);

  const load = async (p: number, reset: boolean) => {
    setLoading(true);
    try {
      const res = await get_moment_list(p, PAGE_SIZE);
      setTotal(res.total);
      setMoments((prev) => (reset ? res.list : [...prev, ...res.list]));
      setPage(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => load(page + 1, false);

  const handleCommentCountChange = (momentUuid: string, delta: number) => {
    setMoments((prev) =>
      prev.map((m) =>
        m.uuid === momentUuid
          ? { ...m, comment_count: Math.max(0, m.comment_count + delta) }
          : m
      )
    );
  };

  const hasMore = moments.length < total;

  return (
    <div className={styles.list}>
      {loading && moments.length === 0 ? (
        <div className={styles.loading}>
          <Spin />
        </div>
      ) : moments.length === 0 ? (
        <div className={styles.empty}>暂无动态，点击右上角发布吧</div>
      ) : (
        <>
          {moments.map((m) => (
            <MomentCard
              key={m.uuid}
              moment={m}
              onOpenComments={(moment) => setSelected(moment)}
            />
          ))}
          {hasMore && (
            <div className={styles.loadMore}>
              <Button loading={loading} onClick={loadMore}>
                加载更多
              </Button>
            </div>
          )}
        </>
      )}
      <CommentModal
        momentUuid={selected?.uuid || ''}
        open={!!selected}
        onClose={() => setSelected(null)}
        onCommentCountChange={(delta) =>
          selected && handleCommentCountChange(selected.uuid, delta)
        }
      />
    </div>
  );
};

export default MomentList;
