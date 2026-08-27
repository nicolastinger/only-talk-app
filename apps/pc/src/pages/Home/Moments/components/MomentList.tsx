import { get_moment_list } from '@workspace/services';
import { MomentVo } from '@workspace/types';
import { history, useIntl } from '@umijs/max';
import { Spin } from 'antd';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import CommentModal from './CommentModal';
import MomentCard from './MomentCard';
import styles from './styles/MomentList.less';

const PAGE_SIZE = 10;
const GAP = 16;

const resolveColumns = (width: number) =>
  width < 560 ? 1 : width < 860 ? 2 : width < 1200 ? 3 : 4;

const MomentList = (props: {
  refreshKey: number;
  authorUuid?: string;
  feed?: string;
  emptyText?: string;
}) => {
  const { refreshKey, authorUuid, feed, emptyText } = props;
  const intl = useIntl();
  const [moments, setMoments] = useState<MomentVo[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MomentVo | null>(null);

  const masonryRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const loadingRef = useRef(false);

  const measure = useCallback(() => {
    const node = masonryRef.current;
    if (!node) return;
    const width = node.clientWidth;
    if (!width) return;
    const count = resolveColumns(width);
    const colWidth = Math.max(120, Math.floor((width - GAP * (count - 1)) / count));
    const colTops = new Array<number>(count).fill(0);
    moments.forEach((m) => {
      const el = cardEls.current.get(m.uuid);
      if (!el) return;
      el.style.width = `${colWidth}px`;
      const h = el.offsetHeight;
      let c = 0;
      for (let k = 1; k < count; k++) {
        if (colTops[k] < colTops[c]) c = k;
      }
      el.style.transform = `translate(${c * (colWidth + GAP)}px, ${colTops[c]}px)`;
      colTops[c] += h + GAP;
    });
    node.style.height = `${Math.max(0, colTops.reduce((a, b) => Math.max(a, b), 0) - GAP)}px`;
  }, [moments]);

  const measureRef = useRef(measure);
  measureRef.current = measure;
  const measureTimer = useRef<number | null>(null);

  const scheduleMeasure = useCallback(() => {
    if (measureTimer.current !== null) window.clearTimeout(measureTimer.current);
    measureTimer.current = window.setTimeout(() => {
      measureTimer.current = null;
      measureRef.current();
    }, 60);
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const node = masonryRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(node);
    return () => ro.disconnect();
  }, [scheduleMeasure]);

  useEffect(() => {
    setPage(1);
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, authorUuid, feed]);

  const load = async (p: number, reset: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await get_moment_list(p, PAGE_SIZE, { authorUuid, feed });
      setTotal(res.total);
      setMoments((prev) => (reset ? res.list : [...prev, ...res.list]));
      setPage(p);
    } catch (e) {
      console.error(e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = moments.length < total;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current) {
          load(page + 1, false);
        }
      },
      { rootMargin: '0px 0px 250px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, page]);

  const handleCommentCountChange = (momentUuid: string, delta: number) => {
    setMoments((prev) =>
      prev.map((m) =>
        m.uuid === momentUuid
          ? { ...m, comment_count: Math.max(0, m.comment_count + delta) }
          : m,
      ),
    );
  };

  const defaultEmpty =
    feed === 'following'
      ? intl.formatMessage({ id: 'moments.emptyFollowing' })
      : feed === 'mine'
        ? intl.formatMessage({ id: 'moments.emptyMine' })
        : intl.formatMessage({ id: 'moments.empty' });

  return (
    <div className={styles.list}>
      {loading && moments.length === 0 ? (
        <div className={styles.loading}>
          <Spin />
        </div>
      ) : moments.length === 0 ? (
        <div className={styles.empty}>{emptyText || defaultEmpty}</div>
      ) : (
        <>
          <div className={styles.masonry} ref={masonryRef}>
            {moments.map((m) => (
              <div
                key={m.uuid}
                className={styles.item}
                ref={(el) => {
                  if (el) cardEls.current.set(m.uuid, el);
                  else cardEls.current.delete(m.uuid);
                }}
              >
                <MomentCard
                  moment={m}
                  onOpenComments={(moment) => setSelected(moment)}
                  onOpenDetail={(moment) => history.push('/home/moments/' + moment.uuid)}
                  onMediaLoad={scheduleMeasure}
                  onDeleted={(moment) => {
                    setMoments((prev) => prev.filter((mm) => mm.uuid !== moment.uuid));
                    requestAnimationFrame(scheduleMeasure);
                  }}
                />
              </div>
            ))}
          </div>
          <div ref={sentinelRef} className={styles.sentinel} />
          {loading && (
            <div className={styles.loadMore}>
              <Spin size="small" />
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
