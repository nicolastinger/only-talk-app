import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { GroupMemberVo, GroupVo } from '@workspace/types';
import { get_group_info, get_group_members } from '@workspace/services';
import { Layout, Menu } from 'antd';
import { ArrowLeftOutlined, TeamOutlined, SettingOutlined, SafetyOutlined } from '@ant-design/icons';
import { useSearchParams, history } from '@umijs/max';
import { useEffect, useState } from 'react';
import styles from './index.module.less';
import BasicSettings from './BasicSettings';
import MembersManage from './MembersManage';
import ManagementPanel from './ManagementPanel';

const { Sider, Content } = Layout;

const GroupSettingsPage = () => {
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId') || '';
  const { userInfo } = useBearStore();

  const [groupInfo, setGroupInfo] = useState<GroupVo | null>(null);
  const [members, setMembers] = useState<GroupMemberVo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('basic');

  useEffect(() => {
    if (groupId) {
      loadData();
    }
  }, [groupId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [info, memberList] = await Promise.allSettled([
        get_group_info(groupId),
        get_group_members(groupId),
      ]);
      if (info.status === 'fulfilled') {
        setGroupInfo(info.value);
      }
      if (memberList.status === 'fulfilled') {
        setMembers(memberList.value || []);
      }
    } catch (error) {
      console.error('加载群设置失败', error);
    } finally {
      setLoading(false);
    }
  };

  const isOwner = groupInfo?.owner_uuid === userInfo?.uuid;
  const isAdmin = members.some((m) => m.user_id === userInfo?.uuid && m.role >= 1);
  const canManage = isOwner || isAdmin;

  const menuItems = [
    {
      key: 'basic',
      icon: <SettingOutlined />,
      label: '基本设置',
    },
    {
      key: 'members',
      icon: <TeamOutlined />,
      label: '成员管理',
    },
    ...(canManage
      ? [
          {
            key: 'management',
            icon: <SafetyOutlined />,
            label: '群管理',
          },
        ]
      : []),
  ];

  const renderContent = () => {
    if (!groupInfo) return null;

    switch (activeTab) {
      case 'basic':
        return <BasicSettings groupInfo={groupInfo} onUpdate={loadData} />;
      case 'members':
        return <MembersManage groupInfo={groupInfo} members={members} onUpdate={loadData} />;
      case 'management':
        return <ManagementPanel groupInfo={groupInfo} members={members} onUpdate={loadData} />;
      default:
        return <BasicSettings groupInfo={groupInfo} onUpdate={loadData} />;
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        加载中...
      </div>
    );
  }

  return (
    <Layout className={styles.container}>
      <Sider width={220} className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.backBtn} onClick={() => history.back()}>
            <ArrowLeftOutlined />
          </span>
          <span className={styles.groupName}>{groupInfo?.group_name || '群设置'}</span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeTab]}
          items={menuItems}
          onClick={({ key }) => setActiveTab(key)}
        />
      </Sider>
      <Content className={styles.content}>{renderContent()}</Content>
    </Layout>
  );
};

export default GroupSettingsPage;
