import { DEFAULT_ICON } from '@/constants';
import { HeartFilled } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { history, useIntl } from '@umijs/max';
import { add_friend, getFiles } from '@workspace/services';
import { FriendRequestInfoDTO, PlazaUser } from '@workspace/types';
import { Button, message, Modal } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/MatchModal.less';

const MatchModal = (props: { user: PlazaUser | null; onClose: () => void }) => {
  const { user, onClose } = props;
  const intl = useIntl();
  const [userIcon, setUserIcon] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [requested, setRequested] = useState(false);

  const getUserIcon = async (icon: string) => {
    try {
      if (!icon) {
        setUserIcon(null);
        return;
      }
      const FileVos = await getFiles(icon);
      setUserIcon(FileVos?.[0]?.tauri_file_path || null);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    if (user) {
      getUserIcon(user.icon || '');
      setRequested(false);
      setSending(false);
    } else {
      setUserIcon(null);
    }
  }, [user]);

  const viewMoments = () => {
    if (!user) return;
    history.push(`/home/plaza/user/${user.uuid}`);
  };

  const addFriend = async () => {
    if (!user) return;
    setSending(true);
    try {
      const me = (await invoke('get_user_map', { key: 'uuid' })) as string;
      const dto: FriendRequestInfoDTO = {
        request_message: intl.formatMessage({
          id: 'friendRequest.defaultRequestMessage',
        }),
        accept_message: '',
        request_user: me,
        accept_user: user.uuid,
        add_type: 'plaza_match',
        version: 0,
        accept_status: 0,
      };
      const result = await add_friend(dto);
      if (result.netSuccess && result.res.status === 200) {
        setRequested(true);
        message.success(
          intl.formatMessage({ id: 'friendRequest.requestSent' }),
        );
      } else {
        message.error(intl.formatMessage({ id: 'friendRequest.sendError' }));
      }
    } catch (error) {
      console.error('添加好友失败', error);
      message.error(intl.formatMessage({ id: 'friendRequest.sendError' }));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={!!user}
      onCancel={onClose}
      footer={null}
      centered
      width={380}
      className={styles.modal}
    >
      {user && (
        <div className={styles.content}>
          <div className={styles.badge}>
            <HeartFilled />
          </div>
          <div className={styles.subtitle}>
            {intl.formatMessage({ id: 'plaza.matchTitle' })}
          </div>
          <img
            className={styles.avatar}
            src={userIcon || DEFAULT_ICON}
            alt="avatar"
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_ICON;
            }}
          />
          <div className={styles.name}>{user.username || '-'}</div>
          <div className={styles.actions}>
            <Button
              block
              size="large"
              className={styles.viewBtn}
              onClick={viewMoments}
            >
              {intl.formatMessage({ id: 'plaza.viewMoments' })}
            </Button>
            <Button
              block
              type="primary"
              size="large"
              loading={sending}
              disabled={requested}
              onClick={addFriend}
              className={styles.friendBtn}
            >
              {requested
                ? intl.formatMessage({ id: 'plaza.requested' })
                : intl.formatMessage({ id: 'plaza.addFriend' })}
            </Button>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            {intl.formatMessage({ id: 'plaza.continue' })}
          </button>
        </div>
      )}
    </Modal>
  );
};

export default MatchModal;
