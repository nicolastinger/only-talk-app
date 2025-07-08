'use client';
import { TALK_API } from '@/constants';
import { HttpResponse, ResponseData } from '@/types/backend/httpRust';
import { FriendInfo } from '@/types/user/common';
import { invoke } from '@tauri-apps/api/core';
import React, { Suspense, useEffect } from 'react';
import FriendBox from './components/FriendBox';
import styles from './index.less';

const ContactsPage = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  const [friendInfoList, setFriendInfoList] = React.useState<FriendInfo[]>([]);

  useEffect(() => {
    get_friend_list();
  }, []);

  const get_friend_list = async () => {
    try {
      console.log('get_friend_list');
      const response: HttpResponse = await invoke('post_request', {
        url: TALK_API + '/friend/get_friend',
        body: {},
      });
      if (response.status === 200) {
        const data: ResponseData = JSON.parse(response.body);
        if (data != null) {
          const dataList: FriendInfo[] = data.data;
          console.log('data', dataList);
          setFriendInfoList([...data.data]);
        }
      } else {
        console.log('error', response);
      }
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.header}>朋友列表</div>
        <div className={styles.item} key="chat">
          {friendInfoList.map((item: FriendInfo) => {
            return (
              <div key={item.account}>
                <FriendBox
                  img={item.icon}
                  title={item.username}
                  account={item.account}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.right}>
        <Suspense fallback={<div>加载朋友中...</div>}>{children}</Suspense>
      </div>
    </div>
  );
};

export default ContactsPage;
