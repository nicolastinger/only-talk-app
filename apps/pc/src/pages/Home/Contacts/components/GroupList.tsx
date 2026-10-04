import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { history, useIntl, useLocation } from '@umijs/max';
import { get_group_list, getFiles } from '@workspace/services';
import { GroupListItemVo } from '@workspace/types';
import { message } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/GroupList.less';

const GroupList = () => {
  const intl = useIntl();
  const [groups, setGroups] = useState<GroupListItemVo[]>([]);
  const refreshFlag = useBearStore((state) => state.refreshFlag);
  const location = useLocation();

  const selectedGroupId =
    new URLSearchParams(location.search).get('groupId') || '';

  useEffect(() => {
    getGroupList();
  }, []);

  useEffect(() => {
    if (refreshFlag > 0) {
      getGroupList();
    }
  }, [refreshFlag]);

  const getGroupList = async () => {
    try {
      const groupList = await get_group_list();
      console.log('群组列表', groupList);
      setGroups(groupList || []);
    } catch (error) {
      console.error('获取群组列表失败', error);
      message.error(
        intl.formatMessage({ id: 'contacts.groupList.fetchError' }),
      );
    }
  };

  const routeToGroupInfo = (groupId: string) => {
    history.push('/home/contacts/group?groupId=' + groupId);
  };

  return (
    <div className={styles.container}>
      <div className={styles.listContent}>
        {groups.length > 0
          ? groups.map((group) => (
              <GroupBox
                key={group.group_uuid}
                group={group}
                isSelected={selectedGroupId === group.group_uuid}
                onClick={() => routeToGroupInfo(group.group_uuid)}
              />
            ))
          : null}
      </div>
    </div>
  );
};

interface GroupBoxProps {
  group: GroupListItemVo;
  isSelected?: boolean;
  onClick: () => void;
}

const GroupBox = ({ group, isSelected, onClick }: GroupBoxProps) => {
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
    <div
      className={`${styles.groupBox} ${isSelected ? styles.selected : ''}`}
      onClick={onClick}
    >
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
        <div className={styles.centerText}>
          {group.member_count}{' '}
          {intl.formatMessage({ id: 'contacts.groupList.members' })}
        </div>
      </div>
    </div>
  );
};

export default GroupList;
