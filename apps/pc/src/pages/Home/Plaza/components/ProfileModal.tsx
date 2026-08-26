import { DEFAULT_ICON } from '@/constants';
import { invoke } from '@tauri-apps/api/core';
import { history, useIntl } from '@umijs/max';
import { add_friend, getFiles } from '@workspace/services';
import { FriendRequestInfoDTO, PlazaUser } from '@workspace/types';
import { Button, message, Modal } from 'antd';
import { useEffect, useState } from 'react';
import { getGenderLabel } from './genderHelper';
import styles from './styles/ProfileModal.less';

const ProfileModal = (props: {
  user: PlazaUser | null;
  onClose: () => void;
  addType?: string;
}) => {
  const { user, onClose, addType } = props;
  const intl = useIntl();
  const [userIcon, setUserIcon] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [requested, setRequested] = useState(false);

  const mapAddFriendError = (result: any): string => {
    let msg = '';
    try {
      const body = JSON.parse(result.res.body);
      if (typeof body.message === 'string') {
        msg = body.message;
      }
    } catch {
      // ignore parse error
    }
    if (msg.includes('Already added as friend')) {
      return 'friendRequest.alreadyFriend';
    }
    if (msg.includes('Please do not add repeatedly')) {
      return 'friendRequest.duplicateRequest';
    }
    return 'friendRequest.sendFailed';
  };

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
        add_type: addType || 'plaza',
        version: 0,
        accept_status: 0,
      };
      const result = await add_friend(dto);
      if (result.netSuccess && result.res.status === 200) {
        setRequested(true);
        message.success(
          intl.formatMessage(
            { id: 'friendRequest.requestSent' },
            { username: user.username },
          ),
        );
      } else {
        message.error(intl.formatMessage({ id: mapAddFriendError(result) }));
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
      width={420}
      className={styles.modal}
    >
      {user && (
        <div className={styles.content}>
          <div className={styles.hero}>
            <img
              className={styles.avatar}
              src={userIcon || DEFAULT_ICON}
              alt="avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_ICON;
              }}
            />
            <div className={styles.name}>{user.username || '-'}</div>
          </div>

          {user.motto && <div className={styles.motto}>{user.motto}</div>}

          {user.info && <div className={styles.bio}>{user.info}</div>}

          <div className={styles.infoSection}>
            <div className={styles.infoItem}>
              <span className={styles.label}>
                {intl.formatMessage({ id: 'plaza.gender' })}
              </span>
              <span className={styles.value}>
                {user.gender !== undefined && user.gender !== null
                  ? getGenderLabel(intl, user.gender)
                  : '-'}
              </span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.label}>
                {intl.formatMessage({ id: 'plaza.age' })}
              </span>
              <span className={styles.value}>{user.age ?? '-'}</span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.label}>
                {intl.formatMessage({ id: 'plaza.address' })}
              </span>
              <span className={styles.value}>{user.address || '-'}</span>
            </div>
          </div>

          {(user.tags || []).length > 0 && (
            <div className={styles.tagsSection}>
              <span className={styles.tagsTitle}>
                {intl.formatMessage({ id: 'plaza.tagsTitle' })}
              </span>
              <div className={styles.tagList}>
                {user.tags!.map((tag) => (
                  <span key={tag} className={styles.tagChip}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

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
              type="primary"
              block
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
        </div>
      )}
    </Modal>
  );
};

export default ProfileModal;
