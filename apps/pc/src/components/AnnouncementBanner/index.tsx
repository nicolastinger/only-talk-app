import AnnouncementModal from '@/components/AnnouncementModal';
import { useAnnouncementStore } from '@/store/announcement';
import { formatMessageTime } from '@/utils/format';
import { useIntl } from '@umijs/max';
import { get_announcement_list } from '@workspace/services';
import { AnnouncementVO } from '@workspace/types';
import { Popover, Spin, Tooltip } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './index.less';

/** 与移动端公告中心保持一致的铃铛图标，内联 SVG 便于跟随主题换色 */
const BellIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);

const AnnouncementBanner = () => {
  const intl = useIntl();
  const ignored = useAnnouncementStore((state) => state.ignored);
  const [list, setList] = useState<AnnouncementVO[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<AnnouncementVO | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchList = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await get_announcement_list(1, 20);
      setList(res.list || []);
    } catch (e) {
      console.log('获取公告列表失败', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList().catch(() => {});
  }, [fetchList]);

  // 过滤掉没有标题且没有内容的空公告，以及已忽略的公告
  const visibleList = useMemo(
    () =>
      list.filter(
        (item) => (item.title || item.content) && !ignored.includes(item.uuid),
      ),
    [list, ignored],
  );

  // 未读数与移动端一致: 可见公告中服务端标记为未读的数量
  const unreadCount = useMemo(
    () => visibleList.filter((item) => !item.is_read).length,
    [visibleList],
  );

  const openDetail = (item: AnnouncementVO) => {
    // 乐观置为已读，保证角标与列表状态即时一致(服务端由弹窗内上报)
    setList((prev) =>
      prev.map((it) => (it.uuid === item.uuid ? { ...it, is_read: true } : it)),
    );
    setActive({ ...item, is_read: true });
    setOpen(false);
    setModalVisible(true);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // 打开面板时静默刷新，同步其它端已读状态与新公告
    if (next) fetchList(true).catch(() => {});
  };

  if (visibleList.length === 0) return null;

  const title = intl.formatMessage({ id: 'announcement.banner' });
  const panelTitle = intl.formatMessage({ id: 'chats.announcements' });
  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  const panel = (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>
          <BellIcon className={styles.headerIcon} />
          {panelTitle}
        </span>
        {unreadCount > 0 && (
          <span className={styles.unreadTag}>
            {unreadCount}{' '}
            {intl.formatMessage({ id: 'notification.unreadCount' })}
          </span>
        )}
      </div>
      {loading ? (
        <div className={styles.center}>
          <Spin size="small" />
        </div>
      ) : (
        <div className={styles.list}>
          {visibleList.map((item) => (
            <div
              key={item.uuid}
              className={`${styles.item} ${item.is_read ? styles.read : ''}`}
              onClick={() => openDetail(item)}
            >
              <span
                className={`${styles.dot} ${
                  item.is_read ? '' : styles.dotUnread
                }`}
              />
              <div className={styles.itemMain}>
                <div className={styles.itemTitle}>
                  {item.title || panelTitle}
                </div>
                <div className={styles.itemTime}>
                  {formatMessageTime(item.created_at * 1000)}
                </div>
              </div>
              <svg
                className={styles.arrow}
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
              </svg>
            </div>
          ))}
        </div>
      )}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.confirmBtn}
          onClick={() => setOpen(false)}
        >
          {intl.formatMessage({ id: 'announcement.gotIt' })}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Popover
        open={open}
        onOpenChange={handleOpenChange}
        trigger={['click']}
        placement="bottomRight"
        arrow={false}
        classNames={{ root: styles.popover }}
        content={panel}
      >
        <div className={styles.banner}>
          <Tooltip title={title} placement="bottom">
            <div
              className={styles.trigger}
              role="button"
              tabIndex={0}
              aria-label={title}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpenChange(!open);
                }
              }}
            >
              <BellIcon className={styles.icon} />
              {unreadCount > 0 && (
                <span className={styles.badge}>{badgeText}</span>
              )}
            </div>
          </Tooltip>
        </div>
      </Popover>
      <AnnouncementModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        announcement={active}
      />
    </>
  );
};

export default AnnouncementBanner;
