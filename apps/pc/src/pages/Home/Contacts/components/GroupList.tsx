import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { history } from '@umijs/max';
import { getFiles } from '@workspace/services';
import { get_group_list } from '@workspace/services';
import { GroupVo } from '@workspace/types';
import { Badge, message } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/GroupList.less';

const GroupList = () => {
  const [groups, setGroups] = useState<GroupVo[]>([]);
  const refreshFlag = useBearStore((state) => state.refreshFlag);

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
      message.error('获取群组列表失败');
    }
  };

  const routeToGroupInfo = (groupId: string) => {
    history.push('/home/contacts/group?groupId=' + groupId);
  };

  return (
    <div className={styles.container}>
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
  );
};

interface GroupBoxProps {
  group: GroupVo;
  onClick: () => void;
}

const GroupBox = ({ group, onClick }: GroupBoxProps) => {
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
        <div className={styles.centerText}>{group.member_count} 成员</div>
      </div>
    </div>
  );
};

export default GroupList;
