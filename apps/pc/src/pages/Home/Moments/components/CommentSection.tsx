import { get_moment_comments, getFiles, post_moment_comment } from '@workspace/services';
import { MomentCommentVo } from '@workspace/types';
import { DEFAULT_ICON } from '@/constants';
import { useIntl } from '@umijs/max';
import { Avatar, Button, Empty, Input, List, Spin, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import styles from './styles/CommentSection.less';

const PAGE_SIZE = 10;

const CommentSection = (props: {
  momentUuid: string;
  onCountChange?: (delta: number) => void;
}) => {
  const { momentUuid, onCountChange } = props;
  const intl = useIntl();
  const [comments, setComments] = useState<MomentCommentVo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState('');
  const [avatars, setAvatars] = useState<{ [key: string]: string }>({});
  const loadingRef = useRef(false);

  const loadComments = async (p: number, reset: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    reset ? setLoading(true) : setLoadingMore(true);
    try {
      const res = await get_moment_comments(momentUuid, p, PAGE_SIZE);
      setTotal(res.total);
      setComments((prev) => (reset ? res.list : [...prev, ...res.list]));
      setPage(p);
      if (reset) {
        const record: { [key: string]: string } = {};
        for (const c of res.list) {
          if (c.icon && !record[c.icon]) {
            const files = await getFiles(c.icon);
            if (files?.[0]?.tauri_file_path) record[c.icon] = files[0].tauri_file_path;
          }
        }
        setAvatars(record);
      }
    } catch (e) {
      console.error(e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (momentUuid) {
      setText('');
      setComments([]);
      loadComments(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentUuid]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await post_moment_comment({ moment_uuid: momentUuid, content: trimmed });
      setText('');
      onCountChange?.(1);
      await loadComments(1, true);
    } catch (e) {
      console.error(e);
      message.error(e.message || '评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  const hasMore = comments.length < total;

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        {intl.formatMessage({ id: 'moments.comments.title' })}
      </div>
      {comments.length === 0 && !loading ? (
        <div className={styles.empty}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={intl.formatMessage({ id: 'moments.comments.empty' })}
          />
        </div>
      ) : (
        <div className={styles.list}>
          {comments.map((item) => (
            <div key={item.id} className={styles.commentItem}>
              <Avatar size={32} src={avatars[item.icon || ''] || DEFAULT_ICON} />
              <div className={styles.commentBody}>
                <div className={styles.commentMeta}>
                  <span className={styles.name}>
                    {item.username || item.author_uuid}
                  </span>
                  <span className={styles.time}>
                    {new Date(item.created_at * 1000).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div className={styles.commentText}>{item.content}</div>
              </div>
            </div>
          ))}
          {loading ? (
            <div className={styles.loading}>
              <Spin size="small" />
            </div>
          ) : hasMore ? (
            <button className={styles.loadMore} onClick={() => loadComments(page + 1, false)}>
              {intl.formatMessage({ id: 'moments.loadMore' })}
            </button>
          ) : null}
        </div>
      )}
      <div className={styles.inputRow}>
        <Input
          value={text}
          maxLength={1000}
          placeholder={intl.formatMessage({ id: 'moments.comments.placeholder' })}
          onChange={(e) => setText(e.target.value)}
          onPressEnter={handleSubmit}
        />
        <Button type="primary" loading={submitting} onClick={handleSubmit}>
          {intl.formatMessage({ id: 'moments.comments.send' })}
        </Button>
      </div>
    </div>
  );
};

export default CommentSection;
