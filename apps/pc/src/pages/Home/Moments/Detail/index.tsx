import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { history, useIntl, useLocation } from '@umijs/max';
import {
  delete_moment,
  getFiles,
  get_moment_detail,
  switch_moment_like,
  switch_user_follow,
} from '@workspace/services';
import { MomentVo } from '@workspace/types';
import { Empty, Modal, Spin, message } from 'antd';
import { useEffect, useState } from 'react';
import CommentSection from '../components/CommentSection';
import LikersModal from '../components/LikersModal';
import MomentMedia from '../components/MomentMedia';
import styles from './index.less';

const MomentDetail = () => {
  const intl = useIntl();
  const location = useLocation();
  const momentUuid = location.pathname.split('/').pop() || '';
  const myUuid = useBearStore((state) => state.userInfo.uuid);

  const [moment, setMoment] = useState<MomentVo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [liking, setLiking] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [following, setFollowing] = useState(false);
  const [likersOpen, setLikersOpen] = useState(false);

  useEffect(() => {
    if (!momentUuid) return;
    let mounted = true;
    setError(null);
    setMoment(null);
    const load = async () => {
      try {
        const m = await get_moment_detail(momentUuid);
        if (!mounted) return;
        setMoment(m);
        setLikeCount(m.like_count);
        setLiked(m.liked_by_me);
        setCommentCount(m.comment_count);
        setIsFollowing(!!m.followed_by_me);
        if (m.icon) {
          const files = await getFiles(m.icon);
          if (mounted) setAvatar(files?.[0]?.tauri_file_path || null);
        }
        if (m.image_count == null || m.image_count > 0) {
          const imgFiles = await getFiles(momentUuid);
          if (mounted) {
            setImages(
              (imgFiles || [])
                .map((f) => f.tauri_file_path || '')
                .filter(Boolean),
            );
          }
        }
      } catch (e) {
        console.error(e);
        if (mounted) setError((e as Error).message || '加载失败');
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [momentUuid]);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (liking) return;
    setLiking(true);
    try {
      await switch_moment_like({ moment_uuid: momentUuid });
      setLiked((prev) => !prev);
      setLikeCount((prev) => (liked ? Math.max(0, prev - 1) : prev + 1));
    } catch (e) {
      console.error(e);
      message.error((e as Error).message || '操作失败');
    } finally {
      setLiking(false);
    }
  };

  const handleFollow = async () => {
    if (following || isMine) return;
    setFollowing(true);
    const prev = isFollowing;
    setIsFollowing((v) => !v);
    try {
      await switch_user_follow({ target_user_uuid: moment!.author_uuid });
    } catch (e) {
      console.error(e);
      setIsFollowing(prev);
      message.error((e as Error).message || '操作失败');
    } finally {
      setFollowing(false);
    }
  };

  const handleCommentJump = () => {
    const el = document.getElementById('moment-comments');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDelete = () => {
    if (!moment) return;
    Modal.confirm({
      title: intl.formatMessage({ id: 'moments.delete' }),
      content: intl.formatMessage({ id: 'moments.deleteConfirm' }),
      okText: intl.formatMessage({ id: 'moments.delete' }),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await delete_moment({ moment_uuid: moment.uuid });
          message.success(intl.formatMessage({ id: 'moments.deleteSuccess' }));
          history.back();
        } catch (err) {
          message.error((err as Error).message || '操作失败');
        }
      },
    });
  };

  const isMine = !!myUuid && moment?.author_uuid === myUuid;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => history.back()}>
          <ArrowLeftOutlined />
        </button>
        <span className={styles.headerTitle}>
          {intl.formatMessage({ id: 'moments.detail.title' })}
        </span>
      </div>

      {error ? (
        <div className={styles.state}>
          <Empty description={error} />
        </div>
      ) : !moment ? (
        <div className={styles.state}>
          <Spin />
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.authorRow}>
            <img
              src={avatar || DEFAULT_ICON}
              className={styles.avatar}
              alt="avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_ICON;
              }}
            />
            <div className={styles.authorMeta}>
              <div className={styles.usernameRow}>
                <span className={styles.username}>
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
            {isMine && (
              <button className={styles.deleteBtn} onClick={handleDelete}>
                {intl.formatMessage({ id: 'moments.delete' })}
              </button>
            )}
          </div>

          {images.length > 0 && <MomentMedia images={images} />}

          {moment.content && (
            <div className={styles.content}>{moment.content}</div>
          )}

          <div className={styles.actions}>
            <button
              className={`${styles.actionBtn} ${liked ? styles.active : ''}`}
              onClick={handleLike}
            >
              {liked ? '♥' : '♡'}{' '}
              <span
                className={styles.likeCount}
                onClick={(e) => {
                  e.stopPropagation();
                  setLikersOpen(true);
                }}
              >
                {likeCount}
              </span>
            </button>
            <button className={styles.actionBtn} onClick={handleCommentJump}>
              💬 {commentCount}
            </button>
          </div>

          <div id="moment-comments">
            <CommentSection
              momentUuid={moment.uuid}
              onCountChange={(delta) =>
                setCommentCount((prev) => Math.max(0, prev + delta))
              }
            />
          </div>
        </div>
      )}

      <LikersModal
        momentUuid={momentUuid}
        open={likersOpen}
        onClose={() => setLikersOpen(false)}
      />
    </div>
  );
};

export default MomentDetail;
