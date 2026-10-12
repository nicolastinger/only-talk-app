import SearchBar from '@/components/SearchBar';
import { openNewWindowWithoutClose } from '@/components/Window/OpenWindow';
import CreateGroupModal from '@/pages/Home/Contacts/components/CreateGroupModal';
import FriendList from '@/pages/Home/Contacts/components/FriendList';
import GroupList from '@/pages/Home/Contacts/components/GroupList';
import { TeamOutlined, UserAddOutlined, UserOutlined } from '@ant-design/icons';
import { WebviewOptions } from '@tauri-apps/api/webview';
import type { WindowOptions } from '@tauri-apps/api/window';
import { history, Outlet, useIntl } from '@umijs/max';
import { GroupInfoVo } from '@workspace/types';
import { Segmented, Splitter } from 'antd';
import { useState } from 'react';
import styles from './index.less';

type ContactsTabType = 'friends' | 'groups';

interface SearchResultItem {
  id: string;
  name: string;
  type: 'friend' | 'group';
  data: unknown;
}

const ContactsLayout = () => {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState<ContactsTabType>('friends');
  const [createGroupVisible, setCreateGroupVisible] = useState(false);

  const handleSearchSelect = (item: SearchResultItem) => {
    if (item.type === 'friend') {
      history.push('/home/contacts/friend?friendId=' + item.id);
    } else {
      history.push('/home/contacts/group?groupId=' + item.id);
    }
  };

  // 右下角悬浮按钮: 好友 tab 添加好友, 群组 tab 添加群组
  const handleFabClick = () => {
    if (activeTab === 'friends') {
      openAddFriendWindow();
    } else {
      setCreateGroupVisible(true);
    }
  };

  const openAddFriendWindow = async () => {
    const webviewOptions: WebviewOptions = {
      x: 0,
      y: 0,
      url: `/search/friend`,
      height: 500,
      width: 300,
    };
    const config: WindowOptions = {
      center: true,
    };
    await openNewWindowWithoutClose(
      intl.formatMessage({ id: 'searchBar.addFriend' }),
      webviewOptions,
      config,
    );
  };

  const tabOptions = [
    {
      value: 'friends',
      label: (
        <div
          style={{
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <UserOutlined />
          <span>好友</span>
        </div>
      ),
    },
    {
      value: 'groups',
      label: (
        <div
          style={{
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <TeamOutlined />
          <span>群组</span>
        </div>
      ),
    },
  ];

  const handleCreateGroupSuccess = (group: GroupInfoVo) => {
    setCreateGroupVisible(false);
    history.push('/home/contacts/group?groupId=' + group.group_uuid);
  };

  return (
    <>
      <Splitter>
        <Splitter.Panel
          min="20%"
          max="50%"
          defaultSize="32%"
          className={styles.left}
        >
          <div className={styles.header}>
            <SearchBar onSearchSelect={handleSearchSelect} />
          </div>
          <div className={styles.tabContainer}>
            <Segmented
              value={activeTab}
              onChange={(value) => setActiveTab(value as ContactsTabType)}
              options={tabOptions}
              block
            />
          </div>
          <div className={styles.item} key="contact">
            {activeTab === 'friends' ? <FriendList /> : <GroupList />}
          </div>
          <div className={styles.fab} onClick={handleFabClick}>
            {activeTab === 'friends' ? <UserAddOutlined /> : <TeamOutlined />}
          </div>
        </Splitter.Panel>
        <Splitter.Panel className={styles.right}>
          <Outlet />
        </Splitter.Panel>
      </Splitter>
      <CreateGroupModal
        visible={createGroupVisible}
        onCancel={() => setCreateGroupVisible(false)}
        onSuccess={handleCreateGroupSuccess}
      />
    </>
  );
};

export default ContactsLayout;
