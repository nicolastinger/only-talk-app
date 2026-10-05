import { DEFAULT_ICON } from '@/constants';
import { get_friend_list, get_group_list, getFiles } from '@workspace/services';
import { FriendVo, GroupListItemVo } from '@workspace/types';
import { useIntl } from '@umijs/max';
import { Modal, Spin } from 'antd';
import React, { useEffect, useState } from 'react';
import styles from './styles/ForwardModal.less';

export interface ForwardTarget {
  recv: string;
  isGroup: boolean;
  name: string;
}

interface ForwardModalProps {
  open: boolean;
  count: number;
  onCancel: () => void;
  onConfirm: (target: ForwardTarget) => void;
}

const ForwardModal: React.FC<ForwardModalProps> = ({
  open,
  count,
  onCancel,
  onConfirm,
}) => {
  const intl = useIntl();
  const [tab, setTab] = useState<'friend' | 'group'>('friend');
  const [friends, setFriends] = useState<FriendVo[]>([]);
  const [groups, setGroups] = useState<GroupListItemVo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [avatars, setAvatars] = useState<Record<string, string>>({});

  // 好友/群头像存的是 biz_id，需要解析为本地可访问 url
  const resolveAvatars = async (fs: FriendVo[], gs: GroupListItemVo[]) => {
    const targets: { key: string; icon?: string }[] = [
      ...fs.map((f) => ({ key: `f:${f.friend_id}`, icon: f.friend_icon })),
      ...gs.map((g) => ({ key: `g:${g.group_uuid}`, icon: g.avatar })),
    ];
    const entries = await Promise.all(
      targets.map(async ({ key, icon }) => {
        if (!icon) return null;
        try {
          const files = await getFiles(icon);
          const url = files?.[0]?.tauri_file_path || '';
          return url ? ([key, url] as const) : null;
        } catch {
          return null;
        }
      }),
    );
    setAvatars((prev) => {
      const next = { ...prev };
      entries.forEach((entry) => {
        if (entry) next[entry[0]] = entry[1];
      });
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    setSelectedKey('');
    setLoading(true);
    Promise.all([
      get_friend_list().catch(() => [] as FriendVo[]),
      get_group_list().catch(() => [] as GroupListItemVo[]),
    ])
      .then(([f, g]) => {
        const friendList = f || [];
        const groupList = g || [];
        setFriends(friendList);
        setGroups(groupList);
        resolveAvatars(friendList, groupList);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const confirm = () => {
    if (!selectedKey) return;
    const [type, id] = selectedKey.split(':');
    if (type === 'f') {
      const f = friends.find((x) => x.friend_id === id);
      onConfirm({ recv: id, isGroup: false, name: f?.friend_name || id });
    } else {
      const g = groups.find((x) => x.group_uuid === id);
      onConfirm({ recv: id, isGroup: true, name: g?.group_name || id });
    }
  };

  return (
    <Modal
      open={open}
      title={intl.formatMessage({ id: 'chat.forward.title' })}
      okText={`${intl.formatMessage({ id: 'chat.forward.send' })} (${count})`}
      cancelText={intl.formatMessage({ id: 'chat.messageActions.cancel' })}
      okButtonProps={{ disabled: !selectedKey || count === 0 }}
      onOk={confirm}
      onCancel={onCancel}
      destroyOnClose
    >
      <Spin spinning={loading}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'friend' ? styles.active : ''}`}
            onClick={() => setTab('friend')}
          >
            {intl.formatMessage({ id: 'chat.forward.friends' })}
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'group' ? styles.active : ''}`}
            onClick={() => setTab('group')}
          >
            {intl.formatMessage({ id: 'chat.forward.groups' })}
          </button>
        </div>
        <div className={styles.body}>
          {tab === 'friend' ? (
            friends.length > 0 ? (
              <div className={styles.list}>
                {friends.map((f) => {
                  const key = `f:${f.friend_id}`;
                  return (
                    <div
                      key={f.friend_id}
                      className={`${styles.item} ${
                        selectedKey === key ? styles.selected : ''
                      }`}
                      onClick={() => setSelectedKey(key)}
                    >
                      <img
                        src={avatars[`f:${f.friend_id}`] || DEFAULT_ICON}
                        alt=""
                        width={36}
                        height={36}
                        style={{ borderRadius: '50%', objectFit: 'cover' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = DEFAULT_ICON;
                        }}
                      />
                      <span className={styles.name}>{f.friend_name}</span>
                      <span
                        className={`${styles.radio} ${
                          selectedKey === key ? styles.on : ''
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                {intl.formatMessage({ id: 'chat.forward.noFriends' })}
              </div>
            )
          ) : groups.length > 0 ? (
            <div className={styles.list}>
              {groups.map((g) => {
                const key = `g:${g.group_uuid}`;
                return (
                  <div
                    key={g.group_uuid}
                    className={`${styles.item} ${
                      selectedKey === key ? styles.selected : ''
                    }`}
                    onClick={() => setSelectedKey(key)}
                  >
                    <img
                      src={avatars[`g:${g.group_uuid}`] || DEFAULT_ICON}
                      alt=""
                      width={36}
                      height={36}
                      style={{ borderRadius: '50%', objectFit: 'cover' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_ICON;
                      }}
                    />
                    <span className={styles.name}>{g.group_name}</span>
                    <span
                      className={`${styles.radio} ${
                        selectedKey === key ? styles.on : ''
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.empty}>
              {intl.formatMessage({ id: 'chat.forward.noGroups' })}
            </div>
          )}
        </div>
      </Spin>
    </Modal>
  );
};

export default ForwardModal;
