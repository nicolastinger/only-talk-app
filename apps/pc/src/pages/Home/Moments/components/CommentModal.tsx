import { get_moment_comments, getFiles, post_moment_comment } from '@workspace/services';
import { MomentCommentVo } from '@workspace/types';
import { DEFAULT_ICON } from '@/constants';
import { useIntl } from '@umijs/max';
import { Avatar, Button, Empty, Input, List, Modal, message } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/CommentModal.less';

const CommentModal = (props: {
  momentUuid: string;
  open: boolean;
  onClose: () => void;
  onCommentCountChange: (delta: number) => void;
}) => {
  const { momentUuid, open, onClose, onCommentCountChange } = props;
  const intl = useIntl();
  const [comments, setComments] = useState<MomentCommentVo[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [avatars, setAvatars] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (open && momentUuid) {
      setCommentText('');
      setComments([]);
      loadComments();
    }
  }, [open, momentUuid]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const res = await get_moment_comments(momentUuid);
      const list = res.list || [];
      setComments(list);
      // 预加载评论者头像
      const record: { [key: string]: string } = {};
      for (const c of list) {
        if (c.icon && !record[c.icon]) {
          const files = await getFiles(c.icon);
          if (files?.[0]?.tauri_file_path) record[c.icon] = files[0].tauri_file_path;
        }
      }
      setAvatars(record);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await post_moment_comment({ moment_uuid: momentUuid, content: trimmed });
      setCommentText('');
      onCommentCountChange(1);
      await loadComments();
    } catch (e) {
      console.error(e);
      message.error(e.message || '评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={intl.formatMessage({ id: 'moments.comments.title' })}
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      className={styles.modal}
    >
      <List
        loading={loading}
        dataSource={comments}
        locale={{ emptyText: <Empty description={intl.formatMessage({ id: 'moments.comments.empty' })} /> }}
        renderItem={(item) => (
          <List.Item key={item.id} className={styles.commentItem}>
            <Avatar
              size={32}
              src={avatars[item.icon || ''] || DEFAULT_ICON}
            />
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
          </List.Item>
        )}
      />
      <div className={styles.inputRow}>
        <Input
          value={commentText}
          maxLength={1000}
          placeholder={intl.formatMessage({ id: 'moments.comments.placeholder' })}
          onChange={(e) => setCommentText(e.target.value)}
          onPressEnter={handleSubmit}
        />
        <Button type="primary" loading={submitting} onClick={handleSubmit}>
          {intl.formatMessage({ id: 'moments.comments.send' })}
        </Button>
      </div>
    </Modal>
  );
};

export default CommentModal;
