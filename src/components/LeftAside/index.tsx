'use client';
import defaultImg from '@/assets/png/default.png';
import LayoutBtn from '@/components/Button/LayoutBtn';
import { useBearStore } from '@/store/store';
import { LayoutBtnProps } from '@/types/user/common';
import {
  MessageOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { history } from '@umijs/max';
import React, { useEffect } from 'react';
import styles from './index.less';

const LeftAside = () => {
  const [topBtnList, setTopBtnList] = React.useState<LayoutBtnProps[]>([]);
  const [bottomBtnList, setBottomBtnList] = React.useState<LayoutBtnProps[]>(
    [],
  );
  const userInfo = useBearStore((state) => state.userInfo);
  const routeToPage = async (url: string) => {
    setTopBtnList((prev) => {
      // 创建新数组保持不可变性
      return prev.map((item) => {
        // 使用展开运算符创建新对象
        if (item.url === url) {
          return { ...item, active: true } as LayoutBtnProps;
        }
        // 建议同时关闭其他激活项
        return { ...item, active: false };
      });
    });

    setBottomBtnList((prev) => {
      // 创建新数组保持不可变性
      return prev.map((item) => {
        // 使用展开运算符创建新对象
        if (item.url === url) {
          return { ...item, active: true } as LayoutBtnProps;
        }
        // 建议同时关闭其他激活项
        return { ...item, active: false };
      });
    });

    history.push(url);
  };

  useEffect(() => {
    setTopBtnList([
      {
        text: '会话列表',
        url: '/home/chats',
        active: true,
        icon: <MessageOutlined style={{ fontSize: '18px' }} />,
      },
      {
        text: '朋友列表',
        url: '/home/contacts',
        active: false,
        icon: <UserOutlined style={{ fontSize: '18px' }} />,
      },
    ]);

    setBottomBtnList([
      {
        text: '动态',
        url: '/home/settings',
        active: false,
        icon: <SettingOutlined style={{ fontSize: '18px' }} />,
      },
    ]);
  }, []);
  const renderBtn = (value: LayoutBtnProps[]) => {
    return (
      <>
        {value.map((item, index) => (
          <div
            onClick={() => routeToPage(item.url)}
            key={index}
            className={styles.iconBtn}
          >
            {LayoutBtn({
              icon: item.icon,
              text: '',
              url: item.url,
              active: item.active,
            })}
          </div>
        ))}
      </>
    );
  };

  return (
    <div className={styles.leftSideBar}>
      <div className={styles.top}>
        <div className={styles.header}></div>
        <div className={styles.icon}>
          <img
            width={100}
            height={100}
            src={userInfo?.icon || defaultImg}
            className={styles.imgItem}
            alt={'icon'}
          />
        </div>
        {renderBtn(topBtnList)}
      </div>
      <div className={styles.bottom}>{renderBtn(bottomBtnList)}</div>
    </div>
  );
};

export { LeftAside };
