import { getFiles, switch_moment_like } from '@workspace/services';
import { MomentVo } from '@workspace/types';
import { DEFAULT_ICON } from '@/constants';
import { useIntl } from '@umijs/max';
import { message } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/MomentCard.less';

const MomentCard = (props: {
  moment: MomentVo;
  onOpenComments: (moment: MomentVo) => void;
}) => {
  const { moment, onOpenComments } = props;
  const intl = useIntl();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [likeCount, setLikeCount] = useState(moment.like_count);
  const [liked, setLiked] = useState(moment.liked_by_me);
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (moment.icon) {
        const files = await getFiles(moment.icon);
        setAvatar(files?.[0]?.tauri_file_path || null);
      }
      // 仅在明确 0 图时跳过; undefined(旧后端)也尝试拉取, 保证图片展示
      if (moment.image_count == null || moment.image_count > 0) {
        const imgFiles = await getFiles(moment.uuid);
        setImages((imgFiles || []).map((f) => f.tauri_file_path || '').filter(Boolean));
      }
    };
    load();
  }, [moment.icon, moment.uuid]);

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    try {
      await switch_moment_like({ moment_uuid: moment.uuid });
      setLiked((prev) => !prev);
      setLikeCount((prev) => (liked ? Math.max(0, prev - 1) : prev + 1));
    } catch (e) {
      console.error(e);
      message.error(e.message || '操作失败');
    } finally {
      setLiking(false);
    }
  };

  const handleComment = () => {
    onOpenComments(moment);
  };

  return (
    <div className={styles.card}>
      <div className={styles.author}>
        <img
          src={avatar || DEFAULT_ICON}
          className={styles.avatar}
          alt="avatar"
          onError={(e) => {
            (e.target as HTMLImageElement).src = DEFAULT_ICON;
          }}
        />
        <div className={styles.authorInfo}>
          <div className={styles.username}>{moment.username || '用户'}</div>
          <div className={styles.time}>
            {new Date(moment.created_at * 1000).toLocaleString('zh-CN')}
          </div>
        </div>
      </div>

      {moment.content && <div className={styles.content}>{moment.content}</div>}

      {images.length > 0 && (
        <div className={styles.imageGrid}>
          {images.map((img, i) => (
            <img key={i} src={img} className={styles.image} alt="" />
          ))}
        </div>
      )}

      <div className={styles.actions}>
        <button
          className={`${styles.actionBtn} ${liked ? styles.active : ''}`}
          onClick={handleLike}
        >
          {liked ? '♥' : '♡'} {likeCount}
        </button>
        <button className={styles.actionBtn} onClick={handleComment}>
          💬 {moment.comment_count}
        </button>
      </div>
    </div>
  );
};

export default MomentCard;
