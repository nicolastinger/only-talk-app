import SearchBar from '@/components/SearchBar';
import FriendList from '@/pages/Home/Contacts/components/FriendList';
import { Outlet } from '@umijs/max';
import React from 'react';
import styles from './index.less';

const ContactsLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.header}>
          <SearchBar />
        </div>
        <div className={styles.item} key="chat">
          <FriendList key={'contact'} />
        </div>
      </div>
      <div className={styles.right}>
        <Outlet />
      </div>
    </div>
  );
};

export default ContactsLayout;
