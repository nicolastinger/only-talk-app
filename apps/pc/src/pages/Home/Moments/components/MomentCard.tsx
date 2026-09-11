import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import ReportModal from '@/components/ReportModal';
import { useIntl } from '@umijs/max';
import {
  delete_moment,
  getFiles,
  switch_moment_like,
  switch_user_follow,
} from '@workspace/services';
import { MomentVo, ReportTargetType } from '@workspace/types';
import { message, Modal } from 'antd';
import { useEffect, useState, type CSSProperties } from 'react';
import MomentMedia from './MomentMedia';
import styles from './styles/MomentCard.less';

const MomentCard = (props: {
  moment: MomentVo;
  index?: number;
  onOpenComments: (moment: MomentVo) => void;
  onOpenDetail?: (moment: MomentVo) => void;
  onOpenUser?: (moment: MomentVo) => void;
  onMediaLoad?: () => void;
  onDeleted?: (moment: MomentVo) => void;
}) => {
  const {
    moment,
    index,
    onOpenComments,
    onOpenDetail,
    onOpenUser,
    onMediaLoad,
    onDeleted,
  } = props;
  const intl = useIntl();
  const myUuid = useBearStore((state) => state.userInfo.uuid);
  const isMine = !!myUuid && myUuid === moment.author_uuid;
  const [avatar, setAvatar] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [likeCount, setLikeCount] = useState(moment.like_count);
  const [liked, setLiked] = useState(moment.liked_by_me);
  const [liking, setLiking] = useState(false);
  const [isFollowing, setIsFollowing] = useState(!!moment.followed_by_me);
  const [following, setFollowing] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (moment.icon) {
        const files = await getFiles(moment.icon);
        setAvatar(files?.[0]?.tauri_file_path || null);
      }
      // 仅在明确 0 图时跳过; undefined(旧后端)也尝试拉取, 保证图片展示
      if (moment.image_count == null || moment.image_count > 0) {
        const imgFiles = await getFiles(moment.uuid);
        setImages(
          (imgFiles || []).map((f) => f.tauri_file_path || '').filter(Boolean),
        );
      }
    };
    load();
  }, [moment.icon, moment.uuid]);

  const handleOpenUser = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenUser?.(moment);
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (liking) return;
    setLiking(true);
    try {
      await switch_moment_like({ moment_uuid: moment.uuid });
      setLiked((prev) => !prev);
      setLikeCount((prev) => (liked ? Math.max(0, prev - 1) : prev + 1));
    } catch (e) {
      console.error(e);
      message.error((e as Error).message || '操作失败');
    } finally {
      setLiking(false);
    }
  };

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (following || isMine) return;
    setFollowing(true);
    const prev = isFollowing;
    setIsFollowing((v) => !v);
    try {
      await switch_user_follow({ target_user_uuid: moment.author_uuid });
    } catch (e) {
      console.error(e);
      setIsFollowing(prev);
      message.error((e as Error).message || '操作失败');
    } finally {
      setFollowing(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDeleted) return;
    Modal.confirm({
      title: intl.formatMessage({ id: 'moments.delete' }),
      content: intl.formatMessage({ id: 'moments.deleteConfirm' }),
      okText: intl.formatMessage({ id: 'moments.delete' }),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await delete_moment({ moment_uuid: moment.uuid });
          message.success(intl.formatMessage({ id: 'moments.deleteSuccess' }));
          onDeleted(moment);
        } catch (err) {
          message.error((err as Error).message || '操作失败');
        }
      },
    });
  };

  return (
    <div
      className={styles.card}
      style={{ '--seq': (index ?? 0) * 40 } as CSSProperties}
      onClick={() => onOpenDetail?.(moment)}
      role="button"
      tabIndex={0}
    >
      <MomentMedia images={images} onMediaLoad={onMediaLoad} />

      {moment.content && <div className={styles.content}>{moment.content}</div>}

      <div className={styles.footer}>
        <div className={styles.userRow}>
          <img
            src={avatar || DEFAULT_ICON}
            className={styles.avatar}
            alt="avatar"
            onClick={handleOpenUser}
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_ICON;
            }}
          />
          <div className={styles.userMeta}>
            <div className={styles.usernameRow}>
              <span className={styles.username} onClick={handleOpenUser}>
                {moment.username || '用户'}
              </span>
              {isMine && (
                <span className={styles.mineBadge}>
                  {intl.formatMessage({ id: 'moments.mine' })}
                </span>
              )}
            </div>
            <div className={styles.time}>
              {new Date(moment.created_at * 1000).toLocaleString('zh-CN')}
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          {!isMine && (
            <button
              className={`${styles.followBtn} ${
                isFollowing ? styles.followed : ''
              }`}
              disabled={following}
              onClick={handleFollow}
            >
              {isFollowing
                ? intl.formatMessage({ id: 'moments.following' })
                : intl.formatMessage({ id: 'moments.follow' })}
            </button>
          )}
          {isMine && onDeleted && (
            <button className={styles.deleteBtn} onClick={handleDelete}>
              {intl.formatMessage({ id: 'moments.delete' })}
            </button>
          )}
          <button
            className={`${styles.actionBtn} ${liked ? styles.active : ''}`}
            onClick={handleLike}
          >
            {liked ? '♥' : '♡'} {likeCount}
          </button>
          <button
            className={styles.actionBtn}
            onClick={(e) => {
              e.stopPropagation();
              onOpenComments(moment);
            }}
          >
            💬 {moment.comment_count}
          </button>
          {!isMine && (
            <button
              className={styles.actionBtn}
              onClick={(e) => {
                e.stopPropagation();
                setReportModalVisible(true);
              }}
            >
              {intl.formatMessage({ id: 'report.action' })}
            </button>
          )}
        </div>
      </div>

      <ReportModal
        open={reportModalVisible}
        targetType={ReportTargetType.MOMENT}
        targetUuid={moment.uuid}
        targetName={moment.username || ''}
        onClose={() => setReportModalVisible(false)}
      />
    </div>
  );
};

export default MomentCard;
