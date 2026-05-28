import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { history, useSearchParams } from '@umijs/max';
import { get_group_info, get_group_members, getFiles, create_group_chat_session } from '@workspace/services';
import { GroupVo, GroupMemberVo } from '@workspace/types';
import { Avatar, Button, Collapse, List, message, Spin } from 'antd';
import { UserOutlined, TeamOutlined, MessageOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import styles from './styles/GroupInfo.less';

const GroupInfoPage = () => {
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId') || '';
  const { userInfo } = useBearStore();

  const [groupInfo, setGroupInfo] = useState<GroupVo | null>(null);
  const [members, setMembers] = useState<GroupMemberVo[]>([]);
  const [groupIcon, setGroupIcon] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (groupId) {
      loadGroupInfo();
      loadMembers();
    }
  }, [groupId]);

  const loadGroupInfo = async () => {
    setLoading(true);
    try {
      const info = await get_group_info(groupId);
      setGroupInfo(info);
      if (info.avatar) {
        const files = await getFiles(info.avatar);
        setGroupIcon(files?.[0]?.tauri_file_path || '');
      }
    } catch (error) {
      console.error('获取群组信息失败', error);
      message.error('获取群组信息失败');
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    try {
      const memberList = await get_group_members(groupId);
      setMembers(memberList || []);
    } catch (error) {
      console.error('获取群成员失败', error);
    }
  };

  const routeToChat = async () => {
    try {
      await create_group_chat_session(groupId);
      history.push('/home/chats/group-chat?groupId=' + groupId);
    } catch (err) {
      console.log(err);
      message.error('创建会话失败');
    }
  };

  const isOwner = groupInfo?.owner_uuid === userInfo?.uuid;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN');
  };

  const getRoleName = (role: number) => {
    switch (role) {
      case 2:
        return '群主';
      case 1:
        return '管理员';
      default:
        return '成员';
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <img
            className={styles.icon}
            src={groupIcon || DEFAULT_ICON}
            alt="group avatar"
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_ICON;
            }}
          />
          <div className={styles.name}>{groupInfo?.group_name || '群组'}</div>
          <div className={styles.memberCount}>
            <TeamOutlined style={{ marginRight: 6 }} />
            {groupInfo?.member_count || 0} 成员
          </div>
        </div>

        <div className={styles.infoSection}>
          <div className={styles.infoItem}>
            <span className={styles.label}>群 ID</span>
            <span className={styles.value}>{groupInfo?.group_uuid || '-'}</span>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.label}>创建时间</span>
            <span className={styles.value}>
              {groupInfo?.created_at ? formatDate(groupInfo.created_at) : '-'}
            </span>
          </div>

          <Collapse
            className={styles.collapse}
            ghost
            items={[
              {
                key: 'members',
                label: `群成员 (${members.length})`,
                children: (
                  <List
                    dataSource={members}
                    renderItem={(member) => (
                      <List.Item className={styles.memberItem}>
                        <div className={styles.memberInfo}>
                          <Avatar
                            size={32}
                            icon={<UserOutlined />}
                            src={member.icon}
                          />
                          <div className={styles.memberDetail}>
                            <span className={styles.memberName}>
                              {member.nickname || member.username}
                            </span>
                            <span className={styles.memberRole}>
                              {getRoleName(member.role)}
                            </span>
                          </div>
                        </div>
                      </List.Item>
                    )}
                  />
                ),
              },
            ]}
          />
        </div>

        <div className={styles.footer}>
          <div className={styles.button}>
            <Button
              type="primary"
              icon={<MessageOutlined />}
              onClick={routeToChat}
              block
            >
              发送消息
            </Button>
          </div>
          {isOwner && (
            <div className={styles.button}>
              <Button variant="outlined" color="default" block onClick={() => history.push(`/home/chats/group-settings?groupId=${groupId}`)}>
                群设置
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupInfoPage;
