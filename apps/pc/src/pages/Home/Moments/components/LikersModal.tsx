import { get_moment_likers, getFiles } from '@workspace/services';
import { MomentLikerVo } from '@workspace/types';
import { DEFAULT_ICON } from '@/constants';
import { useIntl } from '@umijs/max';
import { Avatar, Empty, Modal, Spin } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/LikersModal.less';

const PAGE_SIZE = 20;

const LikersModal = (props: {
  momentUuid: string;
  open: boolean;
  onClose: () => void;
}) => {
  const { momentUuid, open, onClose } = props;
  const intl = useIntl();
  const [likers, setLikers] = useState<MomentLikerVo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [avatars, setAvatars] = useState<{ [key: string]: string }>({});

  const load = async (p: number, reset: boolean) => {
    setLoading(true);
    try {
      const res = await get_moment_likers(momentUuid, p, PAGE_SIZE);
      setTotal(res.total);
      setLikers((prev) => (reset ? res.list : [...prev, ...res.list]));
      setPage(p);
      if (reset) {
        const record: { [key: string]: string } = {};
        for (const l of res.list) {
          if (l.icon && !record[l.icon]) {
            const files = await getFiles(l.icon);
            if (files?.[0]?.tauri_file_path) record[l.icon] = files[0].tauri_file_path;
          }
        }
        setAvatars(record);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && momentUuid) {
      setLikers([]);
      load(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, momentUuid]);

  const hasMore = likers.length < total;

  return (
    <Modal
      title={intl.formatMessage({ id: 'moments.likers.title' })}
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      className={styles.modal}
    >
      {loading && likers.length === 0 ? (
        <div className={styles.loading}>
          <Spin />
        </div>
      ) : likers.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={intl.formatMessage({ id: 'moments.likers.empty' })}
        />
      ) : (
        <div className={styles.list}>
          {likers.map((l) => (
            <div key={l.uuid} className={styles.item}>
              <Avatar size={36} src={avatars[l.icon || ''] || DEFAULT_ICON} />
              <div className={styles.meta}>
                <span className={styles.name}>{l.username || l.uuid}</span>
                <span className={styles.time}>
                  {new Date(l.created_at * 1000).toLocaleString('zh-CN')}
                </span>
              </div>
            </div>
          ))}
          {hasMore && (
            <button className={styles.loadMore} onClick={() => load(page + 1, false)}>
              {intl.formatMessage({ id: 'moments.loadMore' })}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
};

export default LikersModal;
