import {
  CloseOutlined,
  NotificationOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import {
  get_announcement_read_users,
  getFiles,
  mark_announcement_read,
} from '@workspace/services';
import { AnnouncementReadUserVO, AnnouncementVO } from '@workspace/types';
import { Avatar, Button, Empty, Modal, Spin } from 'antd';
import { useEffect, useState } from 'react';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { DEFAULT_ICON } from '@/constants';
import { useAnnouncementStore } from '@/store/announcement';
import styles from './index.less';

interface AnnouncementModalProps {
  visible: boolean;
  onClose: () => void;
  announcement: AnnouncementVO | null;
}

interface ReadUserWithAvatar extends AnnouncementReadUserVO {
  avatarUrl?: string;
}

const AnnouncementModal = ({
  visible,
  onClose,
  announcement,
}: AnnouncementModalProps) => {
  const intl = useIntl();
  const ignore = useAnnouncementStore((state) => state.ignore);
  const [readUsers, setReadUsers] = useState<ReadUserWithAvatar[]>([]);
  const [loading, setLoading] = useState(false);

  const loadReadUsers = async (uuid: string) => {
    setLoading(true);
    try {
      const res = await get_announcement_read_users(uuid, 1, 50);
      const list = res.list || [];
      const enriched = await Promise.all(
        list.map(async (u) => {
          let avatarUrl = '';
          if (u.icon) {
            try {
              const fileVos = await getFiles(u.icon);
              avatarUrl = fileVos?.[0]?.tauri_file_path || '';
            } catch {
              avatarUrl = '';
            }
          }
          return { ...u, avatarUrl };
        }),
      );
      setReadUsers(enriched);
    } catch (e) {
      console.log('获取已读用户失败', e);
      setReadUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible || !announcement) return;
    setReadUsers([]);
    // 打开弹窗即标记已读(幂等)
    mark_announcement_read(announcement.uuid).catch(() => {});
    loadReadUsers(announcement.uuid);
  }, [visible, announcement]);

  const handleIgnore = () => {
    if (!announcement) return;
    ignore(announcement.uuid);
    onClose();
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      width={640}
      centered
      footer={null}
      closable={false}
      className={styles.modal}
    >
      {announcement && (
        <div className={styles.wrap}>
          <button className={styles.closeBtn} onClick={onClose}>
            <CloseOutlined />
          </button>

          <div className={styles.header}>
            <div className={styles.headerIcon}>
              <NotificationOutlined />
            </div>
            <div className={styles.headerMeta}>
              <div className={styles.headerTitle}>{announcement.title}</div>
              <div className={styles.headerSub}>
                <span>
                  {intl.formatMessage({ id: 'announcement.readBy' })}
                </span>
                <span className={styles.headerCount}>
                  {announcement.read_count}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.body}>
            <div className={styles.contentCard}>
              <MarkdownRenderer
                content={announcement.content}
                allowHtml={announcement.content_type === 1}
                bare
              />
            </div>

            <div className={styles.readSection}>
              <div className={styles.readHeader}>
                <UserOutlined className={styles.readIcon} />
                <span>
                  {intl.formatMessage({ id: 'announcement.readBy' })}
                </span>
                <span className={styles.readCount}>
                  {announcement.read_count}
                </span>
              </div>

              {loading ? (
                <div className={styles.loading}>
                  <Spin size="small" />
                </div>
              ) : readUsers.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={intl.formatMessage({
                    id: 'announcement.noReadUsers',
                  })}
                />
              ) : (
                <div className={styles.userList}>
                  {readUsers.map((u) => (
                    <div className={styles.userChip} key={u.uuid}>
                      <Avatar
                        size={28}
                        src={u.avatarUrl || DEFAULT_ICON}
                        icon={<UserOutlined />}
                      />
                      <span className={styles.chipName}>
                        {u.username || u.uuid}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.footer}>
            <Button type="text" className={styles.ignoreBtn} onClick={handleIgnore}>
              {intl.formatMessage({ id: 'announcement.ignore' })}
            </Button>
            <Button
              type="primary"
              className={styles.confirmBtn}
              onClick={onClose}
            >
              {intl.formatMessage({ id: 'announcement.gotIt' })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AnnouncementModal;
