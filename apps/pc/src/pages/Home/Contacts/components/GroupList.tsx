import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { history, useIntl } from '@umijs/max';
import { getFiles, getUnreadNotificationCounts } from '@workspace/services';
import { get_group_list } from '@workspace/services';
import { GroupVo } from '@workspace/types';
import { Badge, message } from 'antd';
import { PlusOutlined, MailOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import CreateGroupModal from './CreateGroupModal';
import InvitationManager from './InvitationManager';
import styles from './styles/GroupList.less';

const GroupList = () => {
  const intl = useIntl();
  const [groups, setGroups] = useState<GroupVo[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [invitationVisible, setInvitationVisible] = useState(false);
  const [groupInvitationUnread, setGroupInvitationUnread] = useState(0);
  const refreshFlag = useBearStore((state) => state.refreshFlag);

  useEffect(() => {
    getGroupList();
    fetchGroupInvitationUnread();
  }, []);

  useEffect(() => {
    if (refreshFlag > 0) {
      getGroupList();
      fetchGroupInvitationUnread();
    }
  }, [refreshFlag]);

  useEffect(() => {
    if (!invitationVisible) {
      fetchGroupInvitationUnread();
    }
  }, [invitationVisible]);

  const fetchGroupInvitationUnread = async () => {
    try {
      const counts = await getUnreadNotificationCounts();
      setGroupInvitationUnread(counts.groups || 0);
    } catch (e) {
      console.log('获取群邀请未读数失败', e);
    }
  };

  const getGroupList = async () => {
    try {
      const groupList = await get_group_list();
      console.log('群组列表', groupList);
      setGroups(groupList || []);
    } catch (error) {
      console.error('获取群组列表失败', error);
      message.error(intl.formatMessage({ id: 'contacts.groupList.fetchError' }));
    }
  };

  const routeToGroupInfo = (groupId: string) => {
    history.push('/home/contacts/group?groupId=' + groupId);
  };

  const handleCreateSuccess = async (group: GroupVo) => {
    setCreateModalVisible(false);
    await getGroupList();
  };

  return (
    <div className={styles.container}>
      <div className={styles.listContent}>
        {groups.length > 0
          ? groups.map((group) => (
              <GroupBox
                key={group.group_uuid}
                group={group}
                onClick={() => routeToGroupInfo(group.group_uuid)}
              />
            ))
          : null}
      </div>
      <div className={styles.bottomBar}>
        <Badge count={groupInvitationUnread} size="small" offset={[-4, 2]}>
          <div
            className={styles.invitationBtn}
            onClick={() => setInvitationVisible(true)}
          >
            <MailOutlined />
            <span>{intl.formatMessage({ id: 'contacts.groupList.invitationManage' })}</span>
          </div>
        </Badge>
        <div
          className={styles.createBtn}
          onClick={() => setCreateModalVisible(true)}
        >
          <PlusOutlined />
          <span>{intl.formatMessage({ id: 'contacts.groupList.createGroup' })}</span>
        </div>
      </div>
      <CreateGroupModal
        visible={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onSuccess={handleCreateSuccess}
      />
      <InvitationManager
        visible={invitationVisible}
        onCancel={() => setInvitationVisible(false)}
      />
    </div>
  );
};

interface GroupBoxProps {
  group: GroupVo;
  onClick: () => void;
}

const GroupBox = ({ group, onClick }: GroupBoxProps) => {
  const intl = useIntl();
  const [groupIcon, setGroupIcon] = useState<string | null>(null);

  const getGroupIcon = async (icon: string) => {
    try {
      const FileVos = await getFiles(icon);
      setGroupIcon(FileVos?.[0]?.tauri_file_path || null);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    if (group.avatar) {
      getGroupIcon(group.avatar);
    }
  }, [group.avatar]);

  return (
    <div className={styles.groupBox} onClick={onClick}>
      <div className={styles.left}>
        <Badge>
          <img
            src={groupIcon || DEFAULT_ICON}
            className={styles.imgItem}
            alt="avatar"
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_ICON;
            }}
          />
        </Badge>
      </div>
      <div className={styles.center}>
        <div className={styles.centerTitle}>{group.group_name}</div>
        <div className={styles.centerText}>{group.member_count} {intl.formatMessage({ id: 'contacts.groupList.members' })}</div>
      </div>
    </div>
  );
};

export default GroupList;
