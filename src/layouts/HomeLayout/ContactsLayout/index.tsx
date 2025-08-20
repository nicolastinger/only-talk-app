import { history, Outlet } from '@umijs/max';
import React, { useEffect } from 'react';
import styles from './index.less';
import FriendList from '@/pages/Home/Contacts/components/FriendList';

const ContactsLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.header}>好友列表</div>
        <div className={styles.item} key="chat">
          <FriendList key={"contact"}/>
        </div>
      </div>
      <div className={styles.right}>
        <Outlet />
      </div>
    </div>
  );
};

export default ContactsLayout;