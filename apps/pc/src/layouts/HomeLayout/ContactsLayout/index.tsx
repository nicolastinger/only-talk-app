import SearchBar from '@/components/SearchBar';
import FriendList from '@/pages/Home/Contacts/components/FriendList';
import GroupList from '@/pages/Home/Contacts/components/GroupList';
import { history, Outlet } from '@umijs/max';
import { Segmented, Splitter } from 'antd';
import { UserOutlined, TeamOutlined } from '@ant-design/icons';
import { useState } from 'react';
import styles from './index.less';

type ContactsTabType = 'friends' | 'groups';

interface SearchResultItem {
  id: string;
  name: string;
  type: 'friend' | 'group';
  data: any;
}

const ContactsLayout = () => {
  const [activeTab, setActiveTab] = useState<ContactsTabType>('friends');

  const handleSearchSelect = (item: SearchResultItem) => {
    if (item.type === 'friend') {
      history.push('/home/contacts/friend?friendId=' + item.id);
    } else {
      history.push('/home/contacts/group?groupId=' + item.id);
    }
  };

  const tabOptions = [
    {
      value: 'friends',
      label: (
        <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <UserOutlined />
          <span>好友</span>
        </div>
      ),
    },
    {
      value: 'groups',
      label: (
        <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <TeamOutlined />
          <span>群组</span>
        </div>
      ),
    },
  ];

  return (
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
      </Splitter.Panel>
      <Splitter.Panel className={styles.right}>
        <Outlet />
      </Splitter.Panel>
    </Splitter>
  );
};

export default ContactsLayout;
